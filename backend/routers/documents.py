import os
import uuid
import aiofiles
from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database.connection import get_db
from database.models import User, Document
from database.schemas import DocumentResponse, DocumentCreate
from utils.security import get_current_user
from services.document_processor import DocumentProcessor

router = APIRouter()

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Upload a document for processing."""
    # Validate file type
    allowed_types = [".pdf", ".docx", ".doc", ".txt", ".md", ".pptx", ".ppt"]
    file_ext = os.path.splitext(file.filename)[1].lower()
    
    if file_ext not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"File type not supported. Allowed: {', '.join(allowed_types)}"
        )
    
    # Save file
    file_id = str(uuid.uuid4())
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}{file_ext}")
    
    async with aiofiles.open(file_path, 'wb') as f:
        content = await file.read()
        await f.write(content)
    
    # Create document record
    document = Document(
        user_id=current_user.id,
        title=file.filename,
        file_path=file_path,
        file_type=file_ext[1:],  # Remove dot
        file_size=len(content),
        status="processing"
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)
    
    # Process document in background
    if background_tasks:
        background_tasks.add_task(process_document_background, str(document.id), file_path)
    
    return document


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
            # Process document
            result = await processor.process(file_path)
            
            document.content_text = result.get("content", "")
            document.content_summary = result.get("summary", "")
            document.extracted_concepts = result.get("concepts", {})
            document.chunk_count = result.get("chunk_count", 0)
            document.status = "ready"
            document.processed_at = datetime.utcnow()
            
        except Exception as e:
            document.status = "error"
            print(f"Error processing document: {e}")
        
        await db.commit()


@router.get("/", response_model=List[DocumentResponse])
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
    
    # Delete file
    if document.file_path and os.path.exists(document.file_path):
        os.remove(document.file_path)
    
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
