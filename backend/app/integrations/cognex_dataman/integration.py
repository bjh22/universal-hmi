"""
Cognex DataMan barcode reader integration.

Communicates over TCP using the DMCC (DataMan Control Commands) protocol.
Listens for barcode results pushed after external triggers and retrieves
captured images via binary transfer.
"""

import asyncio
import logging
import struct
from datetime import datetime, timezone

from app.integrations.base import IntegrationBase
from app.integrations.cognex_dataman.router import create_router
from app.services.tag_engine import TagEngine

logger = logging.getLogger(__name__)

# DMCC header/footer
DMCC_HEADER = "||>"
DMCC_TERM = "\r\n"

# Image header size: 4 bytes file_size + 4 bytes file_type + 128 bytes filename
IMAGE_HEADER_SIZE = 136

# Map file_type uint32 to MIME type
IMAGE_TYPE_MAP = {
    0: "image/bmp",
    1: "image/jpeg",
    2: "image/png",
}


class CognexDataManIntegration(IntegrationBase):
    type_name = "cognex_dataman"
    display_name = "Cognex DataMan"
    description = "Cognex DataMan barcode reader. Displays scan results and captured images via DMCC protocol."
    default_config = {
        "host": "192.168.1.50",
        "port": 23,
        "poll_interval_seconds": 10,
        "tag_prefix": "dataman",
    }

    TAG_DEFINITIONS = [
        {"suffix": "status", "data_type": "string", "description": "Camera connection status"},
        {"suffix": "last_result", "data_type": "string", "description": "Last barcode result"},
        {"suffix": "last_result_time", "data_type": "string", "description": "Time of last barcode read"},
        {"suffix": "total_reads", "data_type": "int", "description": "Total barcode reads"},
        {"suffix": "device_type", "data_type": "string", "description": "Camera model"},
        {"suffix": "firmware", "data_type": "string", "description": "Firmware version"},
    ]

    def __init__(self, name: str, config: dict, tag_engine: TagEngine):
        super().__init__(name, config, tag_engine)
        self._listen_task: asyncio.Task | None = None
        self._reader: asyncio.StreamReader | None = None
        self._writer: asyncio.StreamWriter | None = None
        self._lock = asyncio.Lock()
        self._total_reads = 0
        self._last_image_bytes: bytes | None = None
        self._last_image_mime: str = "image/jpeg"

    @property
    def _prefix(self) -> str:
        return self.config.get("tag_prefix", "dataman")

    def get_tag_definitions(self) -> list[dict]:
        prefix = self._prefix
        return [
            {
                "name": f"{prefix}.{td['suffix']}",
                "data_type": td["data_type"],
                "description": td["description"],
                "access_mode": "read",
            }
            for td in self.TAG_DEFINITIONS
        ]

    def get_router(self):
        return create_router(self)

    async def start(self):
        host = self.config.get("host", "192.168.1.50")
        port = int(self.config.get("port", 23))
        prefix = self._prefix

        try:
            self._reader, self._writer = await asyncio.wait_for(
                asyncio.open_connection(host, port), timeout=5.0
            )
            self.connected = True
            self.status_message = None
            self._set_tag(f"{prefix}.status", "Connected")
            self._set_tag(f"{prefix}.total_reads", 0)
            logger.info(f"Connected to Cognex DataMan at {host}:{port}")

            # Enable auto-push of results on external trigger
            await self._send_command("SET RESULT.CODE-ON")

            # Query device info once
            await self._query_device_info()

            # Start listening for incoming results
            self._listen_task = asyncio.create_task(self._listen_loop())

        except Exception as e:
            self.connected = False
            self.status_message = str(e)
            self._set_tag(f"{prefix}.status", f"Error: {e}")
            self._listen_task = asyncio.create_task(self._reconnect_loop())

    async def stop(self):
        prefix = self._prefix
        if self._listen_task:
            self._listen_task.cancel()
            try:
                await self._listen_task
            except asyncio.CancelledError:
                pass
            self._listen_task = None
        # Try to disable auto-push before disconnect
        if self._writer:
            try:
                await self._send_command("SET RESULT.CODE-OFF")
            except Exception:
                pass
        await self._disconnect()
        self._set_tag(f"{prefix}.status", "Stopped")

    async def _disconnect(self):
        if self._writer:
            try:
                self._writer.close()
                await self._writer.wait_closed()
            except Exception:
                pass
            self._writer = None
            self._reader = None
        self.connected = False

    async def _reconnect_loop(self):
        """Retry connection with exponential backoff."""
        delay = 2
        host = self.config.get("host", "192.168.1.50")
        port = int(self.config.get("port", 23))
        prefix = self._prefix

        while True:
            await asyncio.sleep(delay)
            try:
                self._reader, self._writer = await asyncio.wait_for(
                    asyncio.open_connection(host, port), timeout=5.0
                )
                self.connected = True
                self.status_message = None
                self._set_tag(f"{prefix}.status", "Connected")
                logger.info(f"Reconnected to Cognex DataMan at {host}:{port}")

                await self._send_command("SET RESULT.CODE-ON")
                await self._query_device_info()

                # Switch to listen loop
                self._listen_task = asyncio.create_task(self._listen_loop())
                return
            except asyncio.CancelledError:
                raise
            except Exception:
                delay = min(delay * 2, 60)
                self._set_tag(f"{prefix}.status", "Reconnecting...")

    async def _send_command(self, command: str) -> str:
        """Send a DMCC command and read the response line."""
        async with self._lock:
            if not self._writer or not self._reader:
                raise ConnectionError("Not connected to camera")
            msg = f"{DMCC_HEADER}{command}{DMCC_TERM}"
            self._writer.write(msg.encode())
            await self._writer.drain()
            data = await asyncio.wait_for(self._reader.readline(), timeout=5.0)
            return data.decode(errors="replace").strip()

    async def _query_device_info(self):
        """Query device type and firmware version."""
        prefix = self._prefix
        try:
            device_type = await self._send_command("GET DEVICE.TYPE")
            self._set_tag(f"{prefix}.device_type", device_type)
        except Exception as e:
            logger.debug(f"Failed to get device type: {e}")

        try:
            firmware = await self._send_command("GET DEVICE.FIRMWARE-VER")
            self._set_tag(f"{prefix}.firmware", firmware)
        except Exception as e:
            logger.debug(f"Failed to get firmware version: {e}")

    async def _listen_loop(self):
        """Continuously read from TCP stream for pushed barcode results."""
        prefix = self._prefix
        interval = self.config.get("poll_interval_seconds", 10)

        while True:
            try:
                # Use a timeout so we can periodically check for connection health
                try:
                    data = await asyncio.wait_for(
                        self._reader.readline(), timeout=float(interval)
                    )
                except asyncio.TimeoutError:
                    # No data received — connection still alive, just no triggers
                    continue

                if not data:
                    # Connection closed by remote
                    raise ConnectionError("Connection closed by camera")

                line = data.decode(errors="replace").strip()
                if not line:
                    continue

                # DMCC command responses start with ||> — skip them in listen loop
                if line.startswith(DMCC_HEADER):
                    continue

                # This is a barcode result pushed by the camera
                self._total_reads += 1
                now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                self._set_tag(f"{prefix}.last_result", line)
                self._set_tag(f"{prefix}.last_result_time", now)
                self._set_tag(f"{prefix}.total_reads", self._total_reads)
                logger.info(f"DataMan read #{self._total_reads}: {line}")

                # Fetch image after each successful read
                try:
                    await self._fetch_image()
                except Exception as e:
                    logger.debug(f"Failed to fetch image after read: {e}")

            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.warning(f"DataMan listen error: {e}")
                self.connected = False
                self.status_message = str(e)
                self._set_tag(f"{prefix}.status", f"Error: {e}")
                await self._disconnect()
                self._listen_task = asyncio.create_task(self._reconnect_loop())
                return

    async def _fetch_image(self):
        """Retrieve last captured image via DMCC binary transfer."""
        async with self._lock:
            if not self._writer or not self._reader:
                raise ConnectionError("Not connected to camera")

            msg = f"{DMCC_HEADER}GET IMAGE{DMCC_TERM}"
            self._writer.write(msg.encode())
            await self._writer.drain()

            # Read 136-byte binary header
            header = await asyncio.wait_for(
                self._reader.readexactly(IMAGE_HEADER_SIZE), timeout=10.0
            )

            file_size = struct.unpack_from("<I", header, 0)[0]
            file_type = struct.unpack_from("<I", header, 4)[0]

            if file_size == 0:
                return

            # Read image body
            image_data = await asyncio.wait_for(
                self._reader.readexactly(file_size), timeout=30.0
            )

            self._last_image_bytes = image_data
            self._last_image_mime = IMAGE_TYPE_MAP.get(file_type, "image/jpeg")
            logger.debug(f"DataMan image received: {file_size} bytes, type={file_type}")

    # --- Public methods called by the router ---

    async def get_full_status(self) -> dict:
        """Return full status dict for the API."""
        prefix = self._prefix
        tv = self._tag_engine.get_value

        def _val(suffix: str):
            v = tv(f"{prefix}.{suffix}")
            return v.value if v else None

        return {
            "connected": self.connected,
            "status": _val("status"),
            "last_result": _val("last_result"),
            "last_result_time": _val("last_result_time"),
            "total_reads": _val("total_reads"),
            "device_type": _val("device_type"),
            "firmware": _val("firmware"),
            "has_image": self._last_image_bytes is not None,
        }

    def get_last_image(self) -> tuple[bytes | None, str]:
        """Return (image_bytes, mime_type) or (None, ...)."""
        return self._last_image_bytes, self._last_image_mime

    async def trigger(self):
        """Send a manual trigger command."""
        await self._send_command("TRIGGER ON")
        await asyncio.sleep(0.5)
        await self._send_command("TRIGGER OFF")
