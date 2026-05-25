#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$ROOT_DIR"

echo "Starting SmartPOS AI demo stack..."
docker compose up -d --build postgres redis backend frontend jenkins

echo "Waiting for services..."
"$ROOT_DIR/scripts/verify_health.sh"

echo ""
echo "SmartPOS AI demo is ready."
echo "Frontend: http://localhost:3000"
echo "Backend:  http://localhost:8000/health"
echo "API docs: http://localhost:8000/api/docs"
echo "Jenkins:  http://localhost:8081"
