from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database.connection import get_db
from database.models import User, Document
from database.schemas import (
    ChatRequest, ChatResponse, ExplainConceptRequest, ExplainConceptResponse
)
from utils.security import get_current_user
from services.ai_agents import AIAgentOrchestrator

router = APIRouter()


@router.post("/message", response_model=ChatResponse)
async def chat_message(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Send a chat message to the AI assistant with RAG support."""
    context = ""
    document_filters = None
    
    # Get document context if provided (legacy support)
    if request.document_id:
        result = await db.execute(
            select(Document)
            .where(Document.id == request.document_id, Document.user_id == current_user.id)
        )
        document = result.scalar_one_or_none()
        if document:
            # Use document filter for RAG instead of direct context
            document_filters = {"document_id": str(request.document_id)}
            if document.content_text:
                context = document.content_text[:10000]  # Fallback context
    
    # Get AI response with RAG
    orchestrator = AIAgentOrchestrator(user_id=str(current_user.id))
    response = await orchestrator.chat(
        message=request.message,
        context=context,
        history=request.conversation_history,
        use_rag=True,  # Enable RAG by default
        document_filters=document_filters
    )
    
    return ChatResponse(
        response=response["response"],
        sources=response.get("sources"),
        suggested_actions=response.get("suggested_actions")
    )


@router.post("/explain", response_model=ExplainConceptResponse)
async def explain_concept(
    request: ExplainConceptRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a detailed explanation of a concept."""
    context = ""
    
    # Get document context if provided
    if request.document_id:
        result = await db.execute(
            select(Document)
            .where(Document.id == request.document_id, Document.user_id == current_user.id)
        )
        document = result.scalar_one_or_none()
        if document and document.content_text:
            context = document.content_text[:10000]
    
    # Get explanation
    orchestrator = AIAgentOrchestrator()
    explanation = await orchestrator.explain_concept(
        concept=request.concept,
        level=request.level,
        context=context
    )
    
    return ExplainConceptResponse(
        concept=request.concept,
        explanation=explanation["explanation"],
        examples=explanation.get("examples", []),
        related_concepts=explanation.get("related_concepts", []),
        sources=explanation.get("sources")
    )


@router.post("/suggest-flashcards")
async def suggest_flashcards(
    text: str,
    count: int = 5,
    current_user: User = Depends(get_current_user)
):
    """Suggest flashcards from selected text."""
    orchestrator = AIAgentOrchestrator()
    suggestions = await orchestrator.suggest_flashcards(text, count)
    
    return {"suggestions": suggestions}


@router.post("/summarize")
async def summarize_text(
    text: str,
    current_user: User = Depends(get_current_user)
):
    """Summarize text content."""
    orchestrator = AIAgentOrchestrator()
    summary = await orchestrator.summarize(text)
    
    return {"summary": summary}


from fastapi.responses import StreamingResponse

@router.post("/stream")
async def chat_stream(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Stream chat response with RAG support."""
    context = ""
    document_filters = None
    
    # Get document context if provided
    if request.document_id:
        result = await db.execute(
            select(Document)
            .where(Document.id == request.document_id, Document.user_id == current_user.id)
        )
        document = result.scalar_one_or_none()
        if document:
            document_filters = {"document_id": str(request.document_id)}
            if document.content_text:
                context = document.content_text[:10000]
    
    orchestrator = AIAgentOrchestrator(user_id=str(current_user.id))
    
    return StreamingResponse(
        orchestrator.chat_stream(
            message=request.message,
            context=context,
            history=request.conversation_history,
            use_rag=True,
            document_filters=document_filters
        ),
        media_type="text/event-stream"
    )
