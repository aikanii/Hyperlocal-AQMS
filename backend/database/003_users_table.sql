CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default admin:admin (correct bcrypt hash for 'admin')
INSERT INTO users (username, password_hash) 
VALUES ('admin', '$2a$10$weeJoUKiY.1rpvB0es/Diud6Lzc2byx.LmMhuL5z77PWMyHfErvm2') 
ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash;
