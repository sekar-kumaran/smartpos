# SmartPOS AI Demo Runbook

## One-command startup

Windows PowerShell:

```powershell
.\start_demo.ps1
```

Git Bash or Linux shell:

```sh
./start_demo.sh
```

The script builds and starts PostgreSQL, Redis, FastAPI, the web frontend, and Dockerized Jenkins, then verifies health endpoints.

## Demo URLs

- Frontend: http://localhost:3000
- Backend health: http://localhost:8000/health
- Backend readiness: http://localhost:8000/health/ready
- API docs: http://localhost:8000/api/docs
- Jenkins: http://localhost:8081

## Docker workflow

```sh
docker compose build backend frontend jenkins
docker compose up -d postgres redis backend frontend jenkins
docker compose ps
docker compose logs -f backend
```

PostgreSQL data is stored in the named `postgres_data` volume. Do not prune named volumes before the demo.

## Jenkins pipeline

The `Jenkinsfile` is pipeline-as-code for the Dockerized Jenkins container. It:

1. Checks out the latest source.
2. Installs frontend dependencies and builds the backend runtime image.
3. Runs backend tests inside the backend image.
4. Runs TypeScript validation and a frontend web build.
5. Builds final demo Docker images.
6. Validates Compose configuration.
7. Deploys PostgreSQL, Redis, backend, and frontend containers.
8. Verifies backend and frontend health from the Jenkins container network.

Jenkins uses the host Docker socket mounted into the container so it can build and deploy local images without a separate external Jenkins installation.

## Architecture overview

SmartPOS AI is an offline-first retail operating system:

- React Native/React Native Web frontend for POS workflows.
- FastAPI backend with JWT authentication, billing, inventory, credit, backup, and analytics routes.
- PostgreSQL primary database with tenant-aware models.
- SQLite support for offline device cache paths.
- Redis/Celery support for background sync and maintenance tasks.
- Docker Compose for reproducible demo startup.
- Jenkins and GitHub Actions entry points for CI/CD.

## Demo differentiators

- Offline-first sales and sync model.
- GST-aware billing and inventory logic.
- Business Health Engine surfaces stock, credit, revenue, and anomaly signals.
- Demo fallback data keeps the staff demo usable even if live API calls fail.
- Health checks and one-command startup reduce setup risk on demo day.

## Safe cleanup

Safe pre-demo cleanup:

```sh
docker container prune -f
docker builder prune -f
docker image prune -f
```

Avoid:

```sh
docker volume prune
```

unless `postgres_data`, `smartpos-ai_postgres_data`, and `jenkins_home` have been backed up or explicitly excluded.
