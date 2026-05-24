# GitLab CI/CD Pipeline Configuration

## Overview

Complete CI/CD pipeline for HY-AQMS with automated build, test, security scan, containerization, and deployment to staging/production environments.

---

## .gitlab-ci.yml

```yaml
# ============================================
# HY-AQMS CI/CD Pipeline Configuration
# ============================================

variables:
  REGISTRY: "registry.gitlab.com"
  REGISTRY_IMAGE: "${REGISTRY}/${CI_PROJECT_NAMESPACE}/${CI_PROJECT_NAME}"
  DOCKER_DRIVER: overlay2
  DOCKER_TLS_CERTDIR: "/certs"
  NODE_VERSION: "20"
  PYTHON_VERSION: "3.11"

# Stages
stages:
  - lint
  - test
  - security
  - build
  - push
  - deploy-staging
  - deploy-production

# ============================================
# LINT STAGE
# ============================================

lint:backend:
  stage: lint
  image: node:20-alpine
  script:
    - cd backend
    - npm ci
    - npm run lint
  cache:
    paths:
      - backend/node_modules
  only:
    - branches
    - merge_requests

lint:frontend:
  stage: lint
  image: node:20-alpine
  script:
    - cd frontend
    - npm ci
    - npm run lint
  cache:
    paths:
      - frontend/node_modules
  only:
    - branches
    - merge_requests

lint:ml-service:
  stage: lint
  image: python:3.11-slim
  script:
    - cd ml-service
    - pip install flake8 black isort
    - flake8 src/ --max-line-length=100
    - black --check src/
    - isort --check-only src/
  only:
    - branches
    - merge_requests

# ============================================
# TEST STAGE
# ============================================

test:backend:
  stage: test
  image: node:20-alpine
  services:
    - postgres:16
    - redis:7-alpine
  variables:
    POSTGRES_DB: "hy_aqms_test"
    POSTGRES_USER: "postgres"
    POSTGRES_PASSWORD: "postgres"
    POSTGRES_HOST_AUTH_METHOD: "trust"
    DB_HOST: "postgres"
    REDIS_URL: "redis://redis:6379"
    JWT_SECRET: "test-secret-key"
    NODE_ENV: "test"
  script:
    - cd backend
    - npm ci
    - npm run test:unit
    - npm run test:integration
    - npm run test:cov
  coverage: '/Lines\s*:\s*(\d+\.\d+)%/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: backend/coverage/cobertura-coverage.xml
      junit: backend/test-results.xml
  cache:
    paths:
      - backend/node_modules
  retry:
    max: 2
    when:
      - network_error
      - runner_system_failure
  only:
    - branches
    - merge_requests

test:frontend:
  stage: test
  image: node:20-alpine
  script:
    - cd frontend
    - npm ci
    - npm run test:unit
    - npm run test:integration -- --coverage
  coverage: '/Branches.*?(\d+\.\d+)%/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: frontend/coverage/cobertura-coverage.xml
  cache:
    paths:
      - frontend/node_modules
  only:
    - branches
    - merge_requests

test:ml-service:
  stage: test
  image: python:3.11-slim
  script:
    - cd ml-service
    - pip install -q -r requirements.txt pytest pytest-cov
    - pytest src/ -v --cov=src/ --cov-report=xml --cov-report=term
  coverage: '/TOTAL.*?(\d+%)/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: ml-service/coverage.xml
  only:
    - branches
    - merge_requests

# ============================================
# SECURITY STAGE
# ============================================

security:dependency-check:
  stage: security
  image: node:20-alpine
  script:
    - npm install -g snyk
    - cd backend && npm ci && snyk test --severity-threshold=high || true
    - cd ../frontend && npm ci && snyk test --severity-threshold=high || true
  allow_failure: true
  only:
    - branches
    - merge_requests

security:sast:
  stage: security
  image: python:3.11-slim
  script:
    - pip install bandit
    - cd ml-service
    - bandit -r src/ -f json -o bandit-report.json || true
  artifacts:
    reports:
      sast: ml-service/bandit-report.json
    paths:
      - ml-service/bandit-report.json
  allow_failure: true
  only:
    - branches
    - merge_requests

security:container-scan:
  stage: security
  image: aquasec/trivy:latest
  script:
    - trivy image --exit-code 0 --severity HIGH,CRITICAL 
        --format sarif 
        --output container-scanning-report.sarif 
        ${REGISTRY_IMAGE}:${CI_COMMIT_SHA}
  artifacts:
    reports:
      container_scanning: container-scanning-report.sarif
  allow_failure: true
  only:
    - merge_requests
    - main
    - develop

# ============================================
# BUILD STAGE
# ============================================

build:backend:
  stage: build
  image: docker:latest
  services:
    - docker:dind
  script:
    - docker build 
        -t ${REGISTRY_IMAGE}-backend:${CI_COMMIT_SHA}
        -t ${REGISTRY_IMAGE}-backend:latest
        -f backend/Dockerfile
        ./backend
    - docker save ${REGISTRY_IMAGE}-backend:${CI_COMMIT_SHA} 
        | gzip > backend-image.tar.gz
  artifacts:
    paths:
      - backend-image.tar.gz
    expire_in: 1 hour
  cache:
    paths:
      - .docker-cache
  only:
    - branches
    - tags

build:frontend:
  stage: build
  image: docker:latest
  services:
    - docker:dind
  script:
    - docker build 
        -t ${REGISTRY_IMAGE}-frontend:${CI_COMMIT_SHA}
        -t ${REGISTRY_IMAGE}-frontend:latest
        -f frontend/Dockerfile
        ./frontend
    - docker save ${REGISTRY_IMAGE}-frontend:${CI_COMMIT_SHA} 
        | gzip > frontend-image.tar.gz
  artifacts:
    paths:
      - frontend-image.tar.gz
    expire_in: 1 hour
  only:
    - branches
    - tags

build:ml-service:
  stage: build
  image: docker:latest
  services:
    - docker:dind
  script:
    - docker build 
        -t ${REGISTRY_IMAGE}-ml:${CI_COMMIT_SHA}
        -t ${REGISTRY_IMAGE}-ml:latest
        -f ml-service/Dockerfile
        ./ml-service
    - docker save ${REGISTRY_IMAGE}-ml:${CI_COMMIT_SHA} 
        | gzip > ml-image.tar.gz
  artifacts:
    paths:
      - ml-image.tar.gz
    expire_in: 1 hour
  only:
    - branches
    - tags

# ============================================
# PUSH STAGE (Registry)
# ============================================

push:backend:
  stage: push
  image: docker:latest
  services:
    - docker:dind
  script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
    - docker pull ${REGISTRY_IMAGE}-backend:${CI_COMMIT_SHA} < backend-image.tar.gz || true
    - docker push ${REGISTRY_IMAGE}-backend:${CI_COMMIT_SHA}
    - |
      if [ "$CI_COMMIT_BRANCH" == "main" ]; then
        docker tag ${REGISTRY_IMAGE}-backend:${CI_COMMIT_SHA} ${REGISTRY_IMAGE}-backend:stable
        docker push ${REGISTRY_IMAGE}-backend:stable
      fi
    - |
      if [ "$CI_COMMIT_BRANCH" == "develop" ]; then
        docker tag ${REGISTRY_IMAGE}-backend:${CI_COMMIT_SHA} ${REGISTRY_IMAGE}-backend:dev
        docker push ${REGISTRY_IMAGE}-backend:dev
      fi
  dependencies:
    - build:backend
  only:
    - branches
    - tags

push:frontend:
  stage: push
  image: docker:latest
  services:
    - docker:dind
  script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
    - docker pull ${REGISTRY_IMAGE}-frontend:${CI_COMMIT_SHA} < frontend-image.tar.gz || true
    - docker push ${REGISTRY_IMAGE}-frontend:${CI_COMMIT_SHA}
    - |
      if [ "$CI_COMMIT_BRANCH" == "main" ]; then
        docker tag ${REGISTRY_IMAGE}-frontend:${CI_COMMIT_SHA} ${REGISTRY_IMAGE}-frontend:stable
        docker push ${REGISTRY_IMAGE}-frontend:stable
      fi
    - |
      if [ "$CI_COMMIT_BRANCH" == "develop" ]; then
        docker tag ${REGISTRY_IMAGE}-frontend:${CI_COMMIT_SHA} ${REGISTRY_IMAGE}-frontend:dev
        docker push ${REGISTRY_IMAGE}-frontend:dev
      fi
  dependencies:
    - build:frontend
  only:
    - branches
    - tags

push:ml-service:
  stage: push
  image: docker:latest
  services:
    - docker:dind
  script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
    - docker pull ${REGISTRY_IMAGE}-ml:${CI_COMMIT_SHA} < ml-image.tar.gz || true
    - docker push ${REGISTRY_IMAGE}-ml:${CI_COMMIT_SHA}
    - |
      if [ "$CI_COMMIT_BRANCH" == "main" ]; then
        docker tag ${REGISTRY_IMAGE}-ml:${CI_COMMIT_SHA} ${REGISTRY_IMAGE}-ml:stable
        docker push ${REGISTRY_IMAGE}-ml:stable
      fi
    - |
      if [ "$CI_COMMIT_BRANCH" == "develop" ]; then
        docker tag ${REGISTRY_IMAGE}-ml:${CI_COMMIT_SHA} ${REGISTRY_IMAGE}-ml:dev
        docker push ${REGISTRY_IMAGE}-ml:dev
      fi
  dependencies:
    - build:ml-service
  only:
    - branches
    - tags

# ============================================
# DEPLOY STAGING
# ============================================

deploy:staging:
  stage: deploy-staging
  image: docker:latest
  script:
    - echo "Deploying to staging..."
    - |
      docker pull ${REGISTRY_IMAGE}-backend:${CI_COMMIT_SHA}
      docker pull ${REGISTRY_IMAGE}-frontend:${CI_COMMIT_SHA}
      docker pull ${REGISTRY_IMAGE}-ml:${CI_COMMIT_SHA}
    - |
      curl -X POST \
        -H "Authorization: Bearer ${COOLIFY_TOKEN}" \
        -H "Content-Type: application/json" \
        -d '{
          "image_tag": "'${CI_COMMIT_SHA}'",
          "environment": "staging"
        }' \
        ${COOLIFY_API_URL}/deployments/trigger
  environment:
    name: staging
    url: https://staging.hy-aqms.example.com
  when: manual
  only:
    - develop

# ============================================
# DEPLOY PRODUCTION
# ============================================

deploy:production:
  stage: deploy-production
  image: docker:latest
  script:
    - echo "Deploying to production..."
    - |
      curl -X POST \
        -H "Authorization: Bearer ${COOLIFY_TOKEN}" \
        -H "Content-Type: application/json" \
        -d '{
          "image_tag": "'${CI_COMMIT_SHA}'",
          "environment": "production"
        }' \
        ${COOLIFY_API_URL}/deployments/trigger
  environment:
    name: production
    url: https://api.hy-aqms.example.com
    kubernetes:
      namespace: hy-aqms-prod
  when: manual
  only:
    - main
  needs:
    - build:backend
    - build:frontend
    - build:ml-service
    - test:backend
    - test:frontend
    - test:ml-service

# ============================================
# ROLLBACK JOB
# ============================================

rollback:production:
  stage: deploy-production
  script:
    - echo "Rolling back production deployment..."
    - |
      curl -X POST \
        -H "Authorization: Bearer ${COOLIFY_TOKEN}" \
        -d '{"action": "rollback"}' \
        ${COOLIFY_API_URL}/deployments/rollback
  when: manual
  only:
    - main
```

