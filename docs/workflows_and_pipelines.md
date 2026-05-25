# SmartPOS AI — Workflows & Pipelines Reference
### Technical diagrams for PPT Slides 7–12

---

## 1. Overall DevOps Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DEVELOPER MACHINE                            │
│                                                                     │
│   ┌──────────┐    edits     ┌───────────────────────────────────┐  │
│   │Developer │──────────────▶  /smartpos-ai/  (project folder)  │  │
│   └──────────┘              └──────────────┬────────────────────┘  │
│                                            │ volume mounted at      │
│                                            │ /workspace             │
└────────────────────────────────────────────┼────────────────────────┘
                                             │
                              ┌──────────────▼──────────────┐
                              │      DOCKER COMPOSE          │
                              │  (runs on developer machine) │
                              └──────────────┬──────────────┘
                                             │
        ┌────────────────────────────────────┼────────────────────────────────┐
        │                                    │                                │
        ▼                    ▼               ▼               ▼               ▼
┌──────────────┐   ┌──────────────┐  ┌──────────────┐  ┌──────┐  ┌──────────────┐
│   Jenkins    │   │   Backend    │  │   Frontend   │  │  DB  │  │    Redis     │
│  :8081       │   │  FastAPI     │  │  nginx+React │  │ Pg16 │  │   :6379      │
│  CI/CD       │   │  :8000       │  │  :3000       │  │:5432 │  │  Cache+Queue │
└──────┬───────┘   └──────────────┘  └──────────────┘  └──────┘  └──────────────┘
       │
       │  Build Now clicked
       │
       ▼
┌─────────────────────────────────┐
│     JENKINS PIPELINE            │
│  7 stages → rebuild → redeploy  │
└─────────────────────────────────┘
```

---

## 2. Jenkins CI/CD Pipeline — Detailed Flow

```
                        ┌─────────────────────────────────────────────┐
                        │           JENKINS PIPELINE                  │
                        │         (triggered: Build Now)              │
                        └─────────────────┬───────────────────────────┘
                                          │
                    ┌─────────────────────▼──────────────────────┐
                    │  STAGE 1: CHECKOUT                         │
                    │  • No git clone needed                     │
                    │  • Code already at /workspace (mounted)    │
                    │  • git log -1 → show last commit           │
                    │  • ls → verify files present               │
                    └─────────────────────┬──────────────────────┘
                                          │ ✅
                    ┌─────────────────────▼──────────────────────┐
                    │  STAGE 2: BUILD BACKEND IMAGE              │
                    │  docker build ./backend                    │
                    │  --target runtime                          │
                    │  --cache-from backend:latest               │
                    │  → tags: smartpos-ai-backend:ci-{N}        │
                    └─────────────────────┬──────────────────────┘
                                          │ ✅
                    ┌─────────────────────▼──────────────────────┐
                    │  STAGE 3: BACKEND TESTS                    │
                    │  docker run --rm (temporary container)     │
                    │  -e APP_ENV=test                           │
                    │  -e SQLITE_URL=sqlite:///:memory:          │
                    │  pytest tests/ -q --tb=short               │
                    │  → container auto-deleted after            │
                    │  → no real PostgreSQL needed               │
                    └─────────────────────┬──────────────────────┘
                                          │ ✅ tests pass
                    ┌─────────────────────▼──────────────────────┐
                    │  STAGE 4: BUILD FRONTEND IMAGE             │
                    │  Pass 1: docker build --target builder     │
                    │    → npm ci → tsc --noEmit                 │
                    │    → vite build → dist/ folder             │
                    │  Pass 2: docker build --target runtime     │
                    │    → nginx + dist/ only (28MB image)       │
                    │  → tags: smartpos-ai-frontend:demo         │
                    └─────────────────────┬──────────────────────┘
                                          │ ✅
                    ┌─────────────────────▼──────────────────────┐
                    │  STAGE 5: TAG PRODUCTION IMAGES            │
                    │  docker compose build backend              │
                    │  docker tag backend:demo  backend:{N}      │
                    │  docker tag frontend:demo frontend:{N}     │
                    │  → numbered tags = rollback history        │
                    └─────────────────────┬──────────────────────┘
                                          │ ✅
                    ┌─────────────────────▼──────────────────────┐
                    │  STAGE 6: VALIDATE COMPOSE                 │
                    │  docker compose config --quiet             │
                    │  → validates docker-compose.yml syntax     │
                    │  → catches misconfiguration before deploy  │
                    └─────────────────────┬──────────────────────┘
                                          │ ✅
                    ┌─────────────────────▼──────────────────────┐
                    │  STAGE 7: DEPLOY & VERIFY                  │
                    │  docker compose up -d postgres redis       │
                    │                       backend frontend     │
                    │                                            │
                    │  Health check loop (30 attempts × 3s):    │
                    │  until curl /health/ready returns "ready"  │
                    │    → attempt 1… 2… 3… (wait 3s each)      │
                    │                                            │
                    │  Frontend: wget /healthz → "ok"            │
                    │  docker compose ps → show all status       │
                    └─────────────────────┬──────────────────────┘
                                          │
                    ┌─────────────────────┴──────────────────────┐
                    │                                            │
                    ▼                                            ▼
        ┌───────────────────────┐               ┌───────────────────────┐
        │   ✅ BUILD SUCCESS    │               │   ❌ BUILD FAILED     │
        │                       │               │                       │
        │ • :demo images live   │               │ • Old containers kept │
        │ • Containers replaced │               │ • No user impact      │
        │ • New version running │               │ • Logs dumped (80 ln) │
        │ • ci-{N} images       │               │ • ci images deleted   │
        │   auto-deleted        │               │ • Dev gets notified   │
        └───────────────────────┘               └───────────────────────┘
