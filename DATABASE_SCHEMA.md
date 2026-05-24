# PostgreSQL Production Schema Design

## Overview
This document specifies the normalized, production-grade PostgreSQL schema for HY-AQMS with proper constraints, indexes, partitioning strategy, and migrations.

## Design Principles
1. **Normalization**: Third normal form (3NF) to eliminate redundancy
2. **Constraints**: Foreign keys, unique constraints, check constraints
3. **Indexing**: Strategic indexes for query performance
4. **Partitioning**: Time-based partitioning for readings (scalability)
5. **Audit Trail**: Timestamp columns on all tables
6. **Soft Deletes**: Where applicable for data recovery
7. **Type Safety**: Enums instead of strings for fixed values
8. **Scalability**: Prepared for TimescaleDB conversion

---

## Schema Definition

### 1. Users Table (Authentication & Authorization)

```sql
-- Enumeration for user roles
CREATE TYPE user_role AS ENUM ('admin', 'editor', 'viewer');

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role user_role NOT NULL DEFAULT 'viewer',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    last_login TIMESTAMP WITH TIME ZONE,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT email_format CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'),
    CONSTRAINT password_length CHECK (LENGTH(password_hash) >= 60)
);

CREATE INDEX idx_users_username ON users(username) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_role ON users(role) WHERE is_active = TRUE AND deleted_at IS NULL;
CREATE INDEX idx_users_created_at ON users(created_at DESC) WHERE deleted_at IS NULL;

-- Trigger to update updated_at
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();
```

### 2. Refresh Tokens Table (Session Management)

```sql
-- Refresh tokens for token rotation
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_address INET,
    user_agent TEXT,
    
    CONSTRAINT token_not_expired CHECK (expires_at > CURRENT_TIMESTAMP)
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at) WHERE revoked_at IS NULL;

-- Auto-cleanup of expired tokens
CREATE TRIGGER cleanup_expired_tokens
    AFTER INSERT ON refresh_tokens
    FOR EACH STATEMENT
    EXECUTE FUNCTION cleanup_expired_tokens_fn();
```

### 3. Regions Table (Geographic Tagging)

```sql
-- Geographic regions for hierarchical organization
CREATE TABLE regions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_regions_code ON regions(code) WHERE deleted_at IS NULL;
CREATE INDEX idx_regions_name ON regions(name) WHERE deleted_at IS NULL;
```

### 4. Devices Table (IoT Device Registry)

```sql
-- Device status enumeration
CREATE TYPE device_status AS ENUM ('active', 'inactive', 'maintenance', 'decommissioned');

-- Devices registry
CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id VARCHAR(255) UNIQUE NOT NULL,  -- MAC address or serial
    name VARCHAR(255) NOT NULL,
    description TEXT,
    region_id UUID REFERENCES regions(id),
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    
    -- Device metadata
    device_model VARCHAR(255),
    firmware_version VARCHAR(255),
    serial_number VARCHAR(255),
    
    -- Status & health
    status device_status NOT NULL DEFAULT 'active',
    last_seen TIMESTAMP WITH TIME ZONE,
    battery_level INTEGER,  -- 0-100 percentage
    signal_strength INTEGER,  -- RSSI in dBm
    
    -- Calibration (JSON for flexibility)
    calibration_coefficients JSONB NOT NULL DEFAULT '{
        "pm2_5_slope": 1.0,
        "pm2_5_intercept": 0.0,
        "temperature_offset": 0.0,
        "humidity_offset": 0.0
    }',
    last_calibration TIMESTAMP WITH TIME ZONE,
    
    -- Ownership & auditing
    created_by UUID NOT NULL REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT device_id_format CHECK (device_id ~ '^[A-F0-9:]{17}$'),  -- MAC address format
    CONSTRAINT valid_location CHECK (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180),
    CONSTRAINT battery_range CHECK (battery_level IS NULL OR (battery_level >= 0 AND battery_level <= 100))
);

CREATE INDEX idx_devices_device_id ON devices(device_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_devices_region ON devices(region_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_devices_status ON devices(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_devices_location ON devices(latitude, longitude) WHERE deleted_at IS NULL;
CREATE INDEX idx_devices_created_at ON devices(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_devices_last_seen ON devices(last_seen DESC) WHERE deleted_at IS NULL;
```

### 5. Readings Table (Time-Series Data)

