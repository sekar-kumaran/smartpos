pipeline {
  agent {
    node {
      label ''
      customWorkspace '/workspace'
    }
  }

  environment {
    APP_NAME             = 'smartpos-ai'
    BACKEND_IMAGE        = 'smartpos-ai-backend'
    FRONTEND_IMAGE       = 'smartpos-ai-frontend'
    IMAGE_TAG            = "${env.BUILD_NUMBER ?: 'local'}"
    COMPOSE_PROJECT_NAME = 'smartpos-ai'
    DOCKER_BUILDKIT      = '1'
    RESULTS_DIR          = '/tmp/ci-results'
  }

  options {
    buildDiscarder(logRotator(numToKeepStr: '20', artifactNumToKeepStr: '5'))
    disableConcurrentBuilds()
    timeout(time: 45, unit: 'MINUTES')
    timestamps()
  }

  stages {

    // ── 1. Checkout ─────────────────────────────────────────────────────────────
    stage('Checkout') {
      steps {
        sh 'git log -1 --oneline || echo "No git history in mounted volume"'
        sh 'echo "Build ${IMAGE_TAG} — workspace: ${WORKSPACE}"'
        sh "mkdir -p ${RESULTS_DIR}"
      }
    }

    // ── 2. Build backend image (with layer-cache reuse) ──────────────────────────
    stage('Build backend image') {
      steps {
        sh '''
          DOCKER_BUILDKIT=1 docker build \
            --target runtime \
            --cache-from ${BACKEND_IMAGE}:latest \
            --build-arg BUILDKIT_INLINE_CACHE=1 \
            -t ${BACKEND_IMAGE}:ci-${IMAGE_TAG} \
            ./backend
        '''
      }
    }

    // ── 3. Backend tests (SQLite in-memory; no Postgres dependency) ──────────────
    //    • Results written to a named volume shared with Jenkins host.
    //    • Build FAILS if pytest exits non-zero.
    //    • Coverage enforced at 70 % via pyproject.toml fail_under.
    stage('Backend tests') {
      steps {
        sh """
          docker run --rm \
            --name smartpos-ci-test-${IMAGE_TAG} \
            -e APP_ENV=test \
            -e DEBUG=false \
            -e SECRET_KEY=${CI_SECRET_KEY:-ci-secret-key-not-for-prod} \
            -e AES_ENCRYPTION_KEY=${CI_AES_KEY:-ci-aes-key-not-for-prod} \
            -e DATABASE_URL=sqlite+aiosqlite:///:memory: \
            -e SQLITE_URL=sqlite+aiosqlite:///:memory: \
            -e REDIS_URL=redis://localhost:6379/0 \
            -v ${RESULTS_DIR}:/results \
            ${BACKEND_IMAGE}:ci-${IMAGE_TAG} \
            sh -c "
              pip install pytest-cov --quiet &&
              pytest tests/ -q --tb=short \
                --cov=app \
                --cov-report=xml:/results/coverage.xml \
                --cov-report=term-missing \
                --junitxml=/results/backend-results.xml \
                -p no:cacheprovider
            "
        """
      }
      post {
        always {
          junit testResults: "${RESULTS_DIR}/backend-results.xml",
                allowEmptyResults: false
          publishCoverage adapters: [coberturaAdapter("${RESULTS_DIR}/coverage.xml")],
                          sourceFileResolver: sourceFiles('NEVER_STORE')
        }
      }
    }

    // ── 4. Build frontend image (type-check + Vite build in builder stage) ────────
    stage('Build frontend image') {
      steps {
        sh '''
          DOCKER_BUILDKIT=1 docker build \
            --target runtime \
            --cache-from ${FRONTEND_IMAGE}:latest \
            --build-arg BUILDKIT_INLINE_CACHE=1 \
            -t ${FRONTEND_IMAGE}:ci-${IMAGE_TAG} \
            -t ${FRONTEND_IMAGE}:demo \
            ./frontend
        '''
      }
    }

    // 5. Tag local demo images
    stage('Tag images') {
      steps {
        sh '''
          docker tag ${BACKEND_IMAGE}:ci-${IMAGE_TAG}  ${BACKEND_IMAGE}:demo
          docker tag ${BACKEND_IMAGE}:ci-${IMAGE_TAG}  ${BACKEND_IMAGE}:${IMAGE_TAG}
          docker tag ${FRONTEND_IMAGE}:ci-${IMAGE_TAG} ${FRONTEND_IMAGE}:${IMAGE_TAG}
        '''
      }
    }

    // ── 6. Validate Compose config ────────────────────────────────────────────────
    stage('Validate Compose') {
      steps {
        sh 'docker compose config --quiet && echo "Compose config: OK"'
      }
    }

    // ── 7. Deploy and verify (rolling restart of changed services) ────────────────
    stage('Deploy & verify') {
      steps {
        sh 'docker compose up -d postgres redis'

        sh '''
          echo "Waiting for Postgres…"
          attempt=0
          until docker compose exec -T postgres pg_isready -U smartpos -d smartpos 2>/dev/null; do
            attempt=$((attempt+1))
            [ $attempt -ge 20 ] && { echo "Postgres not ready"; exit 1; }
            sleep 3
          done
          echo "Postgres ready"
        '''

        sh 'docker compose up -d backend frontend'

        sh '''
          echo "Waiting for backend /health/ready…"
          attempt=0
          until docker compose exec -T backend \
              curl -fsS http://localhost:8000/health/ready \
              | grep -q '"status":"ready"'; do
            attempt=$((attempt+1))
            if [ $attempt -ge 30 ]; then
              echo "Backend did not become ready in time"
              docker compose logs backend --tail 60
              exit 1
            fi
            sleep 3
          done
          echo "Backend ready after $((attempt * 3))s"
        '''

        sh '''
          docker compose exec -T frontend wget -qO- http://127.0.0.1/healthz \
            && echo "Frontend: OK" \
            || echo "Frontend healthz: no response (non-fatal for SPA)"
        '''

        sh 'docker compose ps'
      }
    }
  }

  post {
    success {
      // Promote local latest tag only on green builds
      sh 'docker tag ${BACKEND_IMAGE}:${IMAGE_TAG}  ${BACKEND_IMAGE}:latest  || true'
      sh 'docker tag ${FRONTEND_IMAGE}:${IMAGE_TAG} ${FRONTEND_IMAGE}:latest || true'
      echo "Build ${IMAGE_TAG} promoted to :latest"
    }
    failure {
      sh 'docker compose logs --tail 100 || true'
      echo "Build ${IMAGE_TAG} FAILED — :latest tag NOT updated"
    }
    always {
      // Remove CI-only images; keep :demo and :latest for fast restarts
      sh 'docker rmi ${BACKEND_IMAGE}:ci-${IMAGE_TAG}  || true'
      sh 'docker rmi ${FRONTEND_IMAGE}:ci-${IMAGE_TAG} || true'
      sh "rm -rf ${RESULTS_DIR} || true"
    }
  }
}
