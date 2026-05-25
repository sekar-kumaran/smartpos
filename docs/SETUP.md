# Setup Guide (Community Edition)

This guide helps you run the SmartPOS AI Community Edition locally with safe defaults.

## Prerequisites

- Docker Desktop (recommended)
- Node.js 20+ (for frontend dev)
- Python 3.12+ (for backend dev)

## Environment Files

Create local env files (never commit these):

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

The example values are demo-safe. You may change them locally, but no production
secret is required for the Community Edition.

## Run with Docker Compose

```bash
docker compose up -d
```

Services:
- Backend: http://localhost:8000/api/docs
- Frontend: http://localhost:3000
- Postgres: localhost:5432
- Redis: localhost:6379

## Demo Login

Use the "Use Demo Account" button. The backend exposes `POST /api/v1/auth/demo` for community demo sessions.

## Run Backend Locally

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

## Run Frontend Locally (Web)

```bash
cd frontend
npm install
npm run web
```

## Feature Flags (Backend)

Set these in `backend/.env`:

- `ENABLE_DEMO_AUTH` (default true)
- `ENABLE_ADVANCED_ANALYTICS` (default false)
- `ENABLE_VOICE` (default true, local demo only)

## Notes

- Advanced analytics are disabled by default in the Community Edition.
- External AI services are not used.
- Production secrets and deployment configs are not included.
