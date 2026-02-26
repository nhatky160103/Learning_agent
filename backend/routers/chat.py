from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
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


# ─── Static routes TRƯỚC ─────────────────────────────────────────────────────

@router.get("/search")
async def search_documents(
    q: str = Query(..., description="Search query"),
    document_id: Optional[UUID] = Query(default=None),
    mode: str = Query(default="hybrid", description="hybrid | semantic | multi_query"),
    top_k: int = Query(default=5, ge=1, le=20),
    current_user: User = Depends(get_current_user)
):
    """Search across user's documents với semantic/hybrid/multi-query."""
    from services.vector_store import get_vector_store

    try:
        vector_store = get_vector_store()
    except Exception:
        raise HTTPException(status_code=503, detail="Search service unavailable")

    filters = {"user_id": str(current_user.id)}
    if document_id:
        filters["document_id"] = str(document_id)

    try:
        if mode == "hybrid":
            results = await vector_store.hybrid_search(q, top_k=top_k, filters=filters)
        elif mode == "multi_query":
            results = await vector_store.multi_query_search(q, top_k=top_k, filters=filters)
        else:
            results = await vector_store.search(q, top_k=top_k, filters=filters, use_reranking=True)

        formatted = []
        for i, r in enumerate(results, 1):
            metadata = r.get("metadata", {})
            formatted.append({
                "rank": i,
                "document_id": metadata.get("document_id"),
                "document_title": metadata.get("title", "Unknown"),
                "section": metadata.get("section", ""),
                "text": r["text"],
                "relevance_score": round(r.get("score", 0), 3),
                "chunk_index": metadata.get("chunk_index", 0)
            })

        return {"query": q, "mode": mode, "total_results": len(formatted), "results": formatted}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@router.post("/message", response_model=ChatResponse)
async def chat_message(
    request: ChatRequest,
    search_mode: str = Query(default="hybrid"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Send a chat message with RAG support."""
    context = ""
    document_filters = None

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
    response = await orchestrator.chat(
        message=request.message,
        context=context,
        history=request.conversation_history,
        use_rag=True,
        document_filters=document_filters,
        search_mode=search_mode
    )

    return ChatResponse(
        response=response["response"],
        sources=response.get("sources"),
        suggested_actions=response.get("suggested_actions")
    )


@router.post("/stream")
async def chat_stream(
    request: ChatRequest,
    search_mode: str = Query(default="hybrid"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Stream chat response với RAG support."""
    context = ""
    document_filters = None

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
            document_filters=document_filters,
            search_mode=search_mode
        ),
        media_type="text/event-stream"
    )


@router.post("/explain", response_model=ExplainConceptResponse)
async def explain_concept(
    request: ExplainConceptRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Explain a concept với RAG từ documents của user."""
    context = ""

    if request.document_id:
        result = await db.execute(
            select(Document)
            .where(Document.id == request.document_id, Document.user_id == current_user.id)
        )
        document = result.scalar_one_or_none()
        if document and document.content_text:
            context = document.content_text[:10000]

    orchestrator = AIAgentOrchestrator(user_id=str(current_user.id))
    explanation = await orchestrator.explain_concept(
        concept=request.concept,
        level=request.level,
        context=context,
        use_rag=not bool(context)
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
