# Architecture Overview (Community Edition)

This document outlines the public Community Edition architecture and highlights the intentionally removed systems.

## High-Level Components

- **Frontend**: React Native + Vite web build
- **Backend**: FastAPI (Python)
- **Data**: PostgreSQL for primary storage, SQLite for offline/dev fallback
- **Jobs**: Celery workers for background tasks
- **Infra**: Docker Compose, Jenkins pipeline, GitHub Actions CI

## Request Flow

1. UI makes API call with JWT
2. FastAPI validates auth and routes to service layer
3. Services use SQLAlchemy for data access
4. Background tasks run via Celery when enabled

## Community Edition Scope

Included:
- Billing, GST, inventory, customers, credit ledger
- Dashboard KPIs and basic analytics
- Offline-first basics with SQLite fallback
- Encrypted backups (AES-256-GCM)

Removed or stubbed:
- External AI voice/NLP services
- Advanced BI scoring and forecasting
- Fraud/anomaly detection (disabled by default)
- Production tenant orchestration and scaling internals
- Kubernetes, production Compose, registry push, and cloud upload flows

## Data Model Highlights

- Stores, users, roles
- Products, variants, categories, suppliers
- Sales, sale items, taxes
- Credits and repayments

## Security Model

- JWT authentication
- Role-based access controls
- No production secrets in repository

## Extending the Community Edition

Advanced analytics placeholders are intentionally empty in the Community
Edition. See `docs/SECURITY_IP_AUDIT.md` for the public/private boundary.
