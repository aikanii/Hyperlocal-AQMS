# HY-AQMS Enterprise Architecture

## System Architecture Overview

### Production Stack
```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT TIER                              │
│  Web Browser (Next.js)  │  Mobile (PWA)  │  IoT Dashboard      │
└────────────────┬────────────────────────────────────────────────┘
                 │ HTTPS/WSS
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EDGE/GATEWAY TIER                            │
│         Traefik Reverse Proxy (Load Balancer + Router)         │
│  ├─ SSL/TLS Termination (Let's Encrypt)                        │
│  ├─ Service Discovery & Health Checks                          │
│  ├─ Rate Limiting & DDoS Protection                            │
│  ├─ Compression & Caching Headers                              │
│  └─ Security Headers (HSTS, CSP, X-Frame-Options)              │
└────────┬──────────────┬────────────────┬───────────────────────┘
         │              │                │
    API /│         WebSocket │      Static │
         ▼              ▼                ▼
┌──────────────────────────────────────────────────────────────────┐
│                  SERVICE TIER                                    │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Frontend Services          Backend Services    ML Service      │
│  ┌──────────────────┐      ┌─────────────────┐ ┌──────────────┐│
│  │  Next.js         │      │  NestJS API     │ │ FastAPI      ││
│  │  ├─ App Router   │      │  ├─ Auth Module │ │ ├─ Training   ││
│  │  ├─ SSR/ISR      │      │  ├─ Device Mgmt │ │ ├─ Inference  ││
│  │  ├─ Image Opt    │      │  ├─ Analytics   │ │ └─ Monitoring ││
│  │  ├─ Error Bound. │      │  ├─ MQTT Handler│ │              ││
│  │  └─ SEO          │      │  └─ Validation  │ └──────────────┘│
│  └──────────────────┘      └─────────────────┘                 │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
         │                │                         │
         └────────────────┼─────────────────────────┘
                          │
    ┌─────────────────────┼──────────────────┐
    │                     │                  │
    ▼                     ▼                  ▼
┌─────────────┐   ┌──────────────────┐  ┌─────────────┐
│   Redis     │   │  PostgreSQL      │  │   MQTT      │
│ ├─ Cache    │   │ ├─ Normalized    │  │ ├─ Broker   │
│ ├─ Sessions │   │ │  Schema        │  │ ├─ TLS/Auth │
│ ├─ Queues   │   │ ├─ Migrations    │  │ ├─ ACL      │
│ ├─ PubSub   │   │ ├─ Backup        │  │ └─ Topic    │
│ └─ Locks    │   │ └─ Connection    │  │   Hierarchy │
└─────────────┘   │   Pooling        │  └─────────────┘
                  └──────────────────┘

    ┌──────────────┐      ┌──────────────┐
    │   MinIO      │      │  Prometheus  │
    │ ├─ Exports   │      │ ├─ Metrics   │
    │ ├─ Backups   │      │ ├─ Scrape    │
    │ ├─ Assets    │      │ └─ TSDB      │
    │ └─ Policies  │      └──────────────┘
    └──────────────┘

                  ┌──────────────────┐
                  │    Grafana       │
                  │ ├─ Dashboards    │
                  │ ├─ Alerts        │
                  │ └─ RBAC          │
                  └──────────────────┘
```

## Service Architecture

### 1. Frontend Service (Next.js)

**Deployment**: Docker container → Traefik
**Port**: 3000 (internal)

#### Features
- **App Router**: File-based routing, layouts, error boundaries
- **Rendering**: SSR for dashboard, ISR for static content
- **Data Fetching**: React Server Components + Client Components
- **State Management**: Zustand for global state
- **Component Structure**:
  - `/app` - Page routes
  - `/components/ui` - Reusable UI components (buttons, cards, modals)
  - `/components/layouts` - Layout components (navbar, sidebar)
  - `/hooks` - Custom React hooks
  - `/services` - API client abstractions
  - `/store` - Global state

#### Security
- CSRF tokens on form submissions
- Secure cookie handling for sessions
- Structured error boundaries
- Input sanitization
- XSS prevention via React escape

### 2. Backend Service (NestJS)

