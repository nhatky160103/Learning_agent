# 🧠 Smart Learning Companion

AI-powered personalized learning assistant with multi-agent orchestration, RAG-enabled chat, intelligent flashcards, and adaptive quizzes.

![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)
![FastAPI](https://img.shields.io/badge/FastAPI-0.109-009688?style=flat-square&logo=fastapi)
![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?style=flat-square&logo=typescript)

## 📸 Features in Action

### Dashboard Overview
![Dashboard](asset/dashboard.png)
*Track progress with XP, streaks, and quick actions for learning*

### AI Chat Assistant with RAG
![AI Chat](asset/chat1.png)
*Context-aware conversation powered by Retrieval-Augmented Generation*

### Document Search with RAG

![Single Document Search](asset/rag_internal_file.png)
*Semantic search within a specific document with relevance scoring*

![Multi-Document Search](asset/rag_multi_file.png)
*Search across all uploaded documents with AI-powered context retrieval*

### Quiz Generation & Taking

![Generate Quiz](asset/gen_quiz.png)
*Create customized quizzes from documents or flashcard decks*

![Taking Quiz](asset/gen_quiz2.png)
*Interactive quiz interface with multiple question types*

## ✨ Features

- **📄 Smart Document Processing** - Upload PDFs, DOCX, TXT, PPTX with automatic text extraction and summarization
- **🤖 Multi-Agent AI System** - Specialized agents (Chat, Explanation, Summary, Concept Extractor) working together
- **🔍 RAG-Powered Chat** - Retrieval-Augmented Generation with semantic search across your documents
- **⚡ Real-time Streaming** - Stream AI responses for instant feedback
- **🎴 AI Flashcard Generation** - Auto-generate flashcards from documents using LLM
- **🔄 Spaced Repetition** - SM-2 algorithm optimizes your review schedule for maximum retention
- **📝 Adaptive Quizzes** - Multiple question types (MCQ, True/False, Fill-in-blank) with difficulty adjustment
- **🔎 Semantic Document Search** - Find relevant information across all your study materials
- **📊 Progress Analytics** - Track streaks, XP, topic mastery, and study heatmap
- **🌙 Modern UI** - Glassmorphism design with smooth animations

## 🤖 AI Features

### Multi-Agent Orchestration
Specialized AI agents coordinate to provide personalized learning experiences:
- **Chat Agent** - Conversational learning assistant
- **Explanation Agent** - Deep concept explanations at various levels (ELI5, intermediate, advanced)
- **Summary Agent** - Document summarization
- **Concept Extractor** - Identify key topics and terms

### RAG (Retrieval-Augmented Generation)
- **Vector Store** - ChromaDB with SentenceTransformer embeddings
- **Semantic Search** - Find relevant content across all documents
- **Context-Aware Responses** - AI answers grounded in your study materials
- **Source Citations** - Track which documents informed each response

### Streaming & Real-time
- **Streaming Responses** - See AI answers as they're generated
- **Async Processing** - Non-blocking document upload and processing

## 🏗️ Tech Stack

### Backend
- **FastAPI** - High-performance async API
- **PostgreSQL** - Relational database with async SQLAlchemy
- **Redis** - Caching & session management
- **ChromaDB** - Vector database for semantic search
- **LangChain** - LLM orchestration framework
- **SentenceTransformers** - Generate document embeddings (all-MiniLM-L6-v2)
- **LLM Support** - OpenAI (GPT-4o-mini) / Google (Gemini-2.5-flash)

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

# ChromaDB (Vector Store)
CHROMA_HOST=localhost
CHROMA_PORT=8000
CHROMA_COLLECTION=learning_documents

# JWT
JWT_SECRET_KEY=your-super-secret-key
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# AI (choose one or both)
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...

# CORS
CORS_ORIGINS=http://localhost:3000
```

## 📝 API Endpoints

### Authentication
| Endpoint | Description |
|----------|-------------|
| `POST /api/auth/register` | User registration |
| `POST /api/auth/login/json` | Login (JSON) |
| `GET /api/auth/me` | Get current user |

### Documents
| Endpoint | Description |
|----------|-------------|
| `POST /api/documents/upload` | Upload document (PDF, DOCX, TXT, PPTX) |
| `GET /api/documents` | List user's documents |
| `GET /api/documents/{id}` | Get document details |
| `POST /api/documents/search` | Semantic search across all documents |
| `POST /api/documents/{id}/search` | Search within specific document |

### Chat & AI
| Endpoint | Description |
|----------|-------------|
| `POST /api/chat/message` | Chat with AI (RAG-enabled) |
| `POST /api/chat/stream` | Streaming chat responses |
| `POST /api/chat/explain` | Get concept explanation |
| `POST /api/chat/summarize` | Summarize text |

### Flashcards
| Endpoint | Description |
|----------|-------------|
| `POST /api/flashcards/generate` | Generate flashcards from document |
| `GET /api/flashcards/decks` | List flashcard decks |
| `GET /api/flashcards/decks/{id}` | Get deck with cards |
| `POST /api/flashcards/cards/{id}/review` | Review flashcard (SM-2) |
| `GET /api/flashcards/due` | Get cards due for review |

### Quizzes
| Endpoint | Description |
|----------|-------------|
| `POST /api/quizzes/generate` | Generate adaptive quiz |
| `GET /api/quizzes` | List user's quizzes |
| `POST /api/quizzes/{id}/start` | Start quiz attempt |
| `POST /api/quizzes/{id}/submit` | Submit quiz answers |

### Progress
| Endpoint | Description |
|----------|-------------|
| `GET /api/progress/dashboard` | Progress stats & analytics |
| `GET /api/progress/recommendations` | Daily study plan |
| `GET /api/progress/heatmap` | Activity heatmap |

## 🎯 Usage

1. **Register/Login** - Create account or sign in
2. **Upload Documents** - Drag & drop your study materials (PDF, DOCX, TXT, PPTX)
3. **Ask AI Questions** - Chat with RAG-enabled AI about your documents
4. **Search Documents** - Use semantic search to find relevant information
5. **Generate Flashcards** - Auto-create flashcards from documents or specific topics
6. **Review with Spaced Repetition** - Practice with SM-2 optimized scheduling
7. **Take Adaptive Quizzes** - Test knowledge with AI-generated quizzes
8. **Track Progress** - View analytics, streaks, and study recommendations

## 📄 License

MIT License - see LICENSE file for details.

---

Built with ❤️ by Smart Learning Companion Team
