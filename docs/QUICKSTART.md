# 🚀 Quick Start Guide

Complete setup guide for running Smart Learning Companion locally or with Docker.

## Prerequisites

- **Python 3.11+**
- **Node.js 18+**
- **Docker & Docker Compose** (for containerized setup)
- **OpenAI** or **Google API key** (for AI features)

## Option 1: Docker Setup (Recommended)

The fastest way to get everything running with hot-reload support.

### 1. Clone & Configure

```bash
git clone <repo-url>
cd learning_assistant

# Copy environment template
cp .env.example .env
# Edit .env with your API keys and credentials
```

### 2. Start All Services

```bash
# Start all services (PostgreSQL, Elasticsearch, Backend, Frontend)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

### 3. Access the App

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8001 |
| API Docs (Swagger) | http://localhost:8001/docs |
| PostgreSQL | `localhost:5432` |
| Elasticsearch | http://localhost:9200 |

### Docker Commands Reference

```bash
# View running containers
docker-compose ps

# Rebuild after code changes
docker-compose up -d --build

# Rebuild specific service
docker-compose up -d --build backend

# Access backend shell
docker-compose exec backend bash

# Access database
docker-compose exec postgres psql -U learning_user -d learning_assistant

# View logs for specific service
docker-compose logs -f backend

# Clean up (Warning: removes volumes/data)
docker-compose down -v
```

---

## Option 2: Manual Setup

Run each service individually for more control.

### 1. Clone & Configure

```bash
git clone <repo-url>
cd learning_assistant

# Copy environment template
cp .env.example .env
# Edit .env with your API keys
```

### 2. Start Infrastructure

```bash
# Start PostgreSQL and Elasticsearch via Docker
docker-compose up -d postgres elasticsearch
```

### 3. Start Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

### 4. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

### 5. Access the App

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8001 |
| API Docs (Swagger) | http://localhost:8001/docs |

---

## 🔧 Environment Variables

Create a `.env` file in the project root (see `.env.example` for a template):

```env
# === Database ===
POSTGRES_USER=learning_user
POSTGRES_PASSWORD=learning_pass
POSTGRES_DB=learning_assistant
DATABASE_URL=postgresql+asyncpg://learning_user:learning_pass@localhost:5432/learning_assistant

# === Elasticsearch (Vector Store) ===
ES_HOST=localhost
ES_PORT=9200
ES_USERNAME=elastic
ES_PASSWORD=your-elastic-password
ES_CA_CERT=/path/to/http_ca.crt   # chỉ cần khi dùng TLS (local WSL2)
ES_INDEX_NAME=learning_documents

# === JWT Authentication ===
JWT_SECRET_KEY=your-super-secret-key        # Change in production!
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# === AI API Keys (choose one or both) ===
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...

# === URLs ===
FRONTEND_URL=http://localhost:3000
CORS_ORIGINS=["http://localhost:3000"]
NEXT_PUBLIC_API_URL=http://localhost:8001/api

# === CI/CD (CircleCI + GCP) ===
GCP_PROJECT=learning-agent-486514
GCP_REGION=asia-southeast1
GCP_SERVICE_ACCOUNT_KEY=<base64-encoded-service-account-key>
BACKEND_URL=https://learning-assistant-backend-xxx.run.app
```

> [!IMPORTANT]
> When using Docker Compose, database hostnames change from `localhost` to the service names (e.g., `postgres`, `elasticsearch`). The `docker-compose.yml` handles this automatically via environment overrides.
> 
> **Elasticsearch TLS note:** Docker Compose chạy ES với `xpack.security.http.ssl.enabled=false` (không TLS) để đơn giản hóa dev. Khi chạy local (WSL2) thì ES dùng TLS — cần set `ES_CA_CERT` trỏ đến `http_ca.crt`.

---

## 🌐 Production Deployment

The application is deployed on **Google Cloud Run** (region: `asia-southeast1`).

### Infrastructure:

| Service | Platform |
|---------|----------|
| Backend API | Cloud Run |
| Frontend | Cloud Run |
| PostgreSQL | Cloud SQL (db-f1-micro) |
| Elasticsearch | GCE VM (e2-medium, Ubuntu 22.04) |
| Secrets | Secret Manager |
| Docker Images | Google Container Registry (gcr.io) |

For CI/CD details and deployment pipeline, see [CICD.md](./CICD.md).
