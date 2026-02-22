# 📝 API Reference

Complete API endpoint reference for Smart Learning Companion.

**Base URL**: `http://localhost:8001/api` (local) | Swagger docs available at `/docs`

All endpoints (except registration and login) require a Bearer token via the `Authorization` header.

---

## 🔐 Authentication (`/api/auth`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Register a new user |
| `POST` | `/api/auth/login` | Login (OAuth2 form data) |
| `POST` | `/api/auth/login/json` | Login (JSON body) |
| `GET` | `/api/auth/me` | Get current user profile |
| `PUT` | `/api/auth/me` | Update current user profile |

**Register** – `POST /api/auth/register`
```json
{
  "email": "user@example.com",
  "username": "johndoe",
  "password": "securepassword",
  "full_name": "John Doe"
}
```

**Login (JSON)** – `POST /api/auth/login/json`
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response** — Returns a JWT access token:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer"
}
```

---

## 📄 Documents (`/api/documents`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/documents/upload` | Upload document (PDF, DOCX, TXT, PPTX) |
| `GET` | `/api/documents` | List all user's documents |
| `GET` | `/api/documents/{id}` | Get document details |
| `DELETE` | `/api/documents/{id}` | Delete a document |
| `GET` | `/api/documents/{id}/content` | Get document content & extracted concepts |
| `POST` | `/api/documents/search` | Semantic search across all documents |
| `POST` | `/api/documents/{id}/search` | Search within a specific document |
| `POST` | `/api/documents/{id}/reprocess` | Reprocess document & regenerate embeddings |

---

## 🤖 Chat & AI (`/api/chat`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/chat/message` | Send message to AI assistant (RAG-enabled) |
| `POST` | `/api/chat/stream` | Streaming chat responses (SSE) |
| `POST` | `/api/chat/explain` | Get detailed concept explanation |
| `POST` | `/api/chat/suggest-flashcards` | Suggest flashcards from text |
| `POST` | `/api/chat/summarize` | Summarize text content |

**Chat Message** – `POST /api/chat/message`
```json
{
  "message": "Explain the concept of RAG",
  "document_id": "optional-uuid",
  "conversation_history": []
}
```

**Explain Concept** – `POST /api/chat/explain`
```json
{
  "concept": "Neural Networks",
  "level": "intermediate",
  "document_id": "optional-uuid"
}
```

---

## 🎴 Flashcards (`/api/flashcards`)

### Deck Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/flashcards/decks` | Create a new deck |
| `GET` | `/api/flashcards/decks` | List all decks |
| `GET` | `/api/flashcards/decks/{id}` | Get deck with all flashcards |
| `PUT` | `/api/flashcards/decks/{id}` | Update a deck |
| `DELETE` | `/api/flashcards/decks/{id}` | Delete a deck and its flashcards |

### Card Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/flashcards/cards` | Create a flashcard |
| `GET` | `/api/flashcards/cards/{id}` | Get a specific flashcard |
| `PUT` | `/api/flashcards/cards/{id}` | Update a flashcard |
| `DELETE` | `/api/flashcards/cards/{id}` | Delete a flashcard |

### Review & Study

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/flashcards/due` | Get flashcards due for review |
| `POST` | `/api/flashcards/cards/{id}/review` | Submit review (updates SM-2 schedule) |

### Generation & Stats

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/flashcards/generate` | AI-generate flashcards from a document |
| `GET` | `/api/flashcards/stats` | Get flashcard study statistics |

---

## 📝 Quizzes (`/api/quizzes`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/quizzes/generate` | Generate quiz from document or deck |
| `GET` | `/api/quizzes` | List all user's quizzes |
| `GET` | `/api/quizzes/{id}` | Get quiz with questions (no answers) |
| `POST` | `/api/quizzes/{id}/start` | Start a quiz attempt |
| `POST` | `/api/quizzes/{id}/submit` | Submit quiz answers & get results |
| `GET` | `/api/quizzes/{id}/attempts` | Get all attempts for a quiz |
| `DELETE` | `/api/quizzes/{id}` | Delete a quiz |

**Generate Quiz** – `POST /api/quizzes/generate`
```json
{
  "source_type": "document",
  "source_id": "uuid",
  "num_questions": 10,
  "question_types": ["mcq", "true_false", "fill_blank"],
  "difficulty": "medium"
}
```

---

## 📊 Progress (`/api/progress`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/progress/dashboard` | Comprehensive progress dashboard |
| `POST` | `/api/progress/sessions` | Record a study session |
| `GET` | `/api/progress/recommendations` | Get personalized study recommendations |
| `GET` | `/api/progress/heatmap` | Get activity heatmap data (default: 365 days) |

---

## Error Responses

All endpoints return standard HTTP error codes:

| Code | Description |
|------|-------------|
| `400` | Bad Request — Invalid input |
| `401` | Unauthorized — Missing or invalid token |
| `403` | Forbidden — Insufficient permissions |
| `404` | Not Found — Resource doesn't exist |
| `500` | Internal Server Error |

Error response format:
```json
{
  "detail": "Error message describing what went wrong"
}
```
