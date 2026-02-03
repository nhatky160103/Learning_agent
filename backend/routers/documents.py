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
            # Prepare metadata for vector store
            metadata = {
                "user_id": str(document.user_id),
                "title": document.title,
                "file_type": document.file_type,
                "created_at": document.created_at.isoformat()
            }
            
            # Process document with vector store integration
            result = await processor.process(
                file_path,
                document_id=str(document.id),
                metadata=metadata
            )
            
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
    
    # Delete from vector store
    processor = DocumentProcessor()
    try:
        await processor.delete_document_embeddings(document_id)
    except Exception as e:
        print(f"Error deleting embeddings: {e}")
    
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


@router.post("/search")
async def search_documents(
    query: str,
    top_k: int = 5,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Semantic search across all user's documents.
    
    Args:
        query: Search query text
        top_k: Number of results to return (default: 5)
    
    Returns:
        List of relevant document chunks with scores and metadata
    """
    from services.vector_store import get_vector_store
    
    try:
        vector_store = get_vector_store()
        
        # Search with user_id filter
        results = await vector_store.search(
            query=query,
            top_k=top_k,
            filters={"user_id": str(current_user.id)}
        )
        
        return {
            "query": query,
            "results": results,
            "count": len(results)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@router.post("/{document_id}/search")
async def search_in_document(
    document_id: str,
    query: str,
    top_k: int = 5,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Search within a specific document.
    
    Args:
        document_id: Document to search within
        query: Search query text
        top_k: Number of results to return
    
    Returns:
        Relevant chunks from the document
    """
    # Verify document ownership
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


@router.post("/{document_id}/reprocess")
async def reprocess_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Reprocess a document and regenerate embeddings.
    Useful after updating embedding models or chunking strategies.
    """
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
        
        # Reprocess with new embeddings
        result = await processor.reprocess_document(
            document_id=str(document.id),
            file_path=document.file_path,
            metadata=metadata
        )
        
        # Update database
        document.content_text = result.get("content", "")
        document.content_summary = result.get("summary", "")
        document.extracted_concepts = result.get("concepts", {})
        document.chunk_count = result.get("chunk_count", 0)
        document.processed_at = datetime.utcnow()
        
        await db.commit()
        await db.refresh(document)
        
        return {
            "message": "Document reprocessed successfully",
            "document": document
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Reprocessing failed: {str(e)}")
