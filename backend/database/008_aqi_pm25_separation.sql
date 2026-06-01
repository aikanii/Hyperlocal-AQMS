-- Migration: AQI/PM2.5 Separation and PM1 Removal
-- This migration:
-- 1. Adds pm25_aqi column to store calculated AQI values
-- 2. Removes pm1_0 column (no data source available)
-- 3. Creates index on pm25_aqi for query performance

-- Add pm25_aqi column to readings table
ALTER TABLE IF EXISTS readings
ADD COLUMN IF NOT EXISTS pm25_aqi FLOAT;

-- Create index on pm25_aqi for better query performance
CREATE INDEX IF NOT EXISTS ix_readings_aqi ON readings (device_id, pm25_aqi DESC);

-- Drop pm1_0 column if it exists
-- Note: This removes all PM1 data. Backup your database before running this.
ALTER TABLE IF EXISTS readings
DROP COLUMN IF EXISTS pm1_0 CASCADE;

-- Update readings table comment to reflect the change
COMMENT ON TABLE readings IS 'Air quality sensor readings with PM2.5 concentration and AQI values';
COMMENT ON COLUMN readings.pm2_5 IS 'Raw or calibrated PM2.5 concentration in µg/m³';
COMMENT ON COLUMN readings.pm2_5_cal IS 'Calibrated PM2.5 concentration in µg/m³';
COMMENT ON COLUMN readings.pm25_aqi IS 'Air Quality Index calculated from PM2.5 concentration';
