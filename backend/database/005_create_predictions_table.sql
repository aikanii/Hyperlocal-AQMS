-- Create the predictions table
CREATE TABLE IF NOT EXISTS predictions (
  time TIMESTAMPTZ NOT NULL,
  device_id TEXT, -- NULL for city-wide aggregation
  pm2_5_cal DOUBLE PRECISION,
  temperature DOUBLE PRECISION,
  humidity DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Convert to TimescaleDB hypertable
SELECT create_hypertable('predictions', 'time', if_not_exists => TRUE);

-- Create an index to quickly fetch latest predictions
CREATE INDEX IF NOT EXISTS ix_predictions_device_time ON predictions (device_id, time DESC);

-- Ensure prediction updates can use upsert semantics reliably
CREATE UNIQUE INDEX IF NOT EXISTS ux_predictions_time_device ON predictions (time, device_id);
