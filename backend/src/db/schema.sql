-- Mirrors each Auth0 user, keyed by their Auth0 "sub".
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One saved diagram per (user, repo). Re-generating the same repo
-- overwrites the row (see upsert logic we'll add later).
CREATE TABLE IF NOT EXISTS diagrams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  full_name TEXT NOT NULL,
  graph JSONB NOT NULL,
  explanation TEXT NOT NULL,
  stats JSONB NOT NULL,
  tree JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, full_name)
);

-- Chat turns, per user per repo.
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Durable, shared repo-context + graph cache — NOT per-user. This is what
-- replaces the in-memory repoCache.ts and fixes the "generate first" 409
-- after a server restart or a browser-cache hit.
CREATE TABLE IF NOT EXISTS llm_cache (
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  context JSONB NOT NULL,
  summary JSONB,
  graph JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner, repo)
);

ALTER TABLE llm_cache ADD COLUMN IF NOT EXISTS summary JSONB;

-- Per-user, per-day usage limits.
CREATE TABLE IF NOT EXISTS usage_counters (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  generate_count INT NOT NULL DEFAULT 0,
  chat_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

ALTER TABLE diagrams ADD COLUMN IF NOT EXISTS stars INT NOT NULL DEFAULT 0;
ALTER TABLE diagrams ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE diagrams ADD COLUMN IF NOT EXISTS language TEXT;