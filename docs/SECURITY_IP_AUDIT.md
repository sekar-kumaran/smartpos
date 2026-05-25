# Security and IP Audit

Audit date: 2026-05-25

Scope: `SmartPOSAI-Community-Edition/` only. The original production folder
`smartpos-ai/` was not modified.

## Public Architecture Overview

Frontend:
- React Native app with Vite web target.
- Screens: onboarding, login, dashboard, billing, inventory, analytics, alerts,
  credit, shifts, price categories, backup, settings, suppliers, GSTR export,
  loyalty, and sales.
- Navigation: onboarding gate, auth stack, five primary tabs, and a "More"
  bottom sheet for secondary workflows.
- State: React context for auth, Zustand cart store with AsyncStorage
  persistence, transient voice prefill state.
- Offline-first: cart/local sale identifiers, AsyncStorage persistence, backend
  SQLite fallback for local/demo operation.
- UI architecture: shared `components/ui`, centralized theme tokens, animated
  tab/splash/bottom-sheet interactions.

Backend:
- FastAPI app under `/api/v1`.
- Routes: auth, billing, inventory, credit, analytics, backup, health, price
  categories, shifts, WhatsApp demo hooks, voice demo hooks, loyalty.
- Services: billing, GST calculator, inventory, credit, backup, auth, basic
  analytics, notification placeholder, anomaly placeholder.
- Auth: JWT access/refresh tokens, bcrypt password hashing, role dependency for
  owner-only backup actions, demo login enabled.
- Analytics: public-safe reporting only: dashboard, profit, revenue trend, top
  products, hourly heatmap. Forecasting and anomaly scoring return empty public
  placeholders.
- Voice: local deterministic demo transcript plus regex item parser; no external
  AI or speech API calls.
- Queue system: Celery demo app with simple `default`, `reports`, `sync`, and
  `notifications` queues. Advanced routing and intelligence schedules removed.

DevOps:
- Docker Compose remains for local demo: Postgres, Redis, backend, frontend,
  optional Jenkins, optional worker, optional nginx edge profile.
- Jenkins remains as a local CI/CD showcase: build images, run backend tests,
  build frontend, validate Compose, start demo services, verify health.
- GitHub Actions remains for public CI: backend lint/tests, frontend type/test
  build, Docker image build validation. Registry login and push were removed.

Infrastructure:
- Public networking is localhost-bound for exposed services.
- Persistent storage is limited to Docker volumes for Postgres, Redis, Jenkins.
- Environment handling uses committed example files only; real `.env` files are
  ignored.
- Cloud upload, Kubernetes, production compose, and registry deployment flows
  are not included.

## Private Architecture Protected

Removed or simplified from the public version:
- Kubernetes manifests and related public infra exposure.
- Production Compose and `.env.prod.example`.
- Registry push flow in GitHub Actions.
- External notification provider implementation.
- Cloud backup upload implementation.
- Advanced anomaly, fraud, predictive demand, daily intelligence, and multi-store
  analytics task orchestration.
- Generated artifacts: `node_modules`, frontend build output, Python bytecode,
  pytest cache folders, and malformed scaffold directories.

## Secret Scan Results

Scanned source, YAML, Docker, Jenkins, GitHub Actions, scripts, hidden env
templates, and generated artifacts before cleanup.

Findings fixed:
- Production-shaped compose and environment template removed.
- Frontend production placeholder URL removed.
- External provider URLs and outbound notification code removed.
- Registry login/push flow removed from GitHub Actions.
- Demo secrets changed to clearly local placeholders.

Remaining expected references:
- Localhost URLs for demo services.
- Demo-only CI placeholder keys.
- `.env.example` and `backend/.env.example` placeholders.

No real API keys, SSH keys, cloud credentials, webhook URLs, private endpoints,
or production URLs remain in the public source.

## DevOps Safety Status

Docker: safe for local demo. No production registry, SSH deploy, or cluster
details.

Docker Compose: retained. Uses localhost bindings and demo defaults.

Jenkins: retained as a local showcase. It builds, tests, validates Compose, and
starts local services. No deployment credentials or SSH logic.

GitHub Actions: retained for CI. Docker images are built but not pushed.

## Proprietary Logic Audit

Safe for public:
- GST calculation and invoice preview.
- Billing, inventory, credit, shifts, loyalty demo workflows.
- Basic dashboards and reports.
- Local encrypted backup creation and restore preview.
- Voice demo parser without external transcription.

Simplified or mocked:
- Anomaly detection.
- Demand forecasting.
- Daily intelligence summaries.
- Notification dispatch.
- Cloud backup upload.

Removed:
- Kubernetes and production deployment material.
- Generated dependency/build/cache artifacts.

## Infrastructure Exposure Audit

No Kubernetes, Helm, Terraform, production ingress, autoscaling, cluster,
registry credential, SSH deployment, or internal IP material remains.

## Final GitHub Safety Status

Status: GitHub-safe after local verification.

The Community Edition remains portfolio-grade while protecting startup IP and
production operations. It showcases React Native, FastAPI, offline-first
patterns, Docker, Jenkins, and CI without exposing proprietary systems.
