from datetime import datetime

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from database.connection import get_db
from database.models import User, Document, Deck, Quiz, QuizQuestion, QuizAttempt
from database.schemas import (
    QuizCreate, QuizResponse, QuizWithQuestions, QuizQuestionResponse,
    QuizSubmission, QuizResult, QuestionResult, GenerateQuizRequest
)
from utils.security import get_current_user
from services.quiz_generator import QuizGenerator

router = APIRouter()


@router.post("/generate", response_model=QuizWithQuestions)
async def generate_quiz(
    request: GenerateQuizRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Generate a quiz from document or deck using AI."""
    content = ""
    
    # Get content from document or deck
    if request.document_id:
        result = await db.execute(
            select(Document)
            .where(Document.id == request.document_id, Document.user_id == current_user.id)
        )
        document = result.scalar_one_or_none()
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
        if document.status != "ready":
            raise HTTPException(status_code=400, detail="Document is still processing")
        content = document.content_text
    elif request.deck_id:
        result = await db.execute(
            select(Deck)
            .where(Deck.id == request.deck_id, Deck.user_id == current_user.id)
        )
        deck = result.scalar_one_or_none()
        if not deck:
            raise HTTPException(status_code=404, detail="Deck not found")
        # Get flashcards as content
        from database.models import Flashcard
        cards_result = await db.execute(
            select(Flashcard).where(Flashcard.deck_id == deck.id)
        )
        cards = cards_result.scalars().all()
        content = "\n".join([f"Q: {c.question}\nA: {c.answer}" for c in cards])
    else:
        raise HTTPException(status_code=400, detail="Either document_id or deck_id is required")
    
    # Create quiz
    quiz = Quiz(
        user_id=current_user.id,
        document_id=request.document_id,
        deck_id=request.deck_id,
        title=request.title,
        question_count=request.question_count,
        difficulty=request.difficulty,
        time_limit_minutes=request.time_limit_minutes,
        is_adaptive=True
    )
    db.add(quiz)
    await db.commit()
    await db.refresh(quiz)
    
    # Generate questions
    generator = QuizGenerator()
    questions_data = await generator.generate(
        content=content,
        count=request.question_count,
        question_types=request.question_types,
        difficulty=request.difficulty
    )
    
    # Create question records
    questions = []
    for i, q_data in enumerate(questions_data):
        question = QuizQuestion(
            quiz_id=quiz.id,
            question_type=q_data["question_type"],
            question_text=q_data["question_text"],
            correct_answer=q_data["correct_answer"],
            options=q_data.get("options"),
            explanation=q_data.get("explanation"),
            difficulty=q_data.get("difficulty", request.difficulty),
            order_index=i
        )
        db.add(question)
        questions.append(question)
    
    await db.commit()
    
    # Reload quiz with eager-loaded questions
    result = await db.execute(
        select(Quiz)
        .options(selectinload(Quiz.questions))
        .where(Quiz.id == quiz.id)
    )
    quiz = result.scalar_one()
    
    return quiz


@router.get("/", response_model=List[QuizResponse])
async def list_quizzes(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all quizzes for current user."""
    result = await db.execute(
        select(Quiz)
        .where(Quiz.user_id == current_user.id)
        .order_by(Quiz.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{quiz_id}", response_model=QuizWithQuestions)
async def get_quiz(
    quiz_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a quiz with its questions (without correct answers)."""
    # Use eager loading to avoid lazy loading issues
    result = await db.execute(
        select(Quiz)
        .options(selectinload(Quiz.questions))
        .where(Quiz.id == quiz_id, Quiz.user_id == current_user.id)
    )
    quiz = result.scalar_one_or_none()
    
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    
    return quiz


@router.post("/{quiz_id}/start")
async def start_quiz(
    quiz_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Start a quiz attempt."""
    result = await db.execute(
        select(Quiz)
        .where(Quiz.id == quiz_id, Quiz.user_id == current_user.id)
    )
    quiz = result.scalar_one_or_none()
    
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    
    # Create attempt
    attempt = QuizAttempt(
        quiz_id=quiz.id,
        user_id=current_user.id,
        max_score=quiz.question_count,
        started_at=datetime.utcnow()
    )
    db.add(attempt)
    await db.commit()
    await db.refresh(attempt)
    
    # Get questions (without correct answers for client)
    questions_result = await db.execute(
        select(QuizQuestion)
        .where(QuizQuestion.quiz_id == quiz_id)
        .order_by(QuizQuestion.order_index)
    )
    questions = questions_result.scalars().all()
    
    return {
        "attempt_id": str(attempt.id),
        "quiz": quiz,
        "questions": [
            {
                "id": str(q.id),
                "question_type": q.question_type,
                "question_text": q.question_text,
                "options": q.options,
                "points": q.points,
                "order_index": q.order_index
            }
            for q in questions
        ],
        "time_limit_minutes": quiz.time_limit_minutes
    }


@router.post("/{quiz_id}/submit", response_model=QuizResult)
async def submit_quiz(
    quiz_id: str,
    submission: QuizSubmission,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Submit quiz answers and get results."""
    result = await db.execute(
        select(Quiz)
        .where(Quiz.id == quiz_id, Quiz.user_id == current_user.id)
    )
    quiz = result.scalar_one_or_none()
    
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    
    # Get latest attempt
    attempt_result = await db.execute(
        select(QuizAttempt)
        .where(
            QuizAttempt.quiz_id == quiz_id,
            QuizAttempt.user_id == current_user.id,
            QuizAttempt.completed_at == None
        )
        .order_by(QuizAttempt.started_at.desc())
    )
    attempt = attempt_result.scalars().first()
    
    if not attempt:
        # Create new attempt if none exists
        attempt = QuizAttempt(
            quiz_id=quiz.id,
            user_id=current_user.id,
            max_score=quiz.question_count,
            started_at=datetime.utcnow()
        )
        db.add(attempt)
    
    # Get questions
    questions_result = await db.execute(
        select(QuizQuestion).where(QuizQuestion.quiz_id == quiz_id)
    )
    questions = {str(q.id): q for q in questions_result.scalars().all()}
    
    # Grade answers
    results = []
    total_score = 0
    correct_count = 0
    answers_dict = {}
    
    for answer in submission.answers:
        question = questions.get(str(answer.question_id))
        if not question:
            continue
        
        is_correct = answer.user_answer.lower().strip() == question.correct_answer.lower().strip()
        points_earned = question.points if is_correct else 0
        total_score += points_earned
        
        if is_correct:
            correct_count += 1
        
        answers_dict[str(answer.question_id)] = answer.user_answer
        
        results.append(QuestionResult(
            question_id=answer.question_id,
            is_correct=is_correct,
            correct_answer=question.correct_answer,
            user_answer=answer.user_answer,
            explanation=question.explanation,
            points_earned=points_earned
        ))
    
    # Update attempt
    attempt.score = total_score
    attempt.answers = answers_dict
    attempt.time_taken_seconds = submission.time_taken_seconds
    attempt.completed_at = datetime.utcnow()
    
    # Calculate XP (base XP + bonus for accuracy)
    max_score = sum(q.points for q in questions.values())
    total_questions = len(questions)
    percentage = (total_score / max_score * 100) if max_score > 0 else 0
    xp_earned = int(10 + (percentage / 10))  # 10 base + up to 10 bonus
    
    # Update user XP
    current_user.total_xp += xp_earned
    
    await db.commit()
    
    return QuizResult(
        quiz_id=quiz.id,
        attempt_id=attempt.id,
        score=total_score,
        max_score=max_score,
        percentage=round(percentage, 1),
        correct_count=correct_count,
        total_questions=total_questions,
        time_taken_seconds=submission.time_taken_seconds,
        results=results,
        xp_earned=xp_earned
    )


@router.get("/{quiz_id}/attempts")
async def get_quiz_attempts(
    quiz_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all attempts for a quiz."""
    result = await db.execute(
        select(QuizAttempt)
        .where(
            QuizAttempt.quiz_id == quiz_id,
            QuizAttempt.user_id == current_user.id
        )
        .order_by(QuizAttempt.started_at.desc())
    )
    attempts = result.scalars().all()
    
    return [
        {
            "id": str(a.id),
            "score": a.score,
            "max_score": a.max_score,
            "percentage": round((a.score / a.max_score * 100) if a.max_score else 0, 1),
            "time_taken_seconds": a.time_taken_seconds,
            "started_at": a.started_at,
            "completed_at": a.completed_at
        }
        for a in attempts
    ]


@router.delete("/{quiz_id}")
async def delete_quiz(
    quiz_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a quiz."""
    result = await db.execute(
        select(Quiz)
        .where(Quiz.id == quiz_id, Quiz.user_id == current_user.id)
    )
    quiz = result.scalar_one_or_none()
    
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    
    await db.delete(quiz)
    await db.commit()
    
    return {"message": "Quiz deleted successfully"}
