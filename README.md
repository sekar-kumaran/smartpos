# SmartPOS AI Community Edition

> Public, safe, demo-ready POS platform for portfolio, coursework, and community contributions.

This repository is a controlled public release of SmartPOS AI. It preserves a production-style architecture while removing proprietary intelligence systems, production secrets, and internal deployment details.

## What This Is

- A runnable, GitHub-safe Community Edition
- A showcase of startup-grade engineering and DevOps patterns
- A polished demo with real workflows (billing, inventory, analytics)

## What This Is Not

- The proprietary production system
- A release of advanced AI, fraud detection, or internal orchestration logic
- A repository with production secrets or infrastructure credentials

## Architecture Overview

```
React Native + Web (Vite)
        |
        | HTTPS / JWT
        v
FastAPI Backend (Python)
        |
   -----------------
   |               |
PostgreSQL       SQLite (offline/dev)
   |
Object Storage (optional, encrypted backups)
```

## Community Edition Features

- Billing engine with GST calculations and receipts
- Inventory, products, categories, suppliers, barcode workflows
- Customer and credit ledger management
- Dashboard with KPIs and health cards
- Basic analytics (revenue trends, top products, heatmap)
- Offline-first basics (SQLite fallback, local caching)
- Encrypted backups (AES-256-GCM)
- Docker Compose stack (Postgres, Redis, backend, frontend)
- Jenkins pipeline and GitHub Actions CI

## Removed or Replaced for Public Safety

- External AI voice billing replaced with local demo transcription + regex parsing
- Advanced business intelligence and predictive analytics disabled by default
- Fraud/anomaly scoring disabled by default
- Production tenant orchestration and scaling internals removed
- Production secrets, internal URLs, and private endpoints removed

## Quick Start (Docker)

1) Create environment files

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

The committed examples use demo-safe local placeholders. You can change them,
but no real secrets are required to run the local demo.

2) Start the stack

```bash
docker compose up -d
```

3) Open the app

- Backend API: http://localhost:8000/api/docs
- Web UI:      http://localhost:3000

4) Demo login

Use the "Use Demo Account" button. The community edition uses `/auth/demo` to issue demo tokens without storing a plaintext password.

## Local Development

Backend:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

Frontend (web):

```bash
cd frontend
npm install
npm run web
```

## DevOps

- GitHub Actions runs backend lint/tests and frontend build checks
- Jenkinsfile provides a local CI/CD showcase for Docker builds and health checks
- No production secrets, registry credentials, or SSH deployment logic are included
- Kubernetes manifests are intentionally removed from the Community Edition

## Documentation

- Setup guide: docs/SETUP.md
- Architecture notes: docs/ARCHITECTURE.md
- Security/IP audit: docs/SECURITY_IP_AUDIT.md
- Offline guide: docs/OFFLINE.md
- Demo runbook: DEMO_RUNBOOK.md

## Screenshots

Add screenshots under `docs/screenshots/` and update this section with your images.

## Contributing

See CONTRIBUTING.md for standards, branch strategy, and PR guidelines.

## Security

Please do not file public issues for security vulnerabilities. See SECURITY.md for reporting guidance.
