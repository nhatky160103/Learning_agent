from datetime import datetime, timedelta
from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_

from database.connection import get_db
from database.models import (
    User, Document, Deck, Flashcard, FlashcardReview, 
    Quiz, QuizAttempt, StudySession, TopicMastery
)
from database.schemas import (
    ProgressDashboard, UserStats, DailyProgress, TopicMasteryResponse,
    StudySessionCreate, StudySessionResponse, DailyStudyPlan, StudyRecommendation
)
from utils.security import get_current_user

router = APIRouter()


@router.get("/dashboard", response_model=ProgressDashboard)
async def get_dashboard(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get comprehensive progress dashboard."""
    user_id = current_user.id
    
    # Get stats
    stats = await get_user_stats(user_id, db)
    
    # Get weekly progress
    weekly = await get_weekly_progress(user_id, db)
    
    # Get topic mastery
    topics = await get_topic_mastery(user_id, db)
    
    # Get due flashcards count
    due_result = await db.execute(
        select(func.count(Flashcard.id))
        .join(Deck)
        .where(
            Deck.user_id == user_id,
            Flashcard.next_review_date <= datetime.utcnow()
        )
    )
    due_count = due_result.scalar() or 0
    
    # Get weak topics (mastery < 50%)
    weak_topics = [t.topic_name for t in topics if t.mastery_level < 50][:5]
    
    # Get achievements count
    from database.models import UserAchievement
    achievements_result = await db.execute(
        select(func.count(UserAchievement.id))
        .where(UserAchievement.user_id == user_id)
    )
    achievements_count = achievements_result.scalar() or 0
    
    return ProgressDashboard(
        user=current_user,
        stats=stats,
        weekly_progress=weekly,
        topic_mastery=topics[:10],
        due_flashcards_count=due_count,
        recommended_topics=weak_topics,
        achievements_count=achievements_count,
        recent_achievements=[]
    )


async def get_user_stats(user_id, db: AsyncSession) -> UserStats:
    """Calculate user statistics."""
    # Total documents
    docs_result = await db.execute(
        select(func.count(Document.id)).where(Document.user_id == user_id)
    )
    total_docs = docs_result.scalar() or 0
    
    # Total flashcards
    cards_result = await db.execute(
        select(func.count(Flashcard.id))
        .join(Deck)
        .where(Deck.user_id == user_id)
    )
    total_cards = cards_result.scalar() or 0
    
    # Total quizzes taken
    quizzes_result = await db.execute(
        select(func.count(QuizAttempt.id))
        .where(QuizAttempt.user_id == user_id, QuizAttempt.completed_at != None)
    )
    total_quizzes = quizzes_result.scalar() or 0
    
    # Total study time
    time_result = await db.execute(
        select(func.sum(StudySession.duration_minutes))
        .where(StudySession.user_id == user_id)
    )
    total_time = time_result.scalar() or 0
    
    # Cards due today
    due_result = await db.execute(
        select(func.count(Flashcard.id))
        .join(Deck)
        .where(
            Deck.user_id == user_id,
            Flashcard.next_review_date <= datetime.utcnow()
        )
    )
    due_today = due_result.scalar() or 0
    
    # Average accuracy (from reviews in last 30 days)
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    total_reviews = await db.execute(
        select(func.count(FlashcardReview.id))
        .where(
            FlashcardReview.user_id == user_id,
            FlashcardReview.review_date >= thirty_days_ago
        )
    )
    correct_reviews = await db.execute(
        select(func.count(FlashcardReview.id))
        .where(
            FlashcardReview.user_id == user_id,
            FlashcardReview.review_date >= thirty_days_ago,
            FlashcardReview.was_correct == True
        )
    )
    total = total_reviews.scalar() or 0
    correct = correct_reviews.scalar() or 0
    avg_accuracy = (correct / total * 100) if total > 0 else 0
    
    return UserStats(
        total_documents=total_docs,
        total_flashcards=total_cards,
        total_quizzes_taken=total_quizzes,
        total_study_time_minutes=total_time,
        cards_due_today=due_today,
        average_accuracy=round(avg_accuracy, 1)
    )


async def get_weekly_progress(user_id, db: AsyncSession) -> List[DailyProgress]:
    """Get progress for the last 7 days."""
    progress = []
    today = datetime.utcnow().date()
    
    for i in range(7):
        date = today - timedelta(days=i)
        date_start = datetime.combine(date, datetime.min.time())
        date_end = datetime.combine(date, datetime.max.time())
        
        # Study time
        time_result = await db.execute(
            select(func.sum(StudySession.duration_minutes))
            .where(
                StudySession.user_id == user_id,
                StudySession.started_at >= date_start,
                StudySession.started_at <= date_end
            )
        )
        study_time = time_result.scalar() or 0
        
        # Cards reviewed
        cards_result = await db.execute(
            select(func.count(FlashcardReview.id))
            .where(
                FlashcardReview.user_id == user_id,
                FlashcardReview.review_date >= date_start,
                FlashcardReview.review_date <= date_end
            )
        )
        cards_reviewed = cards_result.scalar() or 0
        
        # Quizzes taken
        quizzes_result = await db.execute(
            select(func.count(QuizAttempt.id))
            .where(
                QuizAttempt.user_id == user_id,
                QuizAttempt.completed_at >= date_start,
                QuizAttempt.completed_at <= date_end
            )
        )
        quizzes_taken = quizzes_result.scalar() or 0
        
        # Accuracy
        correct_result = await db.execute(
            select(func.count(FlashcardReview.id))
            .where(
                FlashcardReview.user_id == user_id,
                FlashcardReview.review_date >= date_start,
                FlashcardReview.review_date <= date_end,
                FlashcardReview.was_correct == True
            )
        )
        correct = correct_result.scalar() or 0
        accuracy = (correct / cards_reviewed * 100) if cards_reviewed > 0 else 0
        
        progress.append(DailyProgress(
            date=date.isoformat(),
            study_time_minutes=study_time,
            cards_reviewed=cards_reviewed,
            quizzes_taken=quizzes_taken,
            accuracy=round(accuracy, 1)
        ))
    
    return progress


async def get_topic_mastery(user_id, db: AsyncSession) -> List[TopicMasteryResponse]:
    """Get topic mastery levels."""
    result = await db.execute(
        select(TopicMastery)
        .where(TopicMastery.user_id == user_id)
        .order_by(TopicMastery.mastery_level.desc())
    )
    topics = result.scalars().all()
    
    return [
        TopicMasteryResponse(
            topic_name=t.topic_name,
            mastery_level=t.mastery_level,
            total_questions=t.total_questions_answered,
            correct_answers=t.correct_answers,
            last_practiced=t.last_practiced
        )
        for t in topics
    ]


@router.post("/sessions", response_model=StudySessionResponse)
async def create_study_session(
    session_data: StudySessionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Record a study session."""
    # Calculate XP
    xp_earned = calculate_xp(session_data)
    
    session = StudySession(
        user_id=current_user.id,
        session_type=session_data.session_type,
        duration_minutes=session_data.duration_minutes,
        items_reviewed=session_data.items_reviewed,
        accuracy=session_data.accuracy,
        topics=session_data.topics,
        xp_earned=xp_earned,
        ended_at=datetime.utcnow()
    )
    db.add(session)
    
    # Update user XP and streak
    current_user.total_xp += xp_earned
    await update_streak(current_user, db)
    
    await db.commit()
    await db.refresh(session)
    
    return session


def calculate_xp(session: StudySessionCreate) -> int:
    """Calculate XP earned from a study session."""
    base_xp = session.duration_minutes  # 1 XP per minute
    items_bonus = session.items_reviewed * 2  # 2 XP per item
    accuracy_bonus = int((session.accuracy or 0) / 10)  # Up to 10 bonus XP
    
    return base_xp + items_bonus + accuracy_bonus


async def update_streak(user: User, db: AsyncSession):
    """Update user's study streak."""
    today = datetime.utcnow().date()
    yesterday = today - timedelta(days=1)
    
    # Check if studied yesterday
    result = await db.execute(
        select(StudySession)
        .where(
            StudySession.user_id == user.id,
            func.date(StudySession.started_at) == yesterday
        )
        .limit(1)
    )
    studied_yesterday = result.scalar_one_or_none() is not None
    
    # Check if already studied today
    result = await db.execute(
        select(StudySession)
        .where(
            StudySession.user_id == user.id,
            func.date(StudySession.started_at) == today
        )
        .limit(1)
    )
    already_studied_today = result.scalar_one_or_none() is not None
    
    if not already_studied_today:
        if studied_yesterday:
            user.current_streak += 1
        else:
            user.current_streak = 1
        
        if user.current_streak > user.longest_streak:
            user.longest_streak = user.current_streak


@router.get("/recommendations", response_model=DailyStudyPlan)
async def get_study_recommendations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get personalized study recommendations."""
    user_id = current_user.id
    
    # Get due flashcards count
    due_result = await db.execute(
        select(func.count(Flashcard.id))
        .join(Deck)
        .where(
            Deck.user_id == user_id,
            Flashcard.next_review_date <= datetime.utcnow()
        )
    )
    due_count = due_result.scalar() or 0
    
    # Get weak topics
    topics_result = await db.execute(
        select(TopicMastery)
        .where(TopicMastery.user_id == user_id, TopicMastery.mastery_level < 50)
        .order_by(TopicMastery.mastery_level)
        .limit(5)
    )
    weak_topics = [t.topic_name for t in topics_result.scalars().all()]
    
    recommendations = []
    
    # Priority 1: Due flashcard reviews
    if due_count > 0:
        recommendations.append(StudyRecommendation(
            type="flashcard_review",
            priority=1,
            title="Review Due Flashcards",
            description=f"You have {due_count} flashcards due for review",
            estimated_time_minutes=min(due_count * 1, 20)
        ))
    
    # Priority 2: Quiz on weak topics
    if weak_topics:
        recommendations.append(StudyRecommendation(
            type="quiz",
            priority=2,
            title=f"Practice Quiz: {weak_topics[0]}",
            description=f"Strengthen your understanding of {weak_topics[0]}",
            estimated_time_minutes=10
        ))
    
    # Priority 3: New concept learning
    recommendations.append(StudyRecommendation(
        type="new_concept",
        priority=3,
        title="Learn New Concepts",
        description="Explore new topics from your documents",
        estimated_time_minutes=15
    ))
    
    return DailyStudyPlan(
        date=datetime.utcnow().date().isoformat(),
        target_time_minutes=current_user.daily_goal_minutes,
        recommendations=recommendations,
        due_flashcards=due_count,
        weak_topics=weak_topics
    )


@router.get("/heatmap")
async def get_activity_heatmap(
    days: int = 365,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get activity heatmap data."""
    start_date = datetime.utcnow() - timedelta(days=days)
    
    result = await db.execute(
        select(
            func.date(StudySession.started_at).label('date'),
            func.sum(StudySession.duration_minutes).label('minutes')
        )
        .where(
            StudySession.user_id == current_user.id,
            StudySession.started_at >= start_date
        )
        .group_by(func.date(StudySession.started_at))
    )
    
    heatmap = {}
    for row in result.all():
        heatmap[row.date.isoformat()] = row.minutes
    
    return heatmap
