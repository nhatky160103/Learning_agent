"""
Unit tests for utils/security.py — password hashing and JWT.

These tests have NO external dependencies (no DB, no network).
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-ci")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:x@localhost/x")

from utils.security import get_password_hash, verify_password, create_access_token, decode_token


class TestPasswordHashing:
    """Tests for bcrypt password hashing."""

    def test_hash_and_verify(self):
        password = "my_secure_password"
        hashed = get_password_hash(password)
        assert hashed != password
        assert verify_password(password, hashed) is True

    def test_wrong_password_fails(self):
        hashed = get_password_hash("correct_password")
        assert verify_password("wrong_password", hashed) is False

    def test_different_hashes_for_same_password(self):
        """bcrypt salts should produce different hashes."""
        h1 = get_password_hash("same")
        h2 = get_password_hash("same")
        assert h1 != h2
        # But both should verify
        assert verify_password("same", h1) is True
        assert verify_password("same", h2) is True

    def test_empty_password(self):
        hashed = get_password_hash("")
        assert verify_password("", hashed) is True
        assert verify_password("notempty", hashed) is False

    def test_long_password_truncated(self):
        """bcrypt has a 72-byte limit; our code truncates."""
        long_pass = "a" * 100
        hashed = get_password_hash(long_pass)
        assert verify_password(long_pass, hashed) is True


class TestJWT:
    """Tests for JWT token creation and decoding."""

    def test_create_and_decode(self):
        user_id = "550e8400-e29b-41d4-a716-446655440000"
        token = create_access_token(data={"sub": user_id})
        decoded = decode_token(token)
        assert decoded == user_id

    def test_invalid_token_returns_none(self):
        assert decode_token("invalid.jwt.token") is None

    def test_empty_token_returns_none(self):
        assert decode_token("") is None

    def test_token_without_sub_returns_none(self):
        token = create_access_token(data={"foo": "bar"})
        assert decode_token(token) is None
