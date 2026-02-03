from datetime import datetime
from typing import List, Optional, Any, Union
from pydantic import BaseModel, EmailStr, Field, computed_field
from uuid import UUID


# ==================== User Schemas ====================
class UserBase(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=100)
    full_name: Optional[str] = None


class UserCreate(UserBase):
    password: str = Field(min_length=6)


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    learning_goals: Optional[List[str]] = None
    preferred_difficulty: Optional[str] = None
    daily_goal_minutes: Optional[int] = None
    avatar_url: Optional[str] = None


class UserResponse(UserBase):
    id: UUID
    avatar_url: Optional[str] = None
    learning_goals: Optional[List[str]] = None
    preferred_difficulty: str
    daily_goal_minutes: int
    total_xp: int
    current_streak: int
    longest_streak: int
    created_at: datetime
    
    class Config:
        from_attributes = True


class UserStats(BaseModel):
    total_documents: int
    total_flashcards: int
    total_quizzes_taken: int
    total_study_time_minutes: int
    cards_due_today: int
    average_accuracy: float


# ==================== Auth Schemas ====================
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# ==================== Document Schemas ====================
class DocumentBase(BaseModel):
    title: str = Field(max_length=500)


class DocumentCreate(DocumentBase):
    pass


class DocumentResponse(DocumentBase):
    id: UUID
    user_id: UUID
    file_path: Optional[str] = None
    file_type: Optional[str] = None
    file_size: Optional[int] = None
    status: str
    content_summary: Optional[str] = None
    extracted_concepts: Optional[dict] = None
    chunk_count: int
    created_at: datetime
    processed_at: Optional[datetime] = None
    
    @computed_field
    @property
    def original_filename(self) -> str:
        """Alias for title to maintain frontend compatibility"""
        return self.title
    
    class Config:
        from_attributes = True


# ==================== Deck Schemas ====================
class DeckBase(BaseModel):
    name: str = Field(max_length=255)
    description: Optional[str] = None
    tags: Optional[List[str]] = None


class DeckCreate(DeckBase):
    document_id: Optional[UUID] = None


class DeckUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    is_public: Optional[bool] = None


class DeckResponse(DeckBase):
    id: UUID
    user_id: UUID
    document_id: Optional[UUID] = None
    card_count: int
    is_public: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class DeckWithCards(DeckResponse):
    flashcards: List["FlashcardResponse"] = []


# ==================== Flashcard Schemas ====================
class FlashcardBase(BaseModel):
    question: str
    answer: str
    hint: Optional[str] = None
    difficulty: str = "medium"
    tags: Optional[List[str]] = None


class FlashcardCreate(FlashcardBase):
    deck_id: UUID


class FlashcardUpdate(BaseModel):
    question: Optional[str] = None
    answer: Optional[str] = None
    hint: Optional[str] = None
    difficulty: Optional[str] = None
    tags: Optional[List[str]] = None


class FlashcardResponse(FlashcardBase):
    id: UUID
    deck_id: UUID
    image_url: Optional[str] = None
    source_reference: Optional[str] = None
    ease_factor: float
    interval_days: int
    repetitions: int
    next_review_date: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class FlashcardReviewRequest(BaseModel):
    quality_rating: int = Field(ge=0, le=5)  # SM-2: 0-5
    time_spent_seconds: Optional[int] = None


class FlashcardReviewResponse(BaseModel):
    flashcard_id: UUID
    new_ease_factor: float
    new_interval_days: int
    next_review_date: datetime


class GenerateFlashcardsRequest(BaseModel):
    document_id: UUID
    deck_name: str
    count: int = Field(default=10, ge=1, le=50)
    difficulty: str = "mixed"


# ==================== Quiz Schemas ====================
class QuizBase(BaseModel):
    title: str = Field(max_length=255)
    description: Optional[str] = None
    question_count: int = Field(default=10, ge=1, le=50)
    difficulty: str = "medium"
    time_limit_minutes: Optional[int] = None


class QuizCreate(QuizBase):
    document_id: Optional[UUID] = None
    deck_id: Optional[UUID] = None
    is_adaptive: bool = True


