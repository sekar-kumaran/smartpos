#!/usr/bin/env sh
set -eu

wait_for_url() {
  name="$1"
  url="$2"
  attempts="${3:-60}"
  i=1
  while [ "$i" -le "$attempts" ]; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "OK: $name"
      return 0
    fi
    sleep 2
    i=$((i + 1))
  done
  echo "FAILED: $name ($url)" >&2
  return 1
}

docker compose exec -T postgres pg_isready -U smartpos -d smartpos >/dev/null
echo "OK: postgres"

wait_for_url "backend readiness" "http://localhost:8000/health/ready"
wait_for_url "frontend" "http://localhost:3000/healthz"
wait_for_url "jenkins" "http://localhost:8081/login" 90

docker compose ps
