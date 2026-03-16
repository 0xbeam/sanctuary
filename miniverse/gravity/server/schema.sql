-- Gravity v2 Schema

CREATE TABLE IF NOT EXISTS figma_files (
  file_key      TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  project_name  TEXT,
  project_id    TEXT,
  last_modified TEXT NOT NULL,
  thumbnail_url TEXT,
  version_count INTEGER DEFAULT 0,
  synced_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS figma_versions (
  id          TEXT NOT NULL,
  file_key    TEXT NOT NULL REFERENCES figma_files(file_key),
  user_id     TEXT NOT NULL,
  user_name   TEXT NOT NULL,
  label       TEXT,
  description TEXT,
  created_at  TEXT NOT NULL,
  synced_at   TEXT NOT NULL,
  PRIMARY KEY (file_key, id)
);

CREATE TABLE IF NOT EXISTS design_sessions (
  id               TEXT PRIMARY KEY,
  designer_name    TEXT NOT NULL,
  designer_id      TEXT,
  file_key         TEXT NOT NULL,
  file_name        TEXT,
  project_name     TEXT,
  start_time       TEXT NOT NULL,
  end_time         TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  version_count    INTEGER NOT NULL,
  confidence       TEXT NOT NULL CHECK(confidence IN ('high','medium','low'))
);

CREATE TABLE IF NOT EXISTS figma_comments (
  id          TEXT PRIMARY KEY,
  file_key    TEXT NOT NULL,
  user_name   TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  message     TEXT,
  parent_id   TEXT,
  order_id    TEXT,
  created_at  TEXT NOT NULL,
  resolved_at TEXT,
  synced_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS figma_components (
  key           TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  file_key      TEXT NOT NULL,
  containing_frame TEXT,
  thumbnail_url TEXT,
  created_at    TEXT,
  updated_at    TEXT,
  synced_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type   TEXT NOT NULL,
  status       TEXT NOT NULL CHECK(status IN ('started','completed','failed')),
  details      TEXT,
  started_at   TEXT NOT NULL,
  completed_at TEXT,
  duration_ms  INTEGER
);

CREATE TABLE IF NOT EXISTS config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token      TEXT PRIMARY KEY,
  provider   TEXT NOT NULL CHECK(provider IN ('google','figma')),
  user_email TEXT,
  user_name  TEXT NOT NULL,
  user_avatar TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS allowed_users (
  email TEXT PRIMARY KEY,
  added_by TEXT,
  added_at TEXT NOT NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_auth_expires ON auth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_versions_file ON figma_versions(file_key);
CREATE INDEX IF NOT EXISTS idx_versions_user ON figma_versions(user_name);
CREATE INDEX IF NOT EXISTS idx_versions_created ON figma_versions(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_designer ON design_sessions(designer_name);
CREATE INDEX IF NOT EXISTS idx_sessions_file ON design_sessions(file_key);
CREATE INDEX IF NOT EXISTS idx_sessions_start ON design_sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_comments_file ON figma_comments(file_key);
CREATE INDEX IF NOT EXISTS idx_comments_resolved ON figma_comments(resolved_at);
