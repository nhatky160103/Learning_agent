"""
Unit tests for documents endpoints — no DB, no network.
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
from database.models import User, Document


def make_user():
    return User(id=uuid.uuid4(), email="test@example.com", username="testuser")


def make_document(user_id):
    return Document(
        id=uuid.uuid4(),
        user_id=user_id,
        title="Test Doc",
        content_text="Some content",
        status="processing",
    )


class TestListDocuments:
    @pytest.mark.asyncio
    async def test_list_returns_empty(self):
        from routers.documents import list_documents

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute.return_value = mock_result

        user = make_user()
        result = await list_documents(db=mock_db, current_user=user)
        assert result == []

    @pytest.mark.asyncio
    async def test_list_returns_user_documents(self):
        from routers.documents import list_documents

        mock_db = AsyncMock()
        user = make_user()
        doc = make_document(user.id)

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [doc]
        mock_db.execute.return_value = mock_result

        result = await list_documents(db=mock_db, current_user=user)
        assert len(result) == 1
        assert result[0].title == "Test Doc"


class TestGetDocument:
    @pytest.mark.asyncio
    async def test_get_nonexistent_raises_404(self):
        from routers.documents import get_document

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        user = make_user()
        with pytest.raises(HTTPException) as exc:
            await get_document(document_id=uuid.uuid4(), db=mock_db, current_user=user)
        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    async def test_get_existing_document(self):
        from routers.documents import get_document

        mock_db = AsyncMock()
        user = make_user()
        doc = make_document(user.id)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = doc
        mock_db.execute.return_value = mock_result

        result = await get_document(document_id=doc.id, db=mock_db, current_user=user)
        assert result.id == doc.id


class TestDeleteDocument:
    @pytest.mark.asyncio
    async def test_delete_nonexistent_raises_404(self):
        from routers.documents import delete_document

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        user = make_user()
        with pytest.raises(HTTPException) as exc:
            await delete_document(document_id=uuid.uuid4(), db=mock_db, current_user=user)
        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_existing_document(self):
        from routers.documents import delete_document
        from unittest.mock import patch

        mock_db = AsyncMock()
        user = make_user()
        doc = make_document(user.id)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = doc
        mock_db.execute.return_value = mock_result
        mock_db.delete = AsyncMock()
        mock_db.commit = AsyncMock()

        mock_processor = MagicMock()
        mock_processor.delete_document_embeddings = AsyncMock()

        with patch("routers.documents.DocumentProcessor", return_value=mock_processor):
            result = await delete_document(document_id=doc.id, db=mock_db, current_user=user)

        mock_db.delete.assert_called_once_with(doc)
        mock_db.commit.assert_called_once()
