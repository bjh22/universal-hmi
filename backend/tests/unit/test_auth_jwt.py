"""Tests for JWT creation, decoding, and password hashing."""

from datetime import timedelta
from unittest.mock import patch

from freezegun import freeze_time

from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


class TestPasswordHashing:
    def test_hash_different_from_plain(self):
        """Hashed password is different from the original."""
        hashed = hash_password("mypassword")
        assert hashed != "mypassword"

    def test_hash_is_deterministic_salt(self):
        """Two hashes of the same password are different (random salt)."""
        h1 = hash_password("mypassword")
        h2 = hash_password("mypassword")
        assert h1 != h2

    def test_verify_correct_password(self):
        """Correct password verifies successfully."""
        hashed = hash_password("mypassword")
        assert verify_password("mypassword", hashed) is True

    def test_verify_wrong_password(self):
        """Wrong password fails verification."""
        hashed = hash_password("mypassword")
        assert verify_password("wrongpassword", hashed) is False

    def test_verify_empty_password(self):
        """Empty password fails verification."""
        hashed = hash_password("mypassword")
        assert verify_password("", hashed) is False

    def test_hash_empty_password(self):
        """Empty password can be hashed and verified."""
        hashed = hash_password("")
        assert verify_password("", hashed) is True


class TestJWT:
    def test_create_and_decode(self):
        """Token round-trip: create then decode."""
        token = create_access_token({"sub": "42", "role": "designer"})
        payload = decode_access_token(token)
        assert payload is not None
        assert payload["sub"] == "42"
        assert payload["role"] == "designer"
        assert "exp" in payload

    def test_decode_expired_token(self):
        """Expired token returns None."""
        token = create_access_token(
            {"sub": "1", "role": "operator"},
            expires_delta=timedelta(seconds=-1),
        )
        payload = decode_access_token(token)
        assert payload is None

    def test_decode_invalid_token(self):
        """Garbage token returns None."""
        payload = decode_access_token("not.a.valid.token")
        assert payload is None

    def test_decode_tampered_token(self):
        """Tampered token returns None."""
        token = create_access_token({"sub": "1"})
        # Flip a character in the payload section
        parts = token.split(".")
        tampered_payload = parts[1][:-1] + ("A" if parts[1][-1] != "A" else "B")
        tampered = f"{parts[0]}.{tampered_payload}.{parts[2]}"
        payload = decode_access_token(tampered)
        assert payload is None

    def test_custom_expiry(self):
        """Token with custom expiry delta works."""
        token = create_access_token(
            {"sub": "1"},
            expires_delta=timedelta(hours=24),
        )
        payload = decode_access_token(token)
        assert payload is not None
        assert payload["sub"] == "1"

    def test_default_expiry(self):
        """Token with default expiry (from settings) works."""
        token = create_access_token({"sub": "1"})
        payload = decode_access_token(token)
        assert payload is not None
