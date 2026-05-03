# 🚀 CI/CD Pipeline

Automated testing, building, and deployment pipeline for Smart Learning Companion.

**Live Deployment**: Google Cloud Run (`asia-southeast1`)

---

## Overview

```
Push to main
     ↓
CircleCI Pipeline
     ├── test-frontend  (lint)
     ├── test-backend   (pytest + Postgres + Elasticsearch)
     │
     ├── [main only] build-and-push-backend  → gcr.io/learning-agent-486514/learning-assistant-backend
     ├── [main only] build-and-push-frontend → gcr.io/learning-agent-486514/learning-assistant-frontend
     │
     └── [main only] deploy
           ├── Cloud Run: learning-assistant-backend
           └── Cloud Run: learning-assistant-frontend
```

---

## CircleCI Config

**File**: [`.circleci/config.yml`](../.circleci/config.yml)

### Reusable Commands

```yaml
commands:
  gcp-auth:           # Authenticate với GCP (dùng trong deploy)
  gcp-auth-with-docker: # Cài Docker CLI + authenticate GCP (dùng trong build)
```

### Jobs

| Job | Trigger | Mô tả |
|-----|---------|-------|
| `test-frontend` | Mọi push | Lint với Node.js |
| `test-backend` | Mọi push | pytest với Postgres + ES containers |
| `build-and-push-backend` | `main` only | Build & push image lên GCR |
| `build-and-push-frontend` | `main` only | Build & push image lên GCR |
| `deploy` | `main` only, sau build | Deploy lên Cloud Run |

### Docker Image Tags

Mỗi build tạo **2 tags**:
- `:latest` — bản mới nhất
- `:<CIRCLE_SHA1>` — gắn với commit hash cụ thể (dùng để rollback)

Deploy sử dụng `:<CIRCLE_SHA1>` để tránh race condition khi nhiều pipeline chạy đồng thời.

### CircleCI Environment Variables

Cấu hình tại **Project Settings → Environment Variables**:

| Variable | Giá trị | Mô tả |
|----------|---------|-------|
| `GCP_PROJECT` | `learning-agent-486514` | GCP Project ID |
| `GCP_REGION` | `asia-southeast1` | Region deploy |
| `GCP_SERVICE_ACCOUNT_KEY` | base64 encoded JSON | Service account key của `circleci-deployer` |
| `BACKEND_URL` | `https://learning-assistant-backend-xxx.run.app` | URL Cloud Run backend (set sau lần deploy đầu) |

---

## GCP Infrastructure

### Google Container Registry (GCR)

Images được lưu tại:
```
gcr.io/learning-agent-486514/learning-assistant-backend
gcr.io/learning-agent-486514/learning-assistant-frontend
```

### Cloud Run Services

| Service | Image | Region |
|---------|-------|--------|
| `learning-assistant-backend` | `gcr.io/.../learning-assistant-backend` | `asia-southeast1` |
| `learning-assistant-frontend` | `gcr.io/.../learning-assistant-frontend` | `asia-southeast1` |

**Backend Cloud Run config:**
- Memory: 2 GiB, CPU: 1 vCPU
- Min instances: 0 (scale to zero), Max: 1
- Port: 8001
- VPC: Connected (để reach Elasticsearch VM qua internal IP)
- Cloud SQL: `learning-agent-486514:asia-southeast1:learning-assistant-db`
- Execution environment: Second generation

### Cloud SQL (PostgreSQL 16)

| Setting | Giá trị |
|---------|---------|
| Instance | `learning-assistant-db` |
| Tier | `db-f1-micro` |
| Region | `asia-southeast1` |
| Database | `learning_assistant` |
| User | `learning_user` |

Connection string (lưu trong Secret Manager):
```
postgresql+asyncpg://learning_user:PASSWORD@/learning_assistant?host=/cloudsql/learning-agent-486514:asia-southeast1:learning-assistant-db
```

### Elasticsearch (GCE VM)

| Setting | Giá trị |
|---------|---------|
| VM Name | `elasticsearch-vm` |
| Zone | `asia-southeast1-a` |
| Machine | `e2-medium` (2 vCPU, 4 GB RAM) |
| OS | Ubuntu 22.04 LTS |
| Disk | 20 GB SSD |
| Internal IP | `10.148.0.2` |
| Version | Elasticsearch 9.3.1 |

