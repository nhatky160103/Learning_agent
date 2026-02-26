import os
import uuid
import logging
from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from config import settings
from database.connection import get_db
from database.models import User, Document
from database.schemas import DocumentResponse, DocumentCreate
from utils.security import get_current_user
from utils.file_validator import sanitize_filename, save_upload_with_validation
from services.document_processor import DocumentProcessor
from services.ai_agents import AIAgentOrchestrator

router = APIRouter()
logger = logging.getLogger(__name__)

UPLOAD_DIR = settings.upload_dir
MAX_UPLOAD_SIZE = settings.max_upload_size_mb * 1024 * 1024
CHUNK_SIZE = settings.upload_chunk_size

os.makedirs(UPLOAD_DIR, exist_ok=True)


# ─── Static routes TRƯỚC dynamic /{document_id} ──────────────────────────────

@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Upload a document."""
    allowed_types = [".pdf", ".docx", ".doc", ".txt", ".md", ".pptx", ".ppt"]

    safe_filename = sanitize_filename(file.filename)
    file_ext = os.path.splitext(safe_filename)[1].lower()

    if file_ext not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"File type not supported. Allowed: {', '.join(allowed_types)}"
        )

    file_id = str(uuid.uuid4())
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}{file_ext}")

    try:
        final_path, file_size, file_hash = await save_upload_with_validation(
            file=file,
            destination=file_path,
            max_size_bytes=MAX_UPLOAD_SIZE,
            chunk_size=CHUNK_SIZE
        )

        existing = await db.execute(
            select(Document).where(
                Document.user_id == current_user.id,
                Document.file_hash == file_hash
            )
        )
        duplicate = existing.scalar_one_or_none()

        if duplicate:
            if os.path.exists(final_path):
                os.remove(final_path)
            raise HTTPException(
                status_code=400,
                detail=f"This file has already been uploaded: {duplicate.title}"
            )

        document = Document(
            user_id=current_user.id,
            title=safe_filename,
            file_path=final_path,
            file_type=file_ext[1:],
            file_size=file_size,
            file_hash=file_hash,
            status="processing"
        )
        db.add(document)
        await db.commit()
        await db.refresh(document)

        logger.info("Document uploaded: doc_id=%s user_id=%s file=%s size=%d",
                    document.id, current_user.id, safe_filename, file_size)

        if not background_tasks:
            raise HTTPException(500, "Background processing unavailable")

        background_tasks.add_task(process_document_background, str(document.id), final_path)
        return document

    except HTTPException:
        raise
    except Exception as e:
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError:
                pass
        logger.exception("Upload failed for user %s: %s", current_user.id, e)
        raise HTTPException(500, "Upload failed. Please try again.")


@router.get("", response_model=List[DocumentResponse])
async def list_documents(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all documents for current user."""
    result = await db.execute(
        select(Document)
        .where(Document.user_id == current_user.id)
        .order_by(Document.created_at.desc())
    )
    return result.scalars().all()


