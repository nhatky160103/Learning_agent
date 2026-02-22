"""
Unit tests for quizzes endpoints — no DB, no network.
Uses unittest.mock to patch dependencies.
"""
import sys
import os
import uuid
from unittest.mock import AsyncMock, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-ci")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:x@localhost/x")
os.environ.setdefault("OPENAI_API_KEY", "")
os.environ.setdefault("GOOGLE_API_KEY", "")

import pytest
from fastapi import HTTPException
from database.models import User, Quiz


def make_user():
    return User(id=uuid.uuid4(), email="test@example.com", username="testuser")


def make_quiz(user_id):
    return Quiz(
        id=uuid.uuid4(),
        user_id=user_id,
        title="Test Quiz",
        difficulty="medium",
    )


class TestListQuizzes:
    @pytest.mark.asyncio
    async def test_list_returns_empty(self):
        from routers.quizzes import list_quizzes

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute.return_value = mock_result

        user = make_user()
        result = await list_quizzes(db=mock_db, current_user=user)
        assert result == []

    @pytest.mark.asyncio
    async def test_list_returns_quizzes(self):
        from routers.quizzes import list_quizzes

        mock_db = AsyncMock()
        user = make_user()
        quiz = make_quiz(user.id)

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [quiz]
        mock_db.execute.return_value = mock_result

        result = await list_quizzes(db=mock_db, current_user=user)
        assert len(result) == 1
        assert result[0].title == "Test Quiz"


class TestGetQuiz:
    @pytest.mark.asyncio
    async def test_get_nonexistent_raises_404(self):
        from routers.quizzes import get_quiz

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        user = make_user()
        with pytest.raises(HTTPException) as exc:
            await get_quiz(quiz_id=uuid.uuid4(), db=mock_db, current_user=user)
        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    async def test_get_existing_quiz(self):
        from routers.quizzes import get_quiz

        mock_db = AsyncMock()
        user = make_user()
        quiz = make_quiz(user.id)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = quiz
        mock_db.execute.return_value = mock_result

        result = await get_quiz(quiz_id=quiz.id, db=mock_db, current_user=user)
        assert result.id == quiz.id


class TestDeleteQuiz:
    @pytest.mark.asyncio
    async def test_delete_nonexistent_raises_404(self):
        from routers.quizzes import delete_quiz

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        user = make_user()
        with pytest.raises(HTTPException) as exc:
            await delete_quiz(quiz_id=uuid.uuid4(), db=mock_db, current_user=user)
        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_existing_quiz(self):
        from routers.quizzes import delete_quiz

        mock_db = AsyncMock()
        user = make_user()
        quiz = make_quiz(user.id)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = quiz
        mock_db.execute.return_value = mock_result
        mock_db.delete = AsyncMock()
        mock_db.commit = AsyncMock()

        result = await delete_quiz(quiz_id=quiz.id, db=mock_db, current_user=user)
        mock_db.delete.assert_called_once_with(quiz)
        mock_db.commit.assert_called_once()


class TestGenerateQuizValidation:
    @pytest.mark.asyncio
    async def test_missing_document_raises_404(self):
        from routers.quizzes import generate_quiz
        from database.schemas import GenerateQuizRequest

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        user = make_user()
        request = GenerateQuizRequest(
            title="My Quiz",
            document_id=uuid.uuid4(),
        )

        with pytest.raises(HTTPException) as exc:
            await generate_quiz(request=request, db=mock_db, current_user=user)
        assert exc.value.status_code == 404
