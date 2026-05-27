-- Optimize query performance with strategic indexes

-- Index for readings queries by device_id and time (most common queries)
CREATE INDEX IF NOT EXISTS ix_readings_device_id_time ON readings (device_id, time DESC);

-- Index for time-range queries
CREATE INDEX IF NOT EXISTS ix_readings_time ON readings (time DESC);

-- Index for predictions queries by device_id and time
CREATE INDEX IF NOT EXISTS ix_predictions_device_id_time ON predictions (device_id, time DESC);

-- Index for predictions time queries
CREATE INDEX IF NOT EXISTS ix_predictions_time ON predictions (time DESC);

-- Index for devices by region (for region-filtered queries)
CREATE INDEX IF NOT EXISTS ix_devices_region ON devices (region);

-- Composite index for common MQTT message handler queries
CREATE INDEX IF NOT EXISTS ix_devices_device_id ON devices (device_id);

-- Ensure unique index on predictions for upsert operations
CREATE UNIQUE INDEX IF NOT EXISTS ux_predictions_time_device ON predictions (time, device_id);

-- Ensure unique index on readings for duplicate prevention (if needed)
CREATE UNIQUE INDEX IF NOT EXISTS ux_readings_device_time ON readings (device_id, time);

-- Analyze table statistics for query optimizer
ANALYZE readings;
ANALYZE predictions;
ANALYZE devices;