```sql
-- High-frequency readings (partitioned by time)
CREATE TABLE readings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
    time TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Raw sensor values
    pm1_0 FLOAT,
    pm2_5 FLOAT NOT NULL,
    pm10 FLOAT,
    temperature FLOAT NOT NULL,
    humidity FLOAT NOT NULL CHECK (humidity >= 0 AND humidity <= 100),
    
    -- Calibrated values
    pm2_5_cal FLOAT NOT NULL,
    
    -- Signal metadata
    rssi_dbm INTEGER,
    battery_mv INTEGER,
    
    -- Data quality flags
    is_anomaly BOOLEAN DEFAULT FALSE,
    quality_score FLOAT CHECK (quality_score >= 0 AND quality_score <= 100),
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Partition readings by month
-- (Can be automated with pg_partman extension)
CREATE TABLE readings_2026_01 PARTITION OF readings
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

-- Indexes for query performance
CREATE INDEX idx_readings_device_time ON readings(device_id, time DESC);
CREATE INDEX idx_readings_time ON readings(time DESC);
CREATE INDEX idx_readings_region ON readings(device_id) WHERE is_anomaly = FALSE;
CREATE INDEX idx_readings_quality ON readings(quality_score DESC) WHERE quality_score < 50;

-- GiST index for geospatial queries (with device location)
CREATE INDEX idx_readings_geospatial ON readings 
    USING gist((SELECT ST_MakePoint(devices.longitude, devices.latitude) 
                FROM devices WHERE devices.id = readings.device_id));
```

### 6. Predictions Table (ML Forecasts)

```sql
-- Machine learning model predictions
CREATE TABLE predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    prediction_time TIMESTAMP WITH TIME ZONE NOT NULL,  -- Time of prediction
    
    -- Forecast values
    pm2_5_pred FLOAT NOT NULL,
    temperature_pred FLOAT,
    humidity_pred FLOAT,
    
    -- Model metadata
    model_version VARCHAR(255) NOT NULL,
    model_confidence FLOAT CHECK (model_confidence >= 0 AND model_confidence <= 1),
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(device_id, prediction_time)
);

CREATE INDEX idx_predictions_device_time ON predictions(device_id, prediction_time DESC);
CREATE INDEX idx_predictions_model_version ON predictions(model_version);
```

### 7. Audit Log Table (Compliance & Security)

```sql
-- Comprehensive audit trail
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(255) NOT NULL,
    entity_type VARCHAR(255) NOT NULL,  -- 'device', 'user', 'readings', etc.
    entity_id VARCHAR(255) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    status VARCHAR(50) NOT NULL,  -- 'success', 'failure'
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_action CHECK (action IN (
        'CREATE', 'READ', 'UPDATE', 'DELETE', 'EXPORT', 'LOGIN', 'LOGOUT', 'TRAIN_MODEL'
    ))
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action, created_at DESC);

-- Partition audit logs by quarter
CREATE TABLE audit_logs_2026_q1 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');
```

### 8. Permissions Table (Fine-Grained RBAC)

```sql
-- Permission definitions
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource VARCHAR(255) NOT NULL,
    action VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(resource, action),
    CONSTRAINT valid_resource CHECK (resource IN (
        'device', 'reading', 'prediction', 'user', 'export', 'audit', 'ml'
    )),
    CONSTRAINT valid_action CHECK (action IN (
        'create', 'read', 'update', 'delete', 'export', 'train'
    ))
);

-- Role-based permissions
CREATE TABLE role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role user_role NOT NULL,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(role, permission_id)
);

CREATE INDEX idx_role_permissions_role ON role_permissions(role);
```

### 9. Export Jobs Table (Async Task Management)

```sql
-- CSV export job tracking
CREATE TYPE export_status AS ENUM ('pending', 'processing', 'completed', 'failed');

CREATE TABLE export_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Export parameters
    device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Job status
    status export_status NOT NULL DEFAULT 'pending',
    progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    error_message TEXT,
    
    -- Output
    minio_path VARCHAR(512),  -- Object storage location
    file_size_bytes INTEGER,
    row_count INTEGER,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_export_jobs_user_id ON export_jobs(user_id, created_at DESC);
CREATE INDEX idx_export_jobs_status ON export_jobs(status) WHERE status != 'completed';
CREATE INDEX idx_export_jobs_expires_at ON export_jobs(expires_at) WHERE expires_at IS NOT NULL;
```

### 10. System Settings Table (Configuration)

```sql
-- Application configuration (key-value)
CREATE TABLE system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(255) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    setting_type VARCHAR(50) NOT NULL,  -- 'string', 'integer', 'boolean', 'json'
    description TEXT,
    is_secret BOOLEAN DEFAULT FALSE,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_setting_type CHECK (setting_type IN ('string', 'integer', 'boolean', 'json'))
);

CREATE INDEX idx_system_settings_key ON system_settings(key);

-- Default settings
INSERT INTO system_settings (key, value, setting_type, description) VALUES
    ('ml_prediction_interval_seconds', '3600', 'integer', 'How often to run ML predictions'),
    ('ml_training_enabled', 'true', 'boolean', 'Enable automatic model training'),
    ('ml_training_hour', '2', 'integer', 'Hour of day (UTC) to train models'),
    ('export_max_rows', '100000', 'integer', 'Maximum rows per export'),
    ('export_retention_days', '90', 'integer', 'How long to keep export files'),
    ('backup_retention_days', '30', 'integer', 'How long to keep database backups'),
    ('rate_limit_requests_per_minute', '100', 'integer', 'API rate limit'),
    ('data_quality_threshold', '50', 'integer', 'Minimum quality score (0-100)'),
    ('anomaly_detection_enabled', 'true', 'boolean', 'Enable outlier detection')
ON CONFLICT DO NOTHING;
```