```

---

## 3. Docker Service Dependency Graph

```
docker compose up -d
│
├── postgres (starts first — no deps)
│   └── healthcheck: pg_isready every 10s
│
├── redis (starts first — no deps)
│   └── healthcheck: redis-cli ping every 10s
│
├── backend (waits for postgres + redis healthy)
│   ├── depends_on: postgres (healthy)
│   ├── depends_on: redis (healthy)
│   ├── healthcheck: GET /health/ready every 20s
│   └── env: DATABASE_URL, REDIS_URL, SECRET_KEY, AES_KEY
│
├── frontend (waits for backend healthy)
│   ├── depends_on: backend (healthy)
│   ├── nginx serves React SPA on :80
│   ├── /api/* → proxy_pass http://backend:8000
│   └── healthcheck: GET /healthz every 15s
│
├── celery-worker (waits for backend + redis)
│   ├── profile: workers (optional, not default)
│   ├── same image as backend
│   └── runs: celery -A app.worker worker
│
├── jenkins (starts independently)
│   ├── volume: ./:/workspace (project mounted)
│   ├── volume: /var/run/docker.sock (Docker access)
│   └── exposes: :8081 (UI), :50000 (agents)
│
└── nginx (profile: edge — production only)
    ├── routes: / → frontend:80
    ├── routes: /api/ → backend:8000
    └── SSL termination
```

---

## 4. Docker Multi-Stage Build — Backend

```
Dockerfile (backend)
│
├── STAGE 1: builder (python:3.12-slim)
│   ├── apt install: gcc, libpq-dev (compile deps)
│   ├── pip wheel: build all .whl packages
│   └── Output: /wheels/ (pre-compiled packages)
│
└── STAGE 2: runtime (python:3.12-slim)  ← FINAL IMAGE
    ├── apt install: libpq5, curl (runtime only)
    ├── adduser: smartpos (non-root)
    ├── pip install: from /wheels (no internet needed)
    ├── COPY: application code
    ├── EXPOSE 8000
    └── CMD: uvicorn app.main:app --host 0.0.0.0

Result:
  builder stage:  ~900MB (with gcc, build tools)
  runtime image:  ~180MB (only what runs in prod)
```

---

## 5. Docker Multi-Stage Build — Frontend

```
Dockerfile (frontend)
│
├── STAGE 1: builder (node:20-alpine)
│   ├── WORKDIR /app
│   ├── COPY package*.json
│   ├── RUN npm ci (install all deps)
│   ├── COPY . .
│   ├── RUN npm run type-check  → tsc --noEmit
│   ├── RUN npm run web:build   → vite build
│   └── Output: /app/dist/ (static HTML/JS/CSS)
│
└── STAGE 2: runtime (nginx:1.27-alpine)  ← FINAL IMAGE
    ├── COPY docker/nginx.conf → /etc/nginx/conf.d/
    ├── COPY --from=builder /app/dist → /usr/share/nginx/html
    ├── EXPOSE 80
    └── nginx serves SPA with:
        ├── GET /healthz → "ok" (health probe)
        ├── GET /api/* → proxy to backend:8000
        └── GET /* → index.html (SPA routing)

Result:
  builder stage:  ~600MB (node_modules, build tools)
  runtime image:   ~28MB (nginx + compiled assets only)
```

---

## 6. Frontend nginx Proxy Flow (CORS Solution)

```
BEFORE (broken — CORS error):
Browser (127.0.0.1:3000) → direct call → localhost:8000
                                          ↑
                              BLOCKED by browser CORS policy
                              "No Access-Control-Allow-Origin"

AFTER (fixed — same-origin):
Browser (127.0.0.1:3000)
    │
    │  GET /api/v1/analytics/dashboard
    │  (relative URL — same origin)
    ▼
nginx container (:80 / :3000)
    │
    │  proxy_pass http://backend:8000
    │  (internal Docker network — no browser involved)
    ▼
FastAPI backend (:8000)
    │
    │  HTTP 200 JSON response
    ▼
nginx → Browser
    ✅ No CORS, no external domain, no browser restriction
```

---

## 7. API Request Lifecycle

```
User taps Dashboard
        │
        ▼
React frontend
  api.ts → baseURL: '/api/v1'  (relative, web build)
  axios.get('/api/v1/analytics/dashboard?store_id=2')
  + Authorization: Bearer <JWT token>
        │
        ▼
nginx (:3000 or :80)
  location /api/ {
    proxy_pass http://backend:8000;
  }
        │
        ▼
FastAPI backend (:8000)
  GET /api/v1/analytics/dashboard
  → get_current_user_id() validates JWT
  → AnalyticsService.get_dashboard_summary(db, store_id=2)
      ├── get_profit_summary()  → query Sales table
      ├── get_inventory_health() → query Products + Variants
      ├── get_credit_exposure() → query Credits table
      └── get_recent_alerts()  → query BusinessAlerts
  → returns DashboardSummary JSON
        │
        ▼
Frontend receives response
  DashboardScreen renders:
  ├── KPI cards (revenue, transactions)
  ├── Inventory health metrics
  ├── Credit exposure card
  └── Recent alert mini-cards
```

---

## 8. Offline Sync Architecture (SQLite → PostgreSQL)

```
ONLINE MODE                        OFFLINE MODE
─────────────────                  ─────────────────
Device has internet                Device has no internet

API call → FastAPI                 API call → SQLite (local)
  → PostgreSQL                       → stored locally
  → response                         → queued for sync
                                      
                    ↕ sync when back online ↕

                  SyncService runs:
                  1. GET /sync/pending → fetch unsynced local records
                  2. POST /sync/push   → send to server
                  3. GET /sync/pull    → get server changes
                  4. conflict resolution (server wins by default)
                  5. mark local records as synced

Local DB: SQLite (on device)
Cloud DB: PostgreSQL (server)
Sync key: local_id (UUID) on every record
```

---

## 9. Infrastructure Scope (Community Edition)

The Community Edition ships with Docker and Docker Compose only.
Production orchestration (Kubernetes, Helm, autoscaling) is intentionally
removed to avoid exposing internal deployment strategies.

---

## 10. Celery Background Task Flow

```
Frontend / API triggers task
           │
           │  e.g. POST /analytics/run-anomaly-detection
           │
           ▼
FastAPI backend
  celery_app.send_task('analytics.anomaly_scan', args=[store_id])
           │
           ▼
Redis (message broker)
  Queue: celery
  Task message stored
           │
           ▼
Celery Worker (separate container)
  Picks up task from Redis queue
  Optional: AnalyticsService.run_anomaly_detection(db, store_id)
  (Disabled by default in Community Edition)
    ├── Query last 30 days revenue
    ├── Calculate Z-score
    ├── If z < -2.0 → create BusinessAlert (HIGH severity)
    ├── If z > 3.0  → create BusinessAlert (MEDIUM severity)
    └── Check profit margin drop
  Saves alerts to PostgreSQL
           │
           ▼
Frontend
  Dashboard polls /analytics/alerts
  Shows new alert cards in real-time
```

---

## 11. Voice Billing Flow (Community Edition Demo)

```
DEMO FEATURE — local parsing only, no external AI calls

Cashier speaks:
"Two kg sugar, one Maggi, three Parle-G biscuits"
           │
           ▼
WebSocket connection to backend (real-time)
           │
           ▼
Audio captured via browser MediaRecorder API
           │
           ▼
Local demo transcript
  Speech → Text (demo):
  "2 kg sugar 1 Maggi 3 Parle-G biscuits"
           │
           ▼
Regex intent parser (demo):
  {
    "items": [
      {"name": "sugar", "qty": 2, "unit": "kg"},
      {"name": "Maggi", "qty": 1, "unit": "pcs"},
      {"name": "Parle-G", "qty": 3, "unit": "pkt"}
    ]
  }
           │
           ▼
SmartPOS backend — product matcher:
  "sugar" → Product ID 14 (Sugar 1kg) × 2
  "Maggi" → Product ID 27 (Maggi 70g) × 1
  "Parle-G" → Product ID 8 (Parle-G 82g) × 3
           │
           ▼
Cart auto-populated via WebSocket push
  Frontend updates in real-time
  Cashier confirms → proceed to checkout
           │
           ▼
Bill generated: ₹92 (GST inclusive, receipt ready)
```

---

## 12. Complete Technology Stack Summary

```
LAYER            TECHNOLOGY              PURPOSE
─────────────────────────────────────────────────────────────────
Frontend         React Native 0.76       Cross-platform UI
                 react-native-web        Web browser support
                 Vite 5                  Build tool + dev server
                 Zustand                 State management
                 Axios                   HTTP client + JWT
                 TypeScript              Type safety

Backend          FastAPI 0.115           REST API framework
                 SQLAlchemy 2.0 async    ORM + async DB access
                 Alembic                 Database migrations
                 Pydantic v2             Request/response schemas
                 Python-jose             JWT auth
                 Celery 5                Async task queue

Database         PostgreSQL 16           Primary cloud database
                 SQLite (aiosqlite)      Offline on-device store

Cache / Queue    Redis 7                 Celery broker + cache

Infrastructure   Docker 24               Containerization
                 Docker Compose 2        Multi-service local stack
                 Jenkins LTS             CI/CD pipeline
                 nginx 1.27              Reverse proxy + SPA serve

Security         AES-256-GCM            Backup encryption
                 JWT (HS256)             API authentication
                 bcrypt                  Password hashing
                 Env templates          Safe local configuration

Observability    Structured logging      Request ID per log line
                 Health endpoints        /health, /health/ready
                 Docker healthchecks     Per-container monitoring
```
