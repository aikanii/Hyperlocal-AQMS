CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default admin:hyperocalityaqmsthesis (bcrypt hash regenerated for new password)
INSERT INTO users (username, password_hash) 
VALUES ('admin', '$2a$10$EvPnzFIR3AGO45ZYrLvVru7TvMuIEHmoS2C43jvZ5a18JeW5jftOm') 
ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash;

