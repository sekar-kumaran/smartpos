#!/usr/bin/env bash
# SmartPOS AI – Stack health check
# Usage: ./devops/scripts/health-check.sh [--compose-file docker-compose.yml]
# Exit 0 = all healthy, exit 1 = one or more unhealthy/missing.

set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
BACKEND_URL="${BACKEND_URL:-http://localhost:8000}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost}"
TIMEOUT=5
PASS=0
FAIL=0

# ── Helpers ───────────────────────────────────────────────────────────────────

green() { printf '\033[32m✓  %s\033[0m\n' "$*"; }
red()   { printf '\033[31m✗  %s\033[0m\n' "$*"; }

check() {
  local label="$1"; shift
  if "$@" &>/dev/null; then
    green "$label"
    PASS=$((PASS + 1))
  else
    red "$label"
    FAIL=$((FAIL + 1))
  fi
}

http_ok() {
  curl -fsS --max-time "$TIMEOUT" "$1" >/dev/null
}

json_field() {
  # json_field <url> <field> <expected>
  local val
  val=$(curl -fsS --max-time "$TIMEOUT" "$1" | grep -o "\"$2\":\"[^\"]*\"" | head -1 | cut -d'"' -f4)
  [ "$val" = "$3" ]
}

# ── Docker container status ───────────────────────────────────────────────────

echo ""
echo "── Container status ──────────────────────────────────────────────────────"

for svc in postgres redis backend frontend nginx celery-worker celery-beat; do
  name="smartpos-${svc}"
  state=$(docker inspect --format '{{.State.Status}}' "$name" 2>/dev/null || echo "missing")
  health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}}' "$name" 2>/dev/null || echo "n/a")

  if [ "$state" = "running" ]; then
    if [ "$health" = "n/a" ] || [ "$health" = "healthy" ]; then
      green "$name  (state=$state, health=$health)"
      PASS=$((PASS + 1))
    else
      red "$name  (state=$state, health=$health)"
      FAIL=$((FAIL + 1))
    fi
  else
    red "$name  (state=$state)"
    FAIL=$((FAIL + 1))
  fi
done

# ── HTTP endpoint checks ──────────────────────────────────────────────────────

echo ""
echo "── HTTP endpoints ────────────────────────────────────────────────────────"

check "Backend /health/live"  http_ok "${BACKEND_URL}/health/live"
check "Backend /health/ready" http_ok "${BACKEND_URL}/health/ready"
check "Backend status=ready"  json_field "${BACKEND_URL}/health/ready" "status" "ready"
check "Frontend /"            http_ok "${FRONTEND_URL}/"
check "Frontend /healthz"     http_ok "${FRONTEND_URL}/healthz"

# ── Database reachability ─────────────────────────────────────────────────────

echo ""
echo "── Database ──────────────────────────────────────────────────────────────"

check "Postgres pg_isready" \
  docker exec smartpos-postgres pg_isready -U "${POSTGRES_USER:-smartpos}" -d "${POSTGRES_DB:-smartpos}"

# ── Redis reachability ────────────────────────────────────────────────────────

echo ""
echo "── Redis ─────────────────────────────────────────────────────────────────"

check "Redis PING" \
  docker exec smartpos-redis redis-cli ping

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "── Summary ───────────────────────────────────────────────────────────────"
printf 'Passed: %d   Failed: %d\n' "$PASS" "$FAIL"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "Run 'docker compose -f ${COMPOSE_FILE} logs --tail=50 <service>' to investigate."
  exit 1
fi

exit 0