**Deployment**: Docker container → Traefik
**Port**: 3001 (internal)

#### Architecture
```
NestJS Application
├── src/
│   ├── modules/
│   │   ├── auth/              # JWT, RBAC, guards
│   │   ├── devices/           # Device CRUD, calibration
│   │   ├── readings/          # Time-series data, aggregation
│   │   ├── analytics/         # City stats, predictions
│   │   ├── mqtt/              # MQTT subscription, parsing
│   │   ├── export/            # CSV export pipeline
│   │   ├── simulator/         # Test data injection
│   │   ├── health/            # Health checks, liveness
│   │   └── shared/            # Shared services
│   ├── common/
│   │   ├── decorators/        # Custom validation, auth
│   │   ├── filters/           # Exception handling
│   │   ├── interceptors/      # Logging, transformation
│   │   ├── guards/            # JWT, RBAC
│   │   ├── pipes/             # Validation
│   │   └── middleware/        # Rate limiting, logging
│   └── config/                # Environment, database
├── database/
│   ├── migrations/            # TypeORM migrations
│   └── seeds/                 # Initial data
└── test/
    ├── unit/                  # Service tests
    ├── integration/           # API + DB tests
    └── e2e/                   # Full flow tests
```

#### Key Modules
1. **Auth Module**: JWT tokens, refresh tokens, RBAC, permission guards
2. **Devices Module**: CRUD operations, calibration, status tracking
3. **Readings Module**: Time-series data insertion, retrieval, aggregation
4. **Analytics Module**: Statistical queries, predictions, trends
5. **MQTT Module**: Mosquitto subscription, message parsing, device registration
6. **Export Module**: CSV generation, async job queue
7. **Health Module**: Readiness/liveness probes, service health

#### API Features
- **OpenAPI Docs**: Swagger UI at `/api/docs`
- **Validation**: Class-validator DTOs on all endpoints
- **Rate Limiting**: Global (100 req/min) + per-user differentiation
- **Pagination**: Limit/offset on list endpoints
- **Filtering**: Query parameter support for time ranges, device_id
- **Versioning**: `/api/v1/` prefix for future compatibility

### 3. ML Service (FastAPI)

**Deployment**: Docker container → Traefik
**Port**: 8000 (internal)

#### Architecture
```
FastAPI Application
├── src/
│   ├── modules/
│   │   ├── predictor/         # LSTM model, inference
│   │   ├── trainer/           # Model training pipeline
│   │   ├── database/          # PostgreSQL queries
│   │   └── cache/             # Model caching
│   ├── config/                # Environment, paths
│   └── models/
│       ├── device_*.pkl       # Trained model artifacts
│       └── scaler_*.pkl       # Feature scalers
└── test/                      # Unit + integration tests
```

#### Features
1. **Prediction Endpoints**:
   - `GET /api/ml/predict/city` - City-wide 24h forecast
   - `GET /api/ml/predict/device/{device_id}` - Device-specific forecast
   - `GET /api/ml/health` - Service health

2. **Training Pipeline**:
   - Background scheduled training (2 AM daily)
   - Fallback on-demand training via API
   - Model versioning with timestamp tags

3. **Inference Optimization**:
   - Batch processing for multiple devices
   - Caching layer for repeated queries
   - GPU acceleration (if available)

### 4. MQTT Broker (Mosquitto)

**Deployment**: Docker container → Traefik
**Ports**: 1883 (unencrypted local), 8883 (TLS)

#### Configuration
- **Topic Hierarchy**: `aqms/{region}/{device_id}/data`
- **Authentication**: Username/password (stored in passwd file)
- **TLS**: Let's Encrypt certificates via Certbot
- **ACL**: Per-device topic restrictions (future enhancement)

#### Security
- All production connections use TLS 1.2+
- Username/password hashed with bcrypt
- Device credentials rotated quarterly
- Audit logging of all MQTT connections

### 5. Database Layer (PostgreSQL)

**Deployment**: Docker container with persistent volume
**Port**: 5432 (internal)