class QuizResponse(QuizBase):
    id: UUID
    user_id: UUID
    document_id: Optional[UUID] = None
    deck_id: Optional[UUID] = None
    is_adaptive: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


class QuizQuestionResponse(BaseModel):
    id: UUID
    question_type: str
    question_text: str
    options: Optional[Union[dict, list]] = None  # For MCQ (dict) or True/False (list)
    points: int
    order_index: int
    
    class Config:
        from_attributes = True


class QuizWithQuestions(QuizResponse):
    questions: List[QuizQuestionResponse] = []


class QuizAnswerSubmit(BaseModel):
    question_id: UUID
    user_answer: str


class QuizSubmission(BaseModel):
    answers: List[QuizAnswerSubmit]
    time_taken_seconds: int


class QuestionResult(BaseModel):
    question_id: UUID
    is_correct: bool
    correct_answer: str
    user_answer: str
    explanation: Optional[str] = None
    points_earned: int


class QuizResult(BaseModel):
    quiz_id: UUID
    attempt_id: UUID
    score: float
    max_score: int
    percentage: float
    correct_count: int
    total_questions: int
    time_taken_seconds: int
    results: List[QuestionResult]
    xp_earned: int


class GenerateQuizRequest(BaseModel):
    document_id: Optional[UUID] = None
    deck_id: Optional[UUID] = None
    title: str
    question_count: int = Field(default=10, ge=1, le=50)
    question_types: List[str] = ["mcq", "true_false", "fill_blank"]
    difficulty: str = "medium"
    time_limit_minutes: Optional[int] = None


# ==================== Progress Schemas ====================
class DailyProgress(BaseModel):
    date: str
    study_time_minutes: int
    cards_reviewed: int
    quizzes_taken: int
    accuracy: float


class TopicMasteryResponse(BaseModel):
    topic_name: str
    mastery_level: float
    total_questions: int
    correct_answers: int
    last_practiced: Optional[datetime] = None


class ProgressDashboard(BaseModel):
    user: UserResponse
    stats: UserStats
    weekly_progress: List[DailyProgress]
    topic_mastery: List[TopicMasteryResponse]
    due_flashcards_count: int
    recommended_topics: List[str]
    achievements_count: int
    recent_achievements: List[str]


class StudySessionCreate(BaseModel):
    session_type: str  # flashcard, quiz, reading
    duration_minutes: int
    items_reviewed: int
    accuracy: Optional[float] = None
    topics: Optional[dict] = None


class StudySessionResponse(BaseModel):
    id: UUID
    session_type: str
    duration_minutes: int
    items_reviewed: int
    accuracy: Optional[float] = None
    xp_earned: int
    started_at: datetime
    ended_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# ==================== Chat Schemas ====================
class ChatMessage(BaseModel):
    role: str  # user, assistant
    content: str


class ChatRequest(BaseModel):
    message: str
    document_id: Optional[UUID] = None
    conversation_history: List[ChatMessage] = []


class ChatResponse(BaseModel):
    response: str
    sources: Optional[List[dict]] = None
    suggested_actions: Optional[List[str]] = None


class ExplainConceptRequest(BaseModel):
    concept: str
    level: str = "intermediate"  # eli5, intermediate, advanced
    document_id: Optional[UUID] = None


class ExplainConceptResponse(BaseModel):
    concept: str
    explanation: str
    examples: List[str]
    related_concepts: List[str]
    sources: Optional[List[dict]] = None


# ==================== Recommendations Schemas ====================
class StudyRecommendation(BaseModel):
    type: str  # flashcard_review, quiz, new_concept
    priority: int
    title: str
    description: str
    estimated_time_minutes: int
    resource_id: Optional[UUID] = None
    resource_type: Optional[str] = None


class DailyStudyPlan(BaseModel):
    date: str
    target_time_minutes: int
    recommendations: List[StudyRecommendation]
    due_flashcards: int
    weak_topics: List[str]


# Update forward references
DeckWithCards.model_rebuild()
