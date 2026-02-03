from datetime import datetime
from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from database.connection import get_db
from database.models import User, Document, Deck, Flashcard, FlashcardReview
from database.schemas import (
    DeckCreate, DeckUpdate, DeckResponse, DeckWithCards,
    FlashcardCreate, FlashcardUpdate, FlashcardResponse,
    FlashcardReviewRequest, FlashcardReviewResponse,
    GenerateFlashcardsRequest
)
from utils.security import get_current_user
from services.flashcard_generator import FlashcardGenerator
from services.spaced_repetition import SpacedRepetitionService

router = APIRouter()


# ==================== Deck Endpoints ====================
@router.post("/decks", response_model=DeckResponse)
async def create_deck(
    deck_data: DeckCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new flashcard deck."""
    deck = Deck(
        user_id=current_user.id,
        name=deck_data.name,
        description=deck_data.description,
        document_id=deck_data.document_id,
        tags=deck_data.tags
    )
    db.add(deck)
    await db.commit()
    await db.refresh(deck)
    return deck


@router.get("/decks", response_model=List[DeckResponse])
async def list_decks(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all decks for current user."""
    result = await db.execute(
        select(Deck)
        .where(Deck.user_id == current_user.id)
        .order_by(Deck.updated_at.desc())
    )
    return result.scalars().all()


@router.get("/decks/{deck_id}", response_model=DeckWithCards)
async def get_deck(
    deck_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a deck with all its flashcards."""
    # Use eager loading to avoid lazy loading issues in async context
    result = await db.execute(
        select(Deck)
        .options(selectinload(Deck.flashcards))
        .where(Deck.id == deck_id, Deck.user_id == current_user.id)
    )
    deck = result.scalar_one_or_none()
    
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    
    return deck


@router.put("/decks/{deck_id}", response_model=DeckResponse)
async def update_deck(
    deck_id: str,
    deck_data: DeckUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a deck."""
    result = await db.execute(
        select(Deck)
        .where(Deck.id == deck_id, Deck.user_id == current_user.id)
    )
    deck = result.scalar_one_or_none()
    
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    
    for field, value in deck_data.model_dump(exclude_unset=True).items():
        setattr(deck, field, value)
    
    deck.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(deck)
    
    return deck


@router.delete("/decks/{deck_id}")
async def delete_deck(
    deck_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a deck and all its flashcards."""
    result = await db.execute(
        select(Deck)
        .where(Deck.id == deck_id, Deck.user_id == current_user.id)
    )
    deck = result.scalar_one_or_none()
    
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    
    await db.delete(deck)
    await db.commit()
    
    return {"message": "Deck deleted successfully"}


# ==================== Flashcard Endpoints ====================
@router.post("/cards", response_model=FlashcardResponse)
async def create_flashcard(
    card_data: FlashcardCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new flashcard."""
    # Verify deck ownership
    result = await db.execute(
        select(Deck)
        .where(Deck.id == card_data.deck_id, Deck.user_id == current_user.id)
    )
    deck = result.scalar_one_or_none()
    
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    
    flashcard = Flashcard(
        deck_id=card_data.deck_id,
        question=card_data.question,
        answer=card_data.answer,
        hint=card_data.hint,
        difficulty=card_data.difficulty,
        tags=card_data.tags,
        next_review_date=datetime.utcnow()
    )
    db.add(flashcard)
    
    # Update deck card count
    deck.card_count += 1
    
    await db.commit()
    await db.refresh(flashcard)
    
    return flashcard


@router.get("/cards/{card_id}", response_model=FlashcardResponse)
async def get_flashcard(
    card_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific flashcard."""
    result = await db.execute(
        select(Flashcard)
        .join(Deck)
        .where(Flashcard.id == card_id, Deck.user_id == current_user.id)
    )
    card = result.scalar_one_or_none()
    
    if not card:
        raise HTTPException(status_code=404, detail="Flashcard not found")
    
    return card


@router.put("/cards/{card_id}", response_model=FlashcardResponse)
async def update_flashcard(
    card_id: str,
    card_data: FlashcardUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a flashcard."""
    result = await db.execute(
        select(Flashcard)
        .join(Deck)
        .where(Flashcard.id == card_id, Deck.user_id == current_user.id)
    )
    card = result.scalar_one_or_none()
    
    if not card:
        raise HTTPException(status_code=404, detail="Flashcard not found")
    
    for field, value in card_data.model_dump(exclude_unset=True).items():
        setattr(card, field, value)
    
    card.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(card)
    
    return card


@router.delete("/cards/{card_id}")
async def delete_flashcard(
    card_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a flashcard."""
    result = await db.execute(
        select(Flashcard)
        .join(Deck)
        .where(Flashcard.id == card_id, Deck.user_id == current_user.id)
    )
    card = result.scalar_one_or_none()
    
    if not card:
        raise HTTPException(status_code=404, detail="Flashcard not found")
    
    # Update deck card count
    deck_result = await db.execute(select(Deck).where(Deck.id == card.deck_id))
    deck = deck_result.scalar_one()
    deck.card_count = max(0, deck.card_count - 1)
    
    await db.delete(card)
    await db.commit()
    
    return {"message": "Flashcard deleted successfully"}


# ==================== Review Endpoints ====================
@router.get("/due", response_model=List[FlashcardResponse])
async def get_due_flashcards(
    limit: int = Query(20, ge=1, le=100),
    deck_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get flashcards due for review."""
    query = (
        select(Flashcard)
        .join(Deck)
        .where(
            Deck.user_id == current_user.id,
            Flashcard.next_review_date <= datetime.utcnow()
        )
    )
    
    if deck_id:
        query = query.where(Flashcard.deck_id == deck_id)
    
    query = query.order_by(Flashcard.next_review_date).limit(limit)
    
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/cards/{card_id}/review", response_model=FlashcardReviewResponse)
async def review_flashcard(
    card_id: str,
    review_data: FlashcardReviewRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Record a flashcard review and update spaced repetition."""
    result = await db.execute(
        select(Flashcard)
        .join(Deck)
        .where(Flashcard.id == card_id, Deck.user_id == current_user.id)
    )
    card = result.scalar_one_or_none()
    
    if not card:
        raise HTTPException(status_code=404, detail="Flashcard not found")
    
    # Apply SM-2 algorithm
    sr_service = SpacedRepetitionService()
    new_values = sr_service.calculate_next_review(
        quality=review_data.quality_rating,
        repetitions=card.repetitions,
        ease_factor=card.ease_factor,
        interval=card.interval_days
    )
    
    # Update flashcard
    card.ease_factor = new_values["ease_factor"]
    card.interval_days = new_values["interval"]
    card.repetitions = new_values["repetitions"]
    card.next_review_date = new_values["next_review"]
    
    # Record review
    review = FlashcardReview(
        flashcard_id=card.id,
        user_id=current_user.id,
        quality_rating=review_data.quality_rating,
        time_spent_seconds=review_data.time_spent_seconds,
        was_correct=review_data.quality_rating >= 3
    )
    db.add(review)
    
    await db.commit()
    
    return FlashcardReviewResponse(
        flashcard_id=card.id,
        new_ease_factor=card.ease_factor,
        new_interval_days=card.interval_days,
        next_review_date=card.next_review_date
    )


# ==================== Generation Endpoints ====================
@router.post("/generate", response_model=DeckWithCards)
async def generate_flashcards(
    request: GenerateFlashcardsRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Generate flashcards from a document using AI."""
    # Get document
    result = await db.execute(
        select(Document)
        .where(Document.id == request.document_id, Document.user_id == current_user.id)
    )
    document = result.scalar_one_or_none()
    
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if document.status != "ready":
        raise HTTPException(status_code=400, detail="Document is still processing")
    
    # Create deck
    deck = Deck(
        user_id=current_user.id,
        name=request.deck_name,
        document_id=document.id,
        description=f"Auto-generated from {document.title}"
    )
    db.add(deck)
    await db.commit()
    await db.refresh(deck)
    
    # Generate flashcards
    generator = FlashcardGenerator()
    cards_data = await generator.generate(
        content=document.content_text,
        count=request.count,
        difficulty=request.difficulty
    )
    
    # Create flashcard records
    flashcards = []
    for card_data in cards_data:
        flashcard = Flashcard(
            deck_id=deck.id,
            question=card_data["question"],
            answer=card_data["answer"],
            hint=card_data.get("hint"),
            difficulty=card_data.get("difficulty", "medium"),
            tags=card_data.get("tags", []),
            next_review_date=datetime.utcnow()
        )
        db.add(flashcard)
        flashcards.append(flashcard)
    
    deck.card_count = len(flashcards)
    await db.commit()
    
    # Refresh to get IDs
    for card in flashcards:
        await db.refresh(card)
    
    # Reload deck with flashcards using eager loading
    result = await db.execute(
        select(Deck)
        .options(selectinload(Deck.flashcards))
        .where(Deck.id == deck.id)
    )
    deck = result.scalar_one()
    
    return deck


@router.get("/stats")
async def get_flashcard_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get flashcard statistics for current user."""
    # Total cards
    total_result = await db.execute(
        select(func.count(Flashcard.id))
        .join(Deck)
        .where(Deck.user_id == current_user.id)
    )
    total_cards = total_result.scalar()
    
    # Due today
    due_result = await db.execute(
        select(func.count(Flashcard.id))
        .join(Deck)
        .where(
            Deck.user_id == current_user.id,
            Flashcard.next_review_date <= datetime.utcnow()
        )
    )
    due_today = due_result.scalar()
    
    # Reviews today
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    reviews_result = await db.execute(
        select(func.count(FlashcardReview.id))
        .where(
            FlashcardReview.user_id == current_user.id,
            FlashcardReview.review_date >= today_start
        )
    )
    reviews_today = reviews_result.scalar()
    
    # Accuracy today
    correct_result = await db.execute(
        select(func.count(FlashcardReview.id))
        .where(
            FlashcardReview.user_id == current_user.id,
            FlashcardReview.review_date >= today_start,
            FlashcardReview.was_correct == True
        )
    )
    correct_today = correct_result.scalar()
    
    accuracy = (correct_today / reviews_today * 100) if reviews_today > 0 else 0
    
    return {
        "total_cards": total_cards,
        "due_today": due_today,
        "reviews_today": reviews_today,
        "accuracy_today": round(accuracy, 1)
    }