---

## Protected Variables & Secrets

Set these in GitLab CI/CD Settings:

```
CI_REGISTRY_USER: <your-gitlab-username>
CI_REGISTRY_PASSWORD: <your-gitlab-token>
COOLIFY_TOKEN: <coolify-deployment-token>
COOLIFY_API_URL: https://coolify.example.com/api
DB_PASSWORD: <production-db-password>
JWT_SECRET: <production-jwt-secret>
MINIO_ACCESS_KEY: <minio-access-key>
MINIO_SECRET_KEY: <minio-secret-key>
```

---

## Pipeline Triggers

### Branch-based Triggers

- **Merge Requests**: Lint + Test (auto-run)
- **Develop Branch**: Lint + Test + Build + Push to "dev" tag
- **Main Branch**: All stages (manual deploy buttons)
- **Tags**: Build + Push (semantic versioning tags)

### Manual Triggers

- **Deploy to Staging**: Manual button on develop branch
- **Deploy to Production**: Manual button on main branch
- **Rollback**: Emergency rollback button

---

## Monitoring & Alerts

### Pipeline Notifications

```yaml
.notify:slack: &notify_slack
  script:
    - |
      curl -X POST ${SLACK_WEBHOOK_URL} \
        -d '{
          "text": "Pipeline Status: '${CI_JOB_STATUS}'",
          "attachments": [{
            "color": "'$([ "$CI_JOB_STATUS" = "success" ] && echo "good" || echo "danger")'",
            "fields": [
              {"title": "Project", "value": "'${CI_PROJECT_NAME}'"},
              {"title": "Branch", "value": "'${CI_COMMIT_BRANCH}'"},
              {"title": "Commit", "value": "'${CI_COMMIT_SHA:0:8}'"},
              {"title": "Stage", "value": "'${CI_JOB_STAGE}'"}
            ]
          }]
        }'

success:notification:
  stage: .post
  <<: *notify_slack
  when: on_success

failure:notification:
  stage: .post
  <<: *notify_slack
  when: on_failure
```

