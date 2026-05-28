CREATE TABLE IF NOT EXISTS devices (
    device_id TEXT PRIMARY KEY,
    name TEXT,
    lat FLOAT,
    lng FLOAT,
    status TEXT DEFAULT 'active',
    calibration_coefficients JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO devices (device_id, name, lat, lng, status, calibration_coefficients)
VALUES 
    ('poblacion_hall_010', 'Poblacion Barangay Hall', 8.228886477683888, 124.23361193891868, 'active', '{"pm2_5_slope": 1.0, "pm2_5_intercept": 0.0}'),
    ('iligan_highschool_001', 'Iligan City East National High School', 8.269212954892991, 124.26038611192845, 'active', '{"pm2_5_slope": 1.0, "pm2_5_intercept": 0.0}'),
    ('suarez_iligan_001', 'Suarez Barangy Hall', 8.19174544049964, 124.21769948149178, 'active', '{"pm2_5_slope": 1.0, "pm2_5_intercept": 0.0}'),
    ('tambacan_hall_001', 'Tambacan Barangay Hall', 8.224149661887898, 124.23464694101638, 'active', '{"pm2_5_slope": 1.0, "pm2_5_intercept": 0.0}'),
    ('southbound_terminal_001', 'Iligan Southbound Terminal', 8.207315778712141, 124.21647319234012, 'active', '{"pm2_5_slope": 1.0, "pm2_5_intercept": 0.0}'),
    ('tambo_terminal_001', 'Tambo Bus Terminal', 8.241729644196798, 124.26107653891862, 'active', '{"pm2_5_slope": 1.0, "pm2_5_intercept": 0.0}'),
    ('nsc_iligan_001', 'National Steel Corporation', 8.208591675619148, 124.21530248149182, 'active', '{"pm2_5_slope": 1.0, "pm2_5_intercept": 0.0}'),
    ('pilmico_corp_001', 'Kiwalan', 8.28882456057826, 124.26125149498404, 'active', '{"pm2_5_slope": 1.0, "pm2_5_intercept": 0.0}'),
    ('denr_emb_x_reference_001', 'DENR-EMB X Reference Grade Air Monitor', 8.237232, 124.252956, 'active', '{"pm2_5_slope": 1.0, "pm2_5_intercept": 0.0}'),
    ('iligan_city_hall_001', 'Iligan City Hall', 8.226147134629919, 124.25179693916404, 'active', '{"pm2_5_slope": 1.1, "pm2_5_intercept": -0.5}'),
    ('msu_iit_campus_001', 'MSU-IIT Campus', 8.241170534693753, 124.24334976800029, 'active', '{"pm2_5_slope": 1.0, "pm2_5_intercept": 0.0}')
ON CONFLICT (device_id) DO NOTHING;