#### Schema
```sql
-- Users table (authentication)
CREATE TABLE users (
    id UUID PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM ('admin', 'viewer', 'editor') NOT NULL DEFAULT 'viewer',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- Devices table (registry)
CREATE TABLE devices (
    id UUID PRIMARY KEY,
    device_id VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    region VARCHAR(255),
    status ENUM ('active', 'inactive', 'maintenance') DEFAULT 'active',
    calibration_coefficients JSONB,
    last_seen TIMESTAMP,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
CREATE INDEX idx_devices_region ON devices(region);
CREATE INDEX idx_devices_status ON devices(status);

-- Readings table (time-series with partitioning)
CREATE TABLE readings (
    id UUID PRIMARY KEY,
    device_id UUID NOT NULL REFERENCES devices(id),
    time TIMESTAMP NOT NULL,
    pm1_0 FLOAT,
    pm2_5 FLOAT NOT NULL,
    pm10 FLOAT,
    pm2_5_cal FLOAT NOT NULL,  -- Calibrated PM2.5
    temperature FLOAT,
    humidity FLOAT,
    rssi_dbm INTEGER,
    battery_mv INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_readings_device_time ON readings(device_id, time DESC);
CREATE INDEX idx_readings_time ON readings(time DESC);
-- Partition by time (monthly)
-- Enable TimescaleDB compression for older chunks

-- Predictions table (ML forecasts)
CREATE TABLE predictions (
    id UUID PRIMARY KEY,
    device_id UUID NOT NULL REFERENCES devices(id),
    time TIMESTAMP NOT NULL,
    pm2_5_pred FLOAT NOT NULL,
    temperature_pred FLOAT,
    humidity_pred FLOAT,
    model_version VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(device_id, time)
);

-- Audit log (compliance)
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    action VARCHAR(255) NOT NULL,
    entity_type VARCHAR(255),
    entity_id VARCHAR(255),
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Backup Strategy
- Daily automated snapshots (pg_dump)
- 30-day retention policy
- Point-in-time recovery (PITR) via WAL archival
- MinIO object storage for off-site backups

### 6. Cache Layer (Redis)

**Deployment**: Docker container with AOF persistence
**Port**: 6379 (internal)

#### Key Patterns
```
# Latest readings cache (no expiry, updated on MQTT)
device:latest:{device_id} → JSON reading object

# Session storage (24-hour expiry)
session:{session_id} → user session data

# Rate limiting (sliding window)
ratelimit:{user_id}:{endpoint} → counter

# Queue (async tasks)
queue:exports → job queue for CSV exports
queue:ml_training → model training jobs

# PubSub channels
pubsub:readings → broadcast new readings
pubsub:predictions → broadcast new forecasts
```

#### Persistence
- AOF rewriting every 6 hours
- RDB snapshots daily
- Automatic failover via Redis Sentinel (future)

### 7. Object Storage (MinIO)

**Deployment**: Docker container with persistent volume
**Port**: 9000 (internal console), 9001 (API)

#### Buckets
1. **exports**: CSV exports with 90-day retention
2. **backups**: Database backups with 1-year retention
3. **assets**: Static assets and icons
4. **logs**: Archived logs for audit trail

#### Policies
- All exports: signed URLs valid for 24 hours
- All backups: private (no public access)
- Automatic cleanup: Lifecycle rules for retention

## Deployment Architecture

### Docker Compose Structure
```yaml
# docker-compose.yml (development)
services:
  traefik:         # Reverse proxy + routing
  postgres:        # Database
  redis:           # Cache
  mosquitto:       # MQTT broker
  backend:         # NestJS API
  frontend:        # Next.js
  ml-service:      # FastAPI ML
  minio:           # Object storage
  prometheus:      # Metrics collection
  grafana:         # Visualization

volumes:
  postgres_data:
  redis_data:
  minio_data:
  mosquitto_data:

networks:
  app-network:     # Shared network for service discovery
