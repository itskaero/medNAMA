-- Reference schema. Tables are created programmatically via SQLAlchemy models.
-- Run this manually only if you need to set up the DB without Python.

CREATE EXTENSION IF NOT EXISTS vector;

-- ============ Original tables (Phase 1) ============

CREATE TABLE books (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    filename TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
    error_message TEXT,
    total_pages INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE chunks (
    id SERIAL PRIMARY KEY,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter TEXT,
    page_number INTEGER,
    content TEXT NOT NULL,
    embedding vector(1024),  -- bge-large-en-v1.5 output dimension
    parent_id INTEGER REFERENCES chunks(id) ON DELETE CASCADE,
    extra_metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE figures (
    id SERIAL PRIMARY KEY,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    figure_label TEXT,       -- e.g. "Figure 3.1"
    caption TEXT,            -- AI-generated caption from Gemini
    page_number INTEGER,
    image_data BYTEA NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'image/png',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============ Dashboard tables (updated brief) ============

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student'
        CHECK (role IN ('admin', 'student')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE mcqs (
    id SERIAL PRIMARY KEY,
    book_id INTEGER REFERENCES books(id),
    question_text TEXT NOT NULL,
    options JSONB NOT NULL,
    correct_option TEXT NOT NULL,
    topic TEXT,
    main_category TEXT,
    sub_category TEXT,
    explanation_markdown TEXT,
    explanation_citations JSONB,
    explanation_figures JSONB,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'generating', 'ready', 'failed')),
    error_message TEXT
);

CREATE TABLE quiz_attempts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    score INTEGER,
    total_questions INTEGER
);

CREATE TABLE attempt_answers (
    id SERIAL PRIMARY KEY,
    quiz_attempt_id INTEGER NOT NULL REFERENCES quiz_attempts(id),
    mcq_id INTEGER NOT NULL REFERENCES mcqs(id),
    selected_option TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL
);

-- ============ Indexes ============

-- Vector similarity search (HNSW works on empty tables, unlike IVFFlat)
CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops);

-- Full-text search for hybrid retrieval
CREATE INDEX ON chunks USING gin (to_tsvector('english', content));

-- FK lookups
CREATE INDEX ON chunks (book_id);
CREATE INDEX ON figures (book_id);
CREATE INDEX ON figures (page_number);
CREATE INDEX ON mcqs (book_id);
CREATE INDEX ON mcqs (topic);
CREATE INDEX ON mcqs (main_category);
CREATE INDEX ON mcqs (sub_category);
CREATE INDEX ON quiz_attempts (user_id);
CREATE INDEX ON attempt_answers (quiz_attempt_id);
CREATE INDEX ON attempt_answers (mcq_id);
