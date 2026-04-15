"""Unit tests for ScriptEngine — sandboxed Python execution for button actions.

Verifies:
- Tag read/write wrappers round-trip through the TagEngine
- log() accumulates audit entries
- Restricted builtins block dangerous calls (open, eval, __import__)
- Runtime errors surface via the result dict (not raised)
- Timeout enforcement kills runaway scripts
"""

import pytest

from app.services.script_engine import (
    execute_script,
    SAFE_BUILTINS,
    ALLOWED_MODULES,
    ScriptContext,
)
from app.services.tag_engine import TagEngine, TagValue


@pytest.fixture
def engine():
    te = TagEngine()
    te._values["Tank.Level"] = TagValue(1, "Tank.Level", 42.0, "float")
    te._values["Pump.Running"] = TagValue(2, "Pump.Running", False, "bool")
    return te


class TestScriptContext:
    def test_read_tag_returns_current_value(self, engine):
        ctx = ScriptContext(engine)
        assert ctx.read_tag("Tank.Level") == 42.0

    def test_read_missing_tag_returns_none(self, engine):
        ctx = ScriptContext(engine)
        assert ctx.read_tag("No.Such.Tag") is None

    def test_write_tag_updates_engine(self, engine):
        ctx = ScriptContext(engine)
        ctx.write_tag("Tank.Level", 99.5)
        assert engine.get_value("Tank.Level").value == 99.5

    def test_log_accumulates(self, engine):
        ctx = ScriptContext(engine)
        ctx.log("first")
        ctx.log("second")
        assert ctx.audit_entries == ["first", "second"]


class TestExecuteScriptBasics:
    async def test_simple_success(self, engine):
        result = await execute_script(
            "write_tag('Tank.Level', read_tag('Tank.Level') + 1)",
            engine,
        )
        assert result["success"] is True
        assert engine.get_value("Tank.Level").value == 43.0

    async def test_log_surfaces_in_result(self, engine):
        result = await execute_script(
            "log('hello'); log('world')",
            engine,
        )
        assert result["success"] is True
        assert result["audit_entries"] == ["hello", "world"]

    async def test_user_role_bound(self, engine):
        result = await execute_script(
            "log(f'as {user}/{role}')",
            engine,
            user="alice",
            role="engineer",
        )
        assert result["audit_entries"] == ["as alice/engineer"]

    async def test_context_vars_injected(self, engine):
        result = await execute_script(
            "log(str(value * 2))",
            engine,
            context_vars={"value": 5},
        )
        assert result["audit_entries"] == ["10"]

    async def test_allowed_modules_available(self, engine):
        result = await execute_script(
            "log(str(math.floor(3.7))); log(json.dumps({'a': 1}))",
            engine,
        )
        assert result["success"] is True
        assert result["audit_entries"] == ["3", '{"a": 1}']


class TestScriptSandbox:
    async def test_open_blocked(self, engine, tmp_path):
        path = tmp_path / "should_not_exist.txt"
        result = await execute_script(
            f"open({str(path)!r}, 'w').write('pwned')",
            engine,
        )
        assert result["success"] is False
        assert "open" in result["error"].lower() or "not defined" in result["error"].lower()
        assert not path.exists()

    async def test_eval_blocked(self, engine):
        result = await execute_script("eval('1+1')", engine)
        assert result["success"] is False

    async def test_exec_blocked(self, engine):
        result = await execute_script("exec('x=1')", engine)
        assert result["success"] is False

    async def test_import_blocked(self, engine):
        # import statement relies on __import__ in builtins — we don't provide it
        result = await execute_script("import os", engine)
        assert result["success"] is False

    async def test_getattr_not_smuggled_via_str(self, engine):
        """Ensures the sandbox's __builtins__ override is honored — calling
        things like dir()/getattr() should fail because they're not in SAFE_BUILTINS."""
        result = await execute_script("log(str(dir()))", engine)
        # dir() is not in SAFE_BUILTINS, so this should raise NameError
        assert result["success"] is False


class TestScriptErrors:
    async def test_syntax_error_reported(self, engine):
        result = await execute_script("write_tag(", engine)
        assert result["success"] is False
        assert "error" in result

    async def test_runtime_error_reported(self, engine):
        result = await execute_script("1 / 0", engine)
        assert result["success"] is False
        assert "division" in result["error"].lower() or "zero" in result["error"].lower()


class TestScriptTimeout:
    async def test_long_loop_times_out(self, engine, monkeypatch):
        # Shrink timeout so the test is fast
        from app.core import config as config_mod
        monkeypatch.setattr(config_mod.settings, "script_timeout_seconds", 0.1)

        # Busy-wait loop that ignores timing — only the asyncio.wait_for wrapper kills it
        # (Note: because exec runs in a thread, the thread continues briefly after
        # wait_for fires, but execute_script returns the timeout result immediately.)
        result = await execute_script(
            "x = 0\nwhile True:\n    x += 1",
            engine,
        )
        assert result["success"] is False
        assert "timed out" in result["error"].lower() or "timeout" in result["error"].lower()


class TestSafeBuiltinsSurface:
    def test_safe_builtins_exclude_dangerous(self):
        # Sanity check — keep this explicit to catch accidental additions
        for forbidden in ("open", "eval", "exec", "__import__", "compile", "getattr", "setattr"):
            assert forbidden not in SAFE_BUILTINS

    def test_allowed_modules_have_expected_keys(self):
        assert "math" in ALLOWED_MODULES
        assert "json" in ALLOWED_MODULES
        assert "re" in ALLOWED_MODULES
        assert "datetime" in ALLOWED_MODULES