Firewall rule `allow-elasticsearch`:
- Protocol: TCP port 9200
- Source: `10.128.0.0/9` (internal GCP only)
- Target tags: `elasticsearch`

### Secret Manager

Secrets được lưu trong GCP Secret Manager và inject vào Cloud Run:

| Secret Name | Mô tả |
|-------------|-------|
| `DATABASE_URL` | PostgreSQL connection string |
| `ES_HOST` | Elasticsearch internal IP (`10.148.0.2`) |
| `ES_PASSWORD` | Elasticsearch password |
| `JWT_SECRET_KEY` | JWT signing key |
| `OPENAI_API_KEY` | OpenAI API key (nếu dùng) |
| `GOOGLE_API_KEY` | Google AI API key (nếu dùng) |

---

## Service Account

Service account `circleci-deployer@learning-agent-486514.iam.gserviceaccount.com` có các quyền:

| Role | Mục đích |
|------|---------|
| `roles/storage.admin` | Push images lên GCR |
| `roles/artifactregistry.writer` | Push lên Artifact Registry |
| `roles/run.admin` | Deploy Cloud Run services |
| `roles/secretmanager.secretAccessor` | Đọc secrets |
| `roles/iam.serviceAccountUser` | ActAs Compute service account khi deploy |

### Tạo key mới (khi cần):

```bash
gcloud iam service-accounts keys create /tmp/circleci-key.json \
  --iam-account=circleci-deployer@learning-agent-486514.iam.gserviceaccount.com

# Encode sang base64 và lưu vào CircleCI
base64 -w 0 /tmp/circleci-key.json

rm /tmp/circleci-key.json
```

---

## Setup Guide

### 1. GCP Setup

```bash
# Enable các APIs cần thiết
gcloud services enable run.googleapis.com \
  containerregistry.googleapis.com \
  secretmanager.googleapis.com \
  sqladmin.googleapis.com \
  --project=learning-agent-486514

# Authenticate Docker với GCR
gcloud auth configure-docker
```

### 2. CircleCI Setup

1. Connect repository tại [circleci.com](https://circleci.com)
2. **Project Settings → Environment Variables** → Thêm 4 biến:
   - `GCP_PROJECT`, `GCP_REGION`, `GCP_SERVICE_ACCOUNT_KEY`, `BACKEND_URL`

### 3. Deploy lần đầu (thủ công)

```bash
# Build & push backend
docker tag learning_assistant-backend:latest \
  gcr.io/learning-agent-486514/learning-assistant-backend:latest
docker push gcr.io/learning-agent-486514/learning-assistant-backend:latest

# Deploy backend
gcloud run deploy learning-assistant-backend \
  --image gcr.io/learning-agent-486514/learning-assistant-backend:latest \
  --platform managed \
  --region asia-southeast1 \
  --project learning-agent-486514

# Lấy URL backend → set vào CircleCI BACKEND_URL
gcloud run services describe learning-assistant-backend \
  --region asia-southeast1 \
  --format="value(status.url)"
```

---

## Rollback

Để rollback về một commit cụ thể:

```bash
# Xem danh sách images
gcloud container images list-tags gcr.io/learning-agent-486514/learning-assistant-backend

# Rollback về commit hash cụ thể
gcloud run deploy learning-assistant-backend \
  --image gcr.io/learning-agent-486514/learning-assistant-backend:<CIRCLE_SHA1> \
  --platform managed \
  --region asia-southeast1 \
  --project learning-agent-486514
```

---

## Ước tính chi phí (Free Trial $300)

| Service | Chi phí/tháng |
|---------|---------------|
| Cloud Run (backend, ~4h/ngày) | ~$7-10 |
| GCE VM Elasticsearch (e2-medium) | ~$32 |
| Cloud SQL (db-f1-micro) | ~$10 |
| **Tổng** | **~$50/tháng** |

> Free trial $300 → dùng được khoảng **6 tháng**.
> Sau 90 ngày nếu không nhấn "Activate" → tài khoản suspended, không tự động tính phí.
