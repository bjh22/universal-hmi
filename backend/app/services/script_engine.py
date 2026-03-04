"""
Script Engine: Sandboxed Python script execution for button actions.
Restricted to safe builtins and a limited set of modules.
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

ALLOWED_MODULES = {
    "math": math,
    "datetime": datetime,
    "json": json,
    "re": re,
    "collections": {"OrderedDict": OrderedDict},
}

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


_executor = ThreadPoolExecutor(max_workers=2)


async def execute_script(
    script: str,
    tag_engine: TagEngine,
    user: str | None = None,
    role: str | None = None,
    context_vars: dict | None = None,
) -> dict:
    ctx = ScriptContext(tag_engine, user=user, role=role)

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
    exec(script, globals_dict)  # noqa: S102
