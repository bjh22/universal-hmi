"""
OPC UA protocol driver using asyncua.

Supports automatic address prefix detection for CODESYS-style servers where
the node ID prefix (containing the runtime name) varies between machines but
the variable path remains the same.

Browsing supports both full-tree and lazy (one-level) modes with caching.
"""

import asyncio
import logging
import re
import time
from typing import Any

from app.drivers.base import ProtocolDriver

logger = logging.getLogger(__name__)

# Pattern: ns=<N>;s=|var|<runtime>.Application.
_CODESYS_APP_RE = re.compile(r"^(ns=\d+;s=\|var\|.+?\.Application\.)")

# Concurrency limit for parallel node attribute reads
_MAX_CONCURRENT_READS = 20


class OpcuaDriver(ProtocolDriver):
    def __init__(self, name: str, config: dict):
        super().__init__(name, config)
        self._client = None
        self._address_prefix: str | None = config.get("address_prefix")
        # Browse cache: maps node_id -> (timestamp, result_list)
        self._browse_cache: dict[str, tuple[float, list[dict]]] = {}
        self._browse_cache_ttl: float = config.get("browse_cache_ttl", 30.0)
        # Cache for variant types keyed by resolved address, avoids a round-trip on every write
        self._variant_type_cache: dict[str, Any] = {}

    @property
    def address_prefix(self) -> str | None:
        return self._address_prefix

    async def connect(self):
        try:
            from asyncua import Client

            url = self.config.get("endpoint", "opc.tcp://localhost:4840")
            self._client = Client(url=url)

            security_policy = self.config.get("security_policy")
            if security_policy:
                certificate = self.config.get("certificate")
                private_key = self.config.get("private_key")
                if certificate and private_key:
                    await self._client.set_security_string(
                        f"{security_policy},{certificate},{private_key}"
                    )

            username = self.config.get("username")
            password = self.config.get("password")
            if username and password:
                self._client.set_user(username)
                self._client.set_password(password)

            timeout = self.config.get("connect_timeout", 10)
            await asyncio.wait_for(self._client.connect(), timeout=timeout)
            self.connected = True
            self._browse_cache.clear()
            self._variant_type_cache.clear()
        except Exception:
            self.connected = False
            raise

    async def disconnect(self):
        if self._client:
            try:
                await self._client.disconnect()
            except Exception:
                pass
        self.connected = False
        self._browse_cache.clear()
        self._variant_type_cache.clear()

    def _resolve_address(self, address: str) -> str:
        """Prepend address_prefix to relative addresses."""
        if not self._address_prefix or address.startswith("ns="):
            return address
        return f"{self._address_prefix}{address}"

    async def read_tag(self, address: str) -> Any:
        if not self._client:
            return None
        node = self._client.get_node(self._resolve_address(address))
        return await node.read_value()

    async def write_tag(self, address: str, value: Any) -> bool:
        if not self._client:
            return False
        from asyncua import ua

        resolved = self._resolve_address(address)
        node = self._client.get_node(resolved)
        # Use cached variant type to avoid an extra round-trip on every write
        variant_type = self._variant_type_cache.get(resolved)
        if variant_type is None:
            variant_type = await node.read_data_type_as_variant_type()
            self._variant_type_cache[resolved] = variant_type
        await node.write_value(ua.DataValue(ua.Variant(value, variant_type)))
        return True

    async def read_tags(self, addresses: list[str]) -> dict[str, Any]:
        result = {}
        if not self._client or not addresses:
            return result
        # Build node list and use bulk read (single OPC UA ReadRequest)
        nodes = [self._client.get_node(self._resolve_address(addr)) for addr in addresses]
        try:
            values = await self._client.read_values(nodes)
            for addr, val in zip(addresses, values):
                result[addr] = val
        except Exception:
            # Fallback: if bulk read fails (e.g. one bad node aborts the batch),
            # read individually so good nodes still return values
            for addr, node in zip(addresses, nodes):
                try:
                    result[addr] = await node.read_value()
                except Exception:
                    result[addr] = None
        return result

    async def detect_address_prefix(self) -> str | None:
        """Detect CODESYS-style address prefix by browsing for variable nodes.

        Looks for node IDs matching: ns=N;s=|var|<runtime>.Application.<path>
        Returns the prefix up to and including '.Application.' or None.
        """
        if not self._client:
            return None
        try:
            root = self._client.get_objects_node()
            prefix = await self._find_prefix(root, depth=0, max_depth=8)
            if prefix:
                self._address_prefix = prefix
                logger.info(f"Detected OPC UA address prefix for {self.name}: {prefix}")
            else:
                logger.debug(f"No CODESYS address prefix found for {self.name}")
            return prefix
        except Exception as e:
            logger.debug(f"Address prefix detection failed for {self.name}: {e}")
            return None

    async def _find_prefix(self, node, depth: int, max_depth: int) -> str | None:
        """Recursively browse to find a CODESYS variable node and extract prefix."""
        if depth >= max_depth:
            return None
        try:
            children = await node.get_children()
            for child in children:
                cls = await child.read_node_class()
                if cls.value == 2:  # Variable
                    node_id = child.nodeid.to_string()
                    m = _CODESYS_APP_RE.match(node_id)
                    if m:
                        return m.group(1)
                elif cls.value == 1:  # Object — recurse
                    result = await self._find_prefix(child, depth + 1, max_depth)
                    if result:
                        return result
        except Exception:
            pass
        return None

    # ── Full tree browse (original behavior, now parallelized) ──

    async def browse(self) -> list[dict]:
        if not self._client:
            return []
        tags: list[dict] = []
        root = self._client.get_objects_node()
        await self._browse_recursive(root, tags, depth=0, max_depth=10)
        # Add relative_address for tags with a detected prefix
        if self._address_prefix:
            for tag in tags:
                node_id = tag.get("node_id", "")
                if node_id.startswith(self._address_prefix):
                    tag["relative_address"] = node_id[len(self._address_prefix):]
        return tags

    async def _browse_recursive(self, node, tags: list, depth: int, max_depth: int):
        if depth >= max_depth:
            return
        try:
            children = await node.get_children()
            # Read node classes in parallel batches
            child_classes = await self._read_node_classes_parallel(children)

            # Separate variables and objects
            variables = []
            objects = []
            for child, cls_value in zip(children, child_classes):
                if cls_value == 2:
                    variables.append(child)
                elif cls_value == 1:
                    objects.append(child)

            # Read variable attributes in parallel
            if variables:
                var_infos = await self._read_variable_attrs_parallel(variables)
                tags.extend(var_infos)

            # Recurse into objects in parallel
            if objects:
                child_tags: list[list[dict]] = [[] for _ in objects]
                tasks = [
                    self._browse_recursive(obj, child_tags[i], depth + 1, max_depth)
                    for i, obj in enumerate(objects)
                ]
                await asyncio.gather(*tasks)
                for ct in child_tags:
                    tags.extend(ct)
        except Exception:
            pass

    async def _read_node_classes_parallel(self, nodes: list) -> list[int]:
        """Read node classes for a list of nodes with concurrency limiting."""
        sem = asyncio.Semaphore(_MAX_CONCURRENT_READS)

        async def read_class(node):
            async with sem:
                try:
                    cls = await node.read_node_class()
                    return cls.value
                except Exception:
                    return -1

        return await asyncio.gather(*[read_class(n) for n in nodes])

    async def _read_variable_attrs_parallel(self, variables: list) -> list[dict]:
        """Read display_name and data_type for variable nodes in parallel."""
        sem = asyncio.Semaphore(_MAX_CONCURRENT_READS)

        async def read_attrs(node):
            async with sem:
                try:
                    display_name, data_type = await asyncio.gather(
                        node.read_display_name(),
                        node.read_data_type_as_variant_type(),
                    )
                    return {
                        "node_id": node.nodeid.to_string(),
                        "name": display_name.Text,
                        "data_type": str(data_type),
                    }
                except Exception:
                    return None

        results = await asyncio.gather(*[read_attrs(v) for v in variables])
        return [r for r in results if r is not None]

    # ── Lazy browse (one level at a time, cached) ──

    async def browse_level(self, parent_node_id: str | None = None) -> list[dict]:
        """Browse a single level of the OPC UA tree.

        Args:
            parent_node_id: Node ID to browse children of.
                           None means browse from the Objects folder root.

        Returns:
            List of dicts with keys: node_id, name, node_class ("variable" or "object"),
            data_type (for variables), relative_address (if prefix detected),
            has_children (for objects).
        """
        if not self._client:
            return []

        cache_key = parent_node_id or "__root__"
        cached = self._browse_cache.get(cache_key)
        if cached:
            ts, result = cached
            if time.monotonic() - ts < self._browse_cache_ttl:
                return result

        if parent_node_id:
            node = self._client.get_node(parent_node_id)
        else:
            node = self._client.get_objects_node()

        try:
            children = await node.get_children()
        except Exception:
            return []

        # Read all node classes in parallel
        child_classes = await self._read_node_classes_parallel(children)

        variables = []
        objects = []
        for child, cls_value in zip(children, child_classes):
            if cls_value == 2:
                variables.append(child)
            elif cls_value == 1:
                objects.append(child)

        result: list[dict] = []

        # Read variable attributes in parallel
        if variables:
            var_infos = await self._read_variable_attrs_parallel(variables)
            for info in var_infos:
                info["node_class"] = "variable"
                if self._address_prefix:
                    nid = info.get("node_id", "")
                    if nid.startswith(self._address_prefix):
                        info["relative_address"] = nid[len(self._address_prefix):]
                result.append(info)

        # Read object display names in parallel
        if objects:
            sem = asyncio.Semaphore(_MAX_CONCURRENT_READS)

            async def read_object_info(obj_node):
                async with sem:
                    try:
                        display_name = await obj_node.read_display_name()
                        # Check if it has children (for UI expand indicator)
                        try:
                            obj_children = await obj_node.get_children()
                            has_children = len(obj_children) > 0
                        except Exception:
                            has_children = False
                        return {
                            "node_id": obj_node.nodeid.to_string(),
                            "name": display_name.Text,
                            "node_class": "object",
                            "has_children": has_children,
                        }
                    except Exception:
                        return None

            obj_results = await asyncio.gather(*[read_object_info(o) for o in objects])
            result.extend([r for r in obj_results if r is not None])

        # Sort: objects first (folders), then variables (leaves), alphabetical
        result.sort(key=lambda x: (0 if x.get("node_class") == "object" else 1, x.get("name", "").lower()))

        # Cache result
        self._browse_cache[cache_key] = (time.monotonic(), result)
        return result

    def clear_browse_cache(self):
        """Clear the browse cache."""
        self._browse_cache.clear()