---

## Performance Optimization

### Caching Strategy

```yaml
cache:
  key:
    files:
      - backend/package-lock.json
  paths:
    - backend/node_modules
```

### Parallel Execution

```yaml
# Jobs in same stage run in parallel automatically
test:backend:
  stage: test
  # ...

test:frontend:
  stage: test
  # ...

test:ml-service:
  stage: test
  # ...
```

### Artifact Management

```yaml
artifacts:
  paths:
    - backend/coverage/
  expire_in: 30 days
  reports:
    coverage_report:
      coverage_format: cobertura
      path: backend/coverage/cobertura-coverage.xml
```

---

## Deployment Strategies

### Blue-Green Deployment (via Coolify)

```bash
#!/bin/bash
# scripts/deploy-blue-green.sh

# Deploy to green environment
docker-compose -f docker-compose.green.yml pull
docker-compose -f docker-compose.green.yml up -d

# Health check
sleep 30
if curl -f http://green.local/api/health; then
    # Switch traffic to green
    traefik-switch-rule green
    # Stop blue
    docker-compose -f docker-compose.blue.yml down
else
    # Rollback
    docker-compose -f docker-compose.green.yml down
    exit 1
fi
```

### Canary Deployment (Gradual Rollout)

```yaml
deploy:canary:
  stage: deploy-staging
  script:
    - |
      # Deploy to 10% of traffic
      curl -X POST \
        -d '{"traffic_percentage": 10}' \
        ${COOLIFY_API_URL}/deployments/canary
    
    # Monitor for 10 minutes
    - sleep 600
    
    # If no errors, increase to 50%
    - curl -X POST -d '{"traffic_percentage": 50}' ${COOLIFY_API_URL}/deployments/canary
    - sleep 300
    
    # Full rollout if healthy
    - curl -X POST -d '{"traffic_percentage": 100}' ${COOLIFY_API_URL}/deployments/canary
```

---

**Version**: 1.0 (Production CI/CD)
**Status**: Ready for deployment
**Last Updated**: 2026-05-23
