import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
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
  }
  return db;
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