```

### Traefik Configuration

**Features**:
- Automatic service discovery via Docker labels
- SSL/TLS termination with Let's Encrypt
- HTTP → HTTPS redirect
- Rate limiting middleware
- Security headers middleware
- Load balancing across replicas

**Routing**:
- `/` → Frontend (Next.js)
- `/api/` → Backend (NestJS)
- `/api/ml/` → ML Service (FastAPI)
- `/.well-known/` → ACME challenges

### Kubernetes-Ready Architecture

All services designed for K8s migration:
- **Stateless Services**: All state in Redis or PostgreSQL
- **Health Checks**: Readiness and liveness probes
- **Resource Limits**: CPU/memory requests and limits
- **Logging**: Stdout/stderr only (no file logging)
- **Secrets**: Environment variable injection
- **Scalability**: Horizontal pod autoscaling ready

## Security Architecture

### Authentication & Authorization
1. **User Registration**: Email + password, optional TOTP
2. **JWT Tokens**: Access (15 min) + Refresh (7 days)
3. **RBAC**: Fine-grained role-based permissions
4. **API Keys**: For service-to-service communication
5. **Audit Logging**: All user actions tracked

### Network Security
- All internal traffic on isolated Docker network
- TLS 1.2+ for external communication
- CORS policy whitelist
- CSRF tokens on state-changing operations
- X-Frame-Options, X-Content-Type-Options headers

### Data Security
- Passwords hashed with bcrypt (cost: 12)
- Encryption at rest for sensitive fields (future)
- Row-level security (RLS) for multi-tenant data access
- Sensitive data masked in logs

### Secrets Management
- Environment variables for local development
- HashiCorp Vault or AWS Secrets Manager for production
- Automatic secret rotation every 90 days
- No hardcoded credentials in code/configs

## Monitoring & Observability

### Prometheus Metrics
- Application metrics: API latency, error rates, throughput
- Infrastructure metrics: CPU, memory, disk, network
- Database metrics: Query latency, connection pool, cache hit rates
- MQTT metrics: Message rate, connection count
- ML metrics: Model accuracy, prediction latency

### Grafana Dashboards
1. **System Health**: CPU, memory, disk usage across all services
2. **API Performance**: Request rate, latency, error rate by endpoint
3. **Data Pipeline**: MQTT message rate, database writes, cache hits
4. **ML Service**: Model performance, prediction latency, training status
5. **Business KPIs**: Number of devices, active users, data quality

### Structured Logging
- JSON format with correlation IDs
- Log levels: DEBUG, INFO, WARN, ERROR
- Centralized aggregation (ELK stack or Datadog)
- Audit log for compliance

### Distributed Tracing
- Request correlation IDs across services
- Trace propagation via HTTP headers
- Integration with Jaeger/Zipkin (future)

## Scaling Strategy

### Horizontal Scaling
- **Frontend**: Stateless, scale with Traefik LB
- **Backend**: Stateless (sessions in Redis), auto-scale
- **ML Service**: Single worker to avoid training conflicts (scale up compute)

### Vertical Scaling
- Database: Add RAM/CPU for connection pool
- Redis: Increase memory for larger cache
- MQTT: Optimize QoS and connection limits

### Performance Optimization
- Database connection pooling (PgBouncer)
- Redis caching for frequent queries
- CDN for static assets
- API response compression (gzip)
- Database query optimization with indexes

## Disaster Recovery

### RTO/RPO Targets
- **RTO (Recovery Time Objective)**: 1 hour
- **RPO (Recovery Point Objective)**: 15 minutes

### Backup Strategy
1. Daily database snapshots (cold backup)
2. MQTT message replay from Redis
3. ML model versioning with timestamps
4. MinIO replication to secondary object storage

### Failover Procedures
1. Database failover: Restore from latest snapshot
2. Service failover: Docker restart with health checks
3. Data recovery: PITR from WAL archives
4. Manual runbooks for complex failures

## Future Enhancements

1. **Kubernetes Migration**: Helm charts, StatefulSets, Operators
2. **Multi-Tenancy**: Complete tenant isolation with RLS
3. **API Gateway**: Kong or Envoy for advanced routing
4. **Event Streaming**: Apache Kafka for event sourcing
5. **Data Lake**: Parquet exports to S3 for analytics
6. **Real-time Dashboards**: WebSocket optimization, WebRTC for video feeds
7. **Advanced ML**: Model ensemble, transfer learning, anomaly detection
8. **Geo-Replication**: Multi-region deployment for high availability

---

**Last Updated**: 2026-05-23
**Version**: 1.0 (Enterprise Production)
**Status**: Architecture Design Phase
