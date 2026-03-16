import Database from 'better-sqlite3';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isVercel = !!process.env.VERCEL;
const DB_PATH = isVercel ? '/tmp/gravity.db' : join(__dirname, 'gravity.db');

let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    db.exec(schema);

    // On Vercel cold start, load seed data if DB is empty
    if (isVercel) {
      const count = db.prepare('SELECT COUNT(*) as n FROM figma_files').get().n;
      if (count === 0) {
        loadSeed(db);
      }
    }
  }
  return db;
}

function loadSeed(db) {
  const seedPath = join(__dirname, '..', 'seed.json');
  if (!existsSync(seedPath)) return;

  try {
    const seed = JSON.parse(readFileSync(seedPath, 'utf-8'));
    console.log('[db] Loading seed data on cold start...');

    const insertFile = db.prepare(`INSERT OR IGNORE INTO figma_files (file_key, name, project_name, project_id, last_modified, thumbnail_url, version_count, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertVersion = db.prepare(`INSERT OR IGNORE INTO figma_versions (id, file_key, user_id, user_name, label, description, created_at, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertComment = db.prepare(`INSERT OR IGNORE INTO figma_comments (id, file_key, user_name, user_id, message, parent_id, created_at, resolved_at, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertComponent = db.prepare(`INSERT OR IGNORE INTO figma_components (key, name, description, file_key, containing_frame, thumbnail_url, created_at, updated_at, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertSession = db.prepare(`INSERT OR IGNORE INTO design_sessions (id, designer_name, designer_id, file_key, file_name, project_name, start_time, end_time, duration_minutes, version_count, confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertConfig = db.prepare(`INSERT OR IGNORE INTO config (key, value, updated_at) VALUES (?, ?, ?)`);
    const insertSync = db.prepare(`INSERT OR IGNORE INTO sync_log (id, event_type, status, details, started_at, completed_at, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?)`);

    const tx = db.transaction(() => {
      for (const f of seed.files || []) insertFile.run(f.file_key, f.name, f.project_name, f.project_id, f.last_modified, f.thumbnail_url, f.version_count, f.synced_at);
      for (const v of seed.versions || []) insertVersion.run(v.id, v.file_key, v.user_id, v.user_name, v.label, v.description, v.created_at, v.synced_at);
      for (const c of seed.comments || []) insertComment.run(c.id, c.file_key, c.user_name, c.user_id, c.message, c.parent_id, c.created_at, c.resolved_at, c.synced_at);
      for (const c of seed.components || []) insertComponent.run(c.key, c.name, c.description, c.file_key, c.containing_frame, c.thumbnail_url, c.created_at, c.updated_at, c.synced_at);
      for (const s of seed.sessions || []) insertSession.run(s.id, s.designer_name, s.designer_id, s.file_key, s.file_name, s.project_name, s.start_time, s.end_time, s.duration_minutes, s.version_count, s.confidence);
      for (const c of seed.config || []) insertConfig.run(c.key, c.value, c.updated_at);
      for (const s of seed.sync_log || []) insertSync.run(s.id, s.event_type, s.status, s.details, s.started_at, s.completed_at, s.duration_ms);
    });
    tx();

    console.log(`[db] Seed loaded: ${seed.files?.length || 0} files, ${seed.sessions?.length || 0} sessions, ${seed.components?.length || 0} components`);
  } catch (e) {
    console.error('[db] Failed to load seed:', e.message);
  }
}

// Config helpers
export function getConfig(key) {
  const row = getDb().prepare('SELECT value FROM config WHERE key = ?').get(key);
  return row ? row.value : null;
}

export function setConfig(key, value) {
  getDb().prepare(`
    INSERT INTO config (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value);
}

// Sync log helpers
export function logSync(eventType, status, details = null) {
  const now = new Date().toISOString();
  if (status === 'started') {
    const info = getDb().prepare(
      `INSERT INTO sync_log (event_type, status, started_at) VALUES (?, ?, ?)`
    ).run(eventType, status, now);
    return info.lastInsertRowid;
  }
  return null;
}

export function completeSync(id, status, details, startedAt) {
  const now = new Date().toISOString();
  const ms = new Date(now) - new Date(startedAt);
  getDb().prepare(`
    UPDATE sync_log SET status = ?, details = ?, completed_at = ?, duration_ms = ? WHERE id = ?
  `).run(status, JSON.stringify(details), now, ms, id);
}

export function getLastSync() {
  return getDb().prepare(
    `SELECT * FROM sync_log WHERE status = 'completed' ORDER BY completed_at DESC LIMIT 1`
  ).get();
}