---

## Utility Functions

### Updated-At Trigger Function

```sql
-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach to all audit tables
CREATE TRIGGER update_devices_updated_at
    BEFORE UPDATE ON devices
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_regions_updated_at
    BEFORE UPDATE ON regions
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_system_settings_updated_at
    BEFORE UPDATE ON system_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();
```

### Cleanup Expired Tokens

```sql
CREATE OR REPLACE FUNCTION cleanup_expired_tokens_fn()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM refresh_tokens
    WHERE expires_at < CURRENT_TIMESTAMP - INTERVAL '7 days';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
```

### Data Quality Score Calculation

```sql
CREATE OR REPLACE FUNCTION calculate_quality_score(
    pm2_5 FLOAT,
    temperature FLOAT,
    humidity FLOAT,
    rssi_dbm INTEGER
)
RETURNS FLOAT AS $$
DECLARE
    score FLOAT := 100.0;
BEGIN
    -- Deduct points for out-of-range values
    IF pm2_5 < 0 OR pm2_5 > 1000 THEN
        score := score - 30;
    END IF;
    
    IF temperature < -50 OR temperature > 80 THEN
        score := score - 20;
    END IF;
    
    IF humidity < 0 OR humidity > 100 THEN
        score := score - 20;
    END IF;
    
    -- Deduct points for poor signal
    IF rssi_dbm IS NULL THEN
        score := score - 10;
    ELSIF rssi_dbm < -100 THEN
        score := score - 15;
    END IF;
    
    RETURN GREATEST(score, 0);
END;
$$ LANGUAGE plpgsql;
```

---

## Views for Common Queries

### Latest Device Readings

```sql
CREATE OR REPLACE VIEW latest_device_readings AS
SELECT DISTINCT ON (device_id)
    d.id,
    d.device_id,
    d.name,
    d.region_id,
    r.time,
    r.pm2_5,
    r.pm2_5_cal,
    r.temperature,
    r.humidity,
    r.rssi_dbm,
    r.battery_mv,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - r.time)) as seconds_ago
FROM devices d
LEFT JOIN readings r ON d.id = r.device_id
WHERE d.deleted_at IS NULL
ORDER BY d.id, r.time DESC;
```

### Regional Statistics

```sql
CREATE OR REPLACE VIEW regional_stats AS
SELECT
    r.id,
    r.name,
    COUNT(DISTINCT d.id) as device_count,
    AVG(rd.pm2_5_cal) as avg_pm2_5,
    MAX(rd.pm2_5_cal) as max_pm2_5,
    MIN(rd.pm2_5_cal) as min_pm2_5,
    AVG(rd.temperature) as avg_temperature,
    AVG(rd.humidity) as avg_humidity
FROM regions r
LEFT JOIN devices d ON r.id = d.region_id AND d.deleted_at IS NULL
LEFT JOIN readings rd ON d.id = rd.device_id 
    AND rd.time > CURRENT_TIMESTAMP - INTERVAL '24 hours'
GROUP BY r.id, r.name;
```

---

## Migration Strategy

### Migration File Structure
```
backend/database/migrations/
├── 001_initial_schema.sql
├── 002_add_partitioning.sql
├── 003_add_audit_logging.sql
├── 004_add_rbac.sql
├── 005_add_ml_predictions.sql
├── 006_add_export_jobs.sql
├── ...
└── rollback/
    ├── 001_rollback.sql
    └── ...
```

### Using TypeORM Migrations

```typescript
// src/database/migrations/1000000000000-InitialSchema.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1000000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        // ... migration SQL ...
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // ... rollback SQL ...
    }
}
```

---

## Performance Optimization

### Connection Pooling Configuration

```javascript
// NestJS Database Configuration
{
    min: 5,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    statement_timeout: 30000
}
```

### Query Optimization Tips

1. **Always use device_id + time indexes** for readings queries
2. **Use materialized views** for expensive aggregations
3. **Enable query statistics** with EXPLAIN ANALYZE
4. **Use batch inserts** for multiple readings
5. **Archive old readings** to separate cold storage

### Maintenance Commands

```sql
-- Regular maintenance
VACUUM ANALYZE readings;
REINDEX TABLE readings;

-- Check table sizes
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Monitor long-running queries
SELECT * FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

---

**Version**: 2.0 (Production-Normalized)
**Status**: Complete Schema Design
**Last Updated**: 2026-05-23