@router.post("/search")
async def search_documents(
    query: str,
    top_k: int = 5,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Semantic search across all user's documents."""
    from services.vector_store import get_vector_store

    try:
        vector_store = get_vector_store()
        results = await vector_store.search(
            query=query,
            top_k=top_k,
            filters={"user_id": str(current_user.id)}
        )
        return {"query": query, "results": results, "count": len(results)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


# ─── Dynamic routes /{document_id} ───────────────────────────────────────────

@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific document."""
    result = await db.execute(
        select(Document)
        .where(Document.id == document_id, Document.user_id == current_user.id)
    )
    document = result.scalar_one_or_none()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    return document


@router.delete("/{document_id}")
async def delete_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a document."""
    result = await db.execute(
        select(Document)
        .where(Document.id == document_id, Document.user_id == current_user.id)
    )
    document = result.scalar_one_or_none()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    if document.file_path and os.path.exists(document.file_path):
        os.remove(document.file_path)

    processor = DocumentProcessor()
    try:
        await processor.delete_document_embeddings(document_id)
    except Exception:
        logger.exception("Failed to delete embeddings for doc_id=%s", document_id)

    await db.delete(document)
    await db.commit()

    return {"message": "Document deleted successfully"}


@router.get("/{document_id}/content")
async def get_document_content(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get document content and concepts."""
    result = await db.execute(
        select(Document)
        .where(Document.id == document_id, Document.user_id == current_user.id)
    )
    document = result.scalar_one_or_none()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    if document.status != "ready":
        raise HTTPException(status_code=400, detail="Document is still processing")

    return {
        "content": document.content_text,
        "summary": document.content_summary,
        "concepts": document.extracted_concepts,
        "chunk_count": document.chunk_count
    }


@router.get("/{document_id}/chunks")
async def get_document_chunks(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Xem tất cả chunks của document."""
    result = await db.execute(
        select(Document)
        .where(Document.id == document_id, Document.user_id == current_user.id)
    )
    document = result.scalar_one_or_none()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    if document.status != "ready":
        raise HTTPException(status_code=400, detail="Document is still processing")

    from services.vector_store import get_vector_store
    try:
        vector_store = get_vector_store()
        chunks = await vector_store.get_document_chunks(document_id)
        return {
            "document_id": document_id,
            "document_title": document.title,
            "total_chunks": len(chunks),
            "chunks": [
                {
                    "chunk_index": c["metadata"].get("chunk_index", i),
                    "section": c["metadata"].get("section", ""),
                    "text": c["text"],
                    "text_length": len(c["text"])
                }
                for i, c in enumerate(chunks)
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve chunks: {str(e)}")


@router.post("/{document_id}/search")
async def search_in_document(
    document_id: str,
    query: str,
    top_k: int = 5,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Search within a specific document."""
    result = await db.execute(
        select(Document)
        .where(Document.id == document_id, Document.user_id == current_user.id)
    )
    document = result.scalar_one_or_none()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    from services.vector_store import get_vector_store
    try:
        vector_store = get_vector_store()
        results = await vector_store.search_by_document(
            document_id=document_id,
            query=query,
            top_k=top_k
        )
        return {
            "document_id": document_id,
            "document_title": document.title,
            "query": query,
            "results": results,
            "count": len(results)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@router.post("/{document_id}/review")
async def review_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """AI-powered deep review tài liệu."""
    result = await db.execute(
        select(Document)
        .where(Document.id == document_id, Document.user_id == current_user.id)
    )
    document = result.scalar_one_or_none()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    if document.status != "ready" or not document.content_text:
        raise HTTPException(status_code=400, detail="Document is not ready for review")

    orchestrator = AIAgentOrchestrator()
    review = await orchestrator.review_document(
        content=document.content_text,
        title=document.title
    )

    return {"document_id": document_id, "document_title": document.title, "review": review}


@router.post("/{document_id}/study-guide")
async def generate_study_guide(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Tạo study guide từ tài liệu."""
    result = await db.execute(
        select(Document)
        .where(Document.id == document_id, Document.user_id == current_user.id)
    )
    document = result.scalar_one_or_none()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    if document.status != "ready" or not document.content_text:
        raise HTTPException(status_code=400, detail="Document is not ready")

    orchestrator = AIAgentOrchestrator()
    guide = await orchestrator.generate_study_guide(
        content=document.content_text,
        title=document.title
    )

    return {"document_id": document_id, "document_title": document.title, "study_guide": guide}


@router.post("/{document_id}/analyze-gaps")
async def analyze_learning_gaps(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Phân tích learning gaps dựa trên topic mastery của user."""
    result = await db.execute(
        select(Document)
        .where(Document.id == document_id, Document.user_id == current_user.id)
    )
    document = result.scalar_one_or_none()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    if document.status != "ready" or not document.content_text:
        raise HTTPException(status_code=400, detail="Document is not ready")

    from database.models import TopicMastery
    mastery_result = await db.execute(
        select(TopicMastery)
        .where(
            TopicMastery.user_id == current_user.id,
            TopicMastery.mastery_level < 0.6
        )
        .order_by(TopicMastery.mastery_level)
        .limit(10)
    )
    weak_topics = [m.topic_name for m in mastery_result.scalars().all()]

    orchestrator = AIAgentOrchestrator()
    analysis = await orchestrator.analyze_document_gaps(
        content=document.content_text,
        user_weak_topics=weak_topics
    )

    return {
        "document_id": document_id,
        "document_title": document.title,
        "user_weak_topics": weak_topics,
        "analysis": analysis
    }


@router.post("/{document_id}/reprocess")
async def reprocess_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Reprocess document và regenerate embeddings."""
    result = await db.execute(
        select(Document)
        .where(Document.id == document_id, Document.user_id == current_user.id)
    )
    document = result.scalar_one_or_none()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    if not document.file_path or not os.path.exists(document.file_path):
        raise HTTPException(status_code=400, detail="Document file not found")

    try:
        processor = DocumentProcessor()
        metadata = {
            "user_id": str(document.user_id),
            "title": document.title,
            "file_type": document.file_type,
            "created_at": document.created_at.isoformat()
        }

        result_data = await processor.reprocess_document(
            document_id=str(document.id),
            file_path=document.file_path,
            metadata=metadata
        )

        document.content_text = result_data.get("content", "")
        document.content_summary = result_data.get("summary", "")
        document.extracted_concepts = result_data.get("concepts", {})
        document.chunk_count = result_data.get("chunk_count", 0)
        document.processed_at = datetime.utcnow()

        await db.commit()
        await db.refresh(document)

        return {"message": "Document reprocessed successfully", "chunk_count": document.chunk_count}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Reprocessing failed: {str(e)}")


# ─── Background task ──────────────────────────────────────────────────────────

async def process_document_background(document_id: str, file_path: str):
    """Background task to process document."""
    from database.connection import async_session

    processor = DocumentProcessor()

    async with async_session() as db:
        result = await db.execute(select(Document).where(Document.id == document_id))
        document = result.scalar_one_or_none()

        if not document:
            return

        try:
            metadata = {
                "user_id": str(document.user_id),
                "title": document.title,
                "file_type": document.file_type,
                "created_at": document.created_at.isoformat()
            }

            result_data = await processor.process(
                file_path,
                document_id=str(document.id),
                metadata=metadata
            )

            document.content_text = result_data.get("content", "")
            document.content_summary = result_data.get("summary", "")
            document.extracted_concepts = result_data.get("concepts", {})
            document.chunk_count = result_data.get("chunk_count", 0)
            document.status = "ready"
            document.processed_at = datetime.utcnow()

        except Exception as e:
            document.status = "error"
            logger.exception("Document processing failed: doc_id=%s file=%s error=%s",
                             document.id, file_path, e)

        await db.commit()
