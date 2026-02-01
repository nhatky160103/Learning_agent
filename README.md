# 🧠 Smart Learning Companion

AI-powered personalized learning assistant with intelligent flashcards, adaptive quizzes, and progress tracking.

![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)
![FastAPI](https://img.shields.io/badge/FastAPI-0.109-009688?style=flat-square&logo=fastapi)
![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?style=flat-square&logo=typescript)

## ✨ Features

- **📄 Smart Document Processing** - Upload PDFs, DOCX, TXT, PPTX with automatic text extraction and summarization
- **🎴 AI Flashcard Generation** - Auto-generate flashcards from documents using LLM
- **🔄 Spaced Repetition** - SM-2 algorithm optimizes your review schedule for maximum retention
- **📝 Adaptive Quizzes** - Multiple question types (MCQ, True/False, Fill-in-blank) with difficulty adjustment
- **💬 AI Chat Assistant** - Ask questions, get explanations, and master concepts
- **📊 Progress Analytics** - Track streaks, XP, topic mastery, and study heatmap
- **🌙 Modern UI** - Glassmorphism design with smooth animations

## 🏗️ Tech Stack

### Backend
- **FastAPI** - High-performance async API
- **PostgreSQL** - Relational database
- **Redis** - Caching & session management
- **ChromaDB** - Vector storage for embeddings
- **LangChain** - LLM orchestration (OpenAI/Gemini)

### Frontend
- **Next.js 14** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS** - Utility-first styling
- **Framer Motion** - Smooth animations
- **Zustand** - State management

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- Docker & Docker Compose
- OpenAI or Google API key

### 1. Clone & Setup

```bash
cd learning_assistant

# Setup backend
cd backend
cp .env.example .env
# Edit .env with your API keys

# Setup frontend
cd ../frontend
npm install
```

### 2. Start Services

```bash
# Terminal 1: Start Docker services
docker-compose up -d

# Terminal 2: Start backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Terminal 3: Start frontend
cd frontend
npm run dev
```

### 3. Access

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

## 📁 Project Structure

```
learning_assistant/
├── backend/
│   ├── main.py              # FastAPI app entry
│   ├── config.py            # Settings management
│   ├── database/
│   │   ├── connection.py    # DB connection
│   │   ├── models.py        # SQLAlchemy models
│   │   └── schemas.py       # Pydantic schemas
│   ├── routers/
│   │   ├── auth.py          # Authentication
│   │   ├── documents.py     # Document management
│   │   ├── flashcards.py    # Flashcard CRUD & review
│   │   ├── quizzes.py       # Quiz generation & taking
│   │   ├── progress.py      # Progress tracking
│   │   └── chat.py          # AI chat
│   ├── services/
│   │   ├── document_processor.py
│   │   ├── flashcard_generator.py
│   │   ├── quiz_generator.py
│   │   ├── spaced_repetition.py
│   │   └── ai_agents.py
│   └── utils/
│       ├── security.py      # JWT & password
│       └── prompts.py       # LLM prompts
│
├── frontend/
│   ├── app/
│   │   ├── page.tsx         # Landing page
│   │   ├── login/           # Auth pages
│   │   ├── register/
│   │   └── dashboard/
│   │       ├── page.tsx     # Dashboard
│   │       ├── documents/   # Document upload
│   │       ├── flashcards/  # Flashcard review
│   │       ├── quizzes/     # Quiz taking
│   │       ├── chat/        # AI assistant
│   │       └── progress/    # Analytics
│   ├── lib/
│   │   ├── api.ts           # API client
│   │   └── store.ts         # Zustand stores
│   └── components/          # Shared components
│
└── docker-compose.yml       # PostgreSQL, Redis, ChromaDB
```

## 🔧 Environment Variables

Create `backend/.env`:

```env
# Database
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/learning_db

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET_KEY=your-super-secret-key

# AI (choose one or both)
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...

# CORS
CORS_ORIGINS=http://localhost:3000
```

## 📝 API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/auth/register` | User registration |
| `POST /api/auth/login/json` | Login (JSON) |
| `POST /api/documents/upload` | Upload document |
| `POST /api/flashcards/generate` | Generate flashcards from doc |
| `POST /api/flashcards/cards/{id}/review` | Review flashcard |
| `POST /api/quizzes/generate` | Generate quiz |
| `POST /api/quizzes/{id}/submit` | Submit quiz answers |
| `GET /api/progress/dashboard` | Progress stats |
| `POST /api/chat/message` | Chat with AI |

## 🎯 Usage

1. **Register/Login** - Create account or sign in
2. **Upload Documents** - Drag & drop your study materials
3. **Generate Flashcards** - Click "Generate Cards" on any document
4. **Review** - Practice with spaced repetition
5. **Take Quizzes** - Test your knowledge
6. **Track Progress** - View analytics and streaks

## 📄 License

MIT License - see LICENSE file for details.

---

Built with ❤️ by Smart Learning Companion Team
