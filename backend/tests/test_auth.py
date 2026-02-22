"""
Unit tests for auth logic — no DB, no network.
Uses unittest.mock to patch dependencies.
"""
import sys
import os
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-ci")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:x@localhost/x")
os.environ.setdefault("OPENAI_API_KEY", "")
os.environ.setdefault("GOOGLE_API_KEY", "")

import pytest
from fastapi import HTTPException
from database.schemas import UserCreate, LoginRequest
from utils.security import get_password_hash, create_access_token, verify_password


# ---------------------
# Password / token helpers
# ---------------------

class TestPasswordHelpers:
    def test_hash_and_verify(self):
        pw = "securepass123"
        hashed = get_password_hash(pw)
        assert verify_password(pw, hashed) is True

    def test_wrong_password(self):
        hashed = get_password_hash("correct")
        assert verify_password("wrong", hashed) is False


class TestTokenHelpers:
    def test_create_token_contains_sub(self):
        user_id = str(uuid.uuid4())
        token = create_access_token(data={"sub": user_id})
        assert isinstance(token, str)
        assert len(token) > 0

    def test_decode_token(self):
        from utils.security import decode_token
        user_id = str(uuid.uuid4())
        token = create_access_token(data={"sub": user_id})
        assert decode_token(token) == user_id


# ---------------------
# Register endpoint logic
# ---------------------

class TestRegisterLogic:
    @pytest.mark.asyncio
    async def test_register_success(self):
        from routers.auth import register

        mock_db = AsyncMock()
        # First query (email check): not found
        # Second query (username check): not found
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result
        mock_db.commit = AsyncMock()
        mock_db.refresh = AsyncMock()

        user_data = UserCreate(
            email="new@example.com",
            username="newuser",
            password="securepass123",
            full_name="New User",
        )

        result = await register(user_data, mock_db)
        assert result.email == "new@example.com"
        mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_register_duplicate_email(self):
        from routers.auth import register
        from database.models import User

        mock_db = AsyncMock()
        existing = User(email="dup@example.com", username="existing")
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = existing
        mock_db.execute.return_value = mock_result

        user_data = UserCreate(
            email="dup@example.com",
            username="newname",
            password="securepass123",
        )

        with pytest.raises(HTTPException) as exc:
            await register(user_data, mock_db)
        assert exc.value.status_code == 400

    @pytest.mark.asyncio
    async def test_register_duplicate_username(self):
        from routers.auth import register
        from database.models import User

        mock_db = AsyncMock()
        existing = User(email="other@example.com", username="takenuser")

        # First call (email): None, second call (username): existing
        none_result = MagicMock()
        none_result.scalar_one_or_none.return_value = None
        taken_result = MagicMock()
        taken_result.scalar_one_or_none.return_value = existing
        mock_db.execute.side_effect = [none_result, taken_result]

        user_data = UserCreate(
            email="unique@example.com",
            username="takenuser",
            password="securepass123",
        )

        with pytest.raises(HTTPException) as exc:
            await register(user_data, mock_db)
        assert exc.value.status_code == 400


# ---------------------
# Login endpoint logic
# ---------------------

class TestLoginLogic:
    @pytest.mark.asyncio
    async def test_login_success(self):
        from routers.auth import login_json
        from database.models import User

        mock_db = AsyncMock()
        user = User(
            id=uuid.uuid4(),
            email="user@example.com",
            password_hash=get_password_hash("correctpass"),
        )
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = user
        mock_db.execute.return_value = mock_result
        mock_db.commit = AsyncMock()

        credentials = LoginRequest(email="user@example.com", password="correctpass")
        result = await login_json(credentials, mock_db)

        assert "access_token" in result.__dict__ or hasattr(result, "access_token")
        assert result.token_type == "bearer"

    @pytest.mark.asyncio
    async def test_login_wrong_password(self):
        from routers.auth import login_json
        from database.models import User

        mock_db = AsyncMock()
        user = User(
            id=uuid.uuid4(),
            email="user@example.com",
            password_hash=get_password_hash("correctpass"),
        )
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = user
        mock_db.execute.return_value = mock_result

        credentials = LoginRequest(email="user@example.com", password="wrongpass")

        with pytest.raises(HTTPException) as exc:
            await login_json(credentials, mock_db)
        assert exc.value.status_code == 401

    @pytest.mark.asyncio
    async def test_login_nonexistent_user(self):
        from routers.auth import login_json

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        credentials = LoginRequest(email="nobody@example.com", password="whatever")

        with pytest.raises(HTTPException) as exc:
            await login_json(credentials, mock_db)
        assert exc.value.status_code == 401
