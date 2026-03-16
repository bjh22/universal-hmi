"""Tests for TagEngine value coercion."""

import pytest

from app.services.tag_engine import TagEngine


class TestCoerceValue:
    """Test _coerce_value static method."""

    def test_float_from_string(self):
        assert TagEngine._coerce_value("3.14", "float") == 3.14

    def test_float_from_int(self):
        assert TagEngine._coerce_value(5, "float") == 5.0
        assert isinstance(TagEngine._coerce_value(5, "float"), float)

    def test_float_from_float(self):
        assert TagEngine._coerce_value(2.5, "float") == 2.5

    def test_int_from_string(self):
        assert TagEngine._coerce_value("42", "int") == 42

    def test_int_from_float(self):
        assert TagEngine._coerce_value(3.7, "int") == 3

    def test_int_from_int(self):
        assert TagEngine._coerce_value(10, "int") == 10

    def test_bool_from_string_true(self):
        assert TagEngine._coerce_value("true", "bool") is True

    def test_bool_from_string_1(self):
        assert TagEngine._coerce_value("1", "bool") is True

    def test_bool_from_string_yes(self):
        assert TagEngine._coerce_value("yes", "bool") is True

    def test_bool_from_string_false(self):
        assert TagEngine._coerce_value("false", "bool") is False

    def test_bool_from_string_0(self):
        assert TagEngine._coerce_value("0", "bool") is False

    def test_bool_from_string_random(self):
        """Non-truthy strings coerce to False."""
        assert TagEngine._coerce_value("banana", "bool") is False

    def test_bool_from_int(self):
        assert TagEngine._coerce_value(1, "bool") is True
        assert TagEngine._coerce_value(0, "bool") is False

    def test_string_from_int(self):
        assert TagEngine._coerce_value(42, "string") == "42"

    def test_string_from_float(self):
        assert TagEngine._coerce_value(3.14, "string") == "3.14"

    def test_string_from_bool(self):
        assert TagEngine._coerce_value(True, "string") == "True"

    def test_string_from_string(self):
        assert TagEngine._coerce_value("hello", "string") == "hello"

    def test_unknown_type_passthrough(self):
        """Unknown data type returns value unchanged."""
        assert TagEngine._coerce_value("test", "unknown") == "test"

    def test_float_invalid_string_raises(self):
        """Invalid string for float raises ValueError."""
        with pytest.raises(ValueError):
            TagEngine._coerce_value("abc", "float")

    def test_int_invalid_string_raises(self):
        """Invalid string for int raises ValueError."""
        with pytest.raises(ValueError):
            TagEngine._coerce_value("abc", "int")


class TestDeserializeValue:
    """Test _deserialize_value for persisted tag values."""

    def test_bool_true(self):
        assert TagEngine._deserialize_value("true", "bool") is True

    def test_bool_false(self):
        assert TagEngine._deserialize_value("false", "bool") is False

    def test_int(self):
        assert TagEngine._deserialize_value("42", "int") == 42

    def test_float(self):
        assert TagEngine._deserialize_value("3.14", "float") == 3.14

    def test_string(self):
        assert TagEngine._deserialize_value('"hello"', "string") == "hello"

    def test_unknown_passthrough(self):
        assert TagEngine._deserialize_value("42", "unknown") == 42


class TestSerializeValue:
    """Test _serialize_value for persisted tag values."""

    def test_int(self):
        assert TagEngine._serialize_value(42) == "42"

    def test_float(self):
        assert TagEngine._serialize_value(3.14) == "3.14"

    def test_bool(self):
        assert TagEngine._serialize_value(True) == "true"

    def test_string(self):
        assert TagEngine._serialize_value("hello") == '"hello"'
