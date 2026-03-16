import { getDb } from './db.js';
import { randomUUID } from 'crypto';

const SESSION_GAP_MS = 30 * 60 * 1000;  // 30 minutes
const MIN_DURATION_MIN = 15;              // minimum session estimate

/**
 * Reconstruct design sessions from version history.
 * Groups consecutive versions by same user on same file within 30-min gaps.
 */
export function reconstructSessions(fileKey) {
  const db = getDb();

  // Get all versions for this file, ordered by time
  const versions = db.prepare(`
    SELECT id, file_key, user_id, user_name, created_at
    FROM figma_versions
    WHERE file_key = ?
    ORDER BY created_at ASC
  `).all(fileKey);

  if (!versions.length) return 0;

  // Get file name for session records
  const file = db.prepare('SELECT name, project_name FROM figma_files WHERE file_key = ?').get(fileKey);
  const fileName = file?.name || fileKey;
  const projectName = file?.project_name || null;

  // Delete old sessions for this file
  db.prepare('DELETE FROM design_sessions WHERE file_key = ?').run(fileKey);

  // Group into sessions
  const sessions = [];
  let current = null;

  for (const v of versions) {
    const ts = new Date(v.created_at).getTime();

    if (!current || current.user_id !== v.user_id || ts - current.endMs > SESSION_GAP_MS) {
      // Start new session
      if (current) sessions.push(current);
      current = {
        user_id: v.user_id,
        user_name: v.user_name,
        startMs: ts,
        endMs: ts,
        count: 1,
      };
    } else {
      // Extend current session
      current.endMs = ts;
      current.count++;
    }
  }
  if (current) sessions.push(current);

  // Insert sessions
  const insert = db.prepare(`
    INSERT INTO design_sessions (id, designer_name, designer_id, file_key, file_name, project_name,
      start_time, end_time, duration_minutes, version_count, confidence)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const s of sessions) {
      const durationMs = s.endMs - s.startMs;
      const durationMin = Math.max(Math.round(durationMs / 60000), MIN_DURATION_MIN);
      const confidence = s.count >= 5 ? 'high' : s.count >= 2 ? 'medium' : 'low';

      insert.run(
        randomUUID(),
        s.user_name,
        s.user_id,
        fileKey,
        fileName,
        projectName,
        new Date(s.startMs).toISOString(),
        new Date(s.endMs).toISOString(),
        durationMin,
        s.count,
        confidence
      );
    }
  });

  tx();
  return sessions.length;
}

/**
 * Reconstruct sessions for all synced files.
 */
export function reconstructAllSessions() {
  const db = getDb();
  const files = db.prepare('SELECT file_key FROM figma_files').all();
  let total = 0;
  for (const f of files) {
    total += reconstructSessions(f.file_key);
  }
  return total;
}
