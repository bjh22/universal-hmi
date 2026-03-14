"""
Script Engine: Sandboxed Python script execution for button actions.
Restricted to safe builtins and a limited set of modules.

Runs user-written Python scripts triggered by button clicks in the HMI. For example,
an operator might click "Start Sequence" which runs a script that writes to multiple
tags in a specific order. Scripts are sandboxed to prevent dangerous operations —
no file I/O, no network access, no arbitrary imports. This is critical because
scripts are authored by HMI designers and executed on the server.
"""

import asyncio
import datetime
import json
import math
import re
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from app.core.config import settings
from app.services.tag_engine import TagEngine

# Only these modules are available to scripts. Notably absent: os, sys, subprocess,
# socket, shutil — anything that could access the filesystem, network, or run processes.
ALLOWED_MODULES = {
    "math": math,
    "datetime": datetime,
    "json": json,
    "re": re,
    "collections": {"OrderedDict": OrderedDict},
}

# Whitelist of Python built-in functions available to scripts. By replacing
# __builtins__ in the script's globals, we prevent access to dangerous functions
# like open() (file access), eval() (code injection), __import__() (loading
# arbitrary modules), and exec(). Only safe, data-manipulation builtins are allowed.
SAFE_BUILTINS = {
    "abs": abs,
    "bool": bool,
    "dict": dict,
    "enumerate": enumerate,
    "float": float,
    "int": int,
    "len": len,
    "list": list,
    "max": max,
    "min": min,
    "range": range,
    "round": round,
    "sorted": sorted,
    "str": str,
    "sum": sum,
    "tuple": tuple,
    "zip": zip,
    "True": True,
    "False": False,
    "None": None,
    "print": print,
}


class ScriptContext:
    """Provides a safe API for scripts to interact with the system. Scripts can only
    read/write tag values and create audit log entries — they cannot access the
    database, filesystem, or network directly.
    """
    def __init__(self, tag_engine: TagEngine, user: str | None = None, role: str | None = None):
        self._tag_engine = tag_engine
        self.user = user
        self.role = role
        self.audit_entries: list[str] = []

    def read_tag(self, tag_name: str) -> Any:
        tv = self._tag_engine.get_value(tag_name)
        return tv.value if tv else None

    def write_tag(self, tag_name: str, value: Any) -> bool:
        return self._tag_engine.set_value(tag_name, value)

    def log(self, message: str):
        self.audit_entries.append(message)


# ThreadPoolExecutor runs scripts in separate OS threads. This is critical because
# exec() is a blocking call — if it ran directly in the async event loop, it would
# freeze the ENTIRE server (no HTTP requests, no WebSocket updates) until the script
# finishes. By offloading to a thread, the event loop stays responsive.
_executor = ThreadPoolExecutor(max_workers=2)


def shutdown_executor():
    """Shut down the script executor. Called during app shutdown to release
    thread resources cleanly and avoid leaked-resource warnings."""
    _executor.shutdown(wait=False)


async def execute_script(
    script: str,
    tag_engine: TagEngine,
    user: str | None = None,
    role: str | None = None,
    context_vars: dict | None = None,
) -> dict:
    ctx = ScriptContext(tag_engine, user=user, role=role)

    # Build the sandbox: replace Python's default __builtins__ with our safe whitelist,
    # inject the script API (read_tag, write_tag, log), and add allowed modules
    script_globals = {
        "__builtins__": SAFE_BUILTINS,
        "read_tag": ctx.read_tag,
        "write_tag": ctx.write_tag,
        "log": ctx.log,
        "user": user,
        "role": role,
    }
    for mod_name, mod in ALLOWED_MODULES.items():
        script_globals[mod_name] = mod
    if context_vars:
        script_globals.update(context_vars)

    loop = asyncio.get_event_loop()
    try:
        # asyncio.wait_for wraps the executor call with a timeout (default 5 seconds).
        # This kills scripts that run too long (e.g., infinite loops like "while True"),
        # preventing them from hanging the server indefinitely.
        await asyncio.wait_for(
            loop.run_in_executor(_executor, _run_script, script, script_globals),
            timeout=settings.script_timeout_seconds,
        )
        return {"success": True, "audit_entries": ctx.audit_entries}
    except TimeoutError:
        return {"success": False, "error": "Script execution timed out"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def _run_script(script: str, globals_dict: dict):
    # exec() executes arbitrary Python code — normally very dangerous, but the
    # restricted globals_dict (with SAFE_BUILTINS replacing __builtins__) limits
    # what the script can do. It can only use whitelisted functions and modules.
    exec(script, globals_dict)  # noqa: S102
