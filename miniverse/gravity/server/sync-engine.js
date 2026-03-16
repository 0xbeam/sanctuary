import { getDb, logSync, completeSync, getConfig, setConfig } from './db.js';
import * as figma from './figma-client.js';
import { reconstructSessions } from './session-engine.js';

let syncing = false;

export function isSyncing() { return syncing; }

/**
 * Smart sync: full on first run, incremental after that.
 * Incremental only fetches versions/comments for files modified since last sync.
 */
export async function fullSync() {
  if (syncing) {
    console.log('[sync] Already running, skipping');
    return { skipped: true };
  }

  const teamId = getConfig('figma_team_id') || process.env.FIGMA_TEAM_ID;
  if (!teamId) throw new Error('Figma team ID not configured');

  syncing = true;
  const startedAt = new Date().toISOString();
  const syncId = logSync('full_sync', 'started');
  const counts = { projects: 0, files: 0, versions: 0, comments: 0, components: 0, sessions: 0, mode: 'full' };

  try {
    const db = getDb();
    const lastSyncTime = getConfig('last_sync');
    const isIncremental = !!lastSyncTime;

    if (isIncremental) {
      counts.mode = 'incremental';
      console.log(`[sync] Incremental sync since ${lastSyncTime}`);
    } else {
      console.log('[sync] Full initial sync for team', teamId);
    }

    // 1. Get all projects (always — lightweight call)
    const projects = await figma.getTeamProjects(teamId);
    counts.projects = projects.length;
    console.log(`[sync] Found ${projects.length} projects`);

    // 2. Get files for each project
    const upsertFile = db.prepare(`
      INSERT INTO figma_files (file_key, name, project_name, project_id, last_modified, thumbnail_url, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(file_key) DO UPDATE SET
        name = excluded.name,
        project_name = excluded.project_name,
        last_modified = excluded.last_modified,
        thumbnail_url = excluded.thumbnail_url,
        synced_at = excluded.synced_at
    `);

    const allFiles = [];
    const changedFiles = [];

    for (const proj of projects) {
      try {
        const files = await figma.getProjectFiles(proj.id);
        for (const f of files) {
          upsertFile.run(f.key, f.name, proj.name, String(proj.id), f.last_modified, f.thumbnail_url || null);
          allFiles.push({ key: f.key, lastModified: f.last_modified });

          if (!isIncremental || f.last_modified > lastSyncTime) {
            changedFiles.push({ key: f.key, lastModified: f.last_modified });
          }
        }
        counts.files += files.length;
      } catch (err) {
        console.warn(`[sync] Failed to get files for project ${proj.name}:`, err.message);
      }
    }

    const targetFiles = isIncremental ? changedFiles : allFiles.filter(f => {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      return f.lastModified >= cutoff;
    });

    console.log(`[sync] ${allFiles.length} total files, ${targetFiles.length} to process (${counts.mode})`);

    // 3. Get versions for target files
    const upsertVersion = db.prepare(`
      INSERT INTO figma_versions (id, file_key, user_id, user_name, label, description, created_at, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(file_key, id) DO UPDATE SET
        label = excluded.label,
        synced_at = excluded.synced_at
    `);

    const filesWithNewVersions = new Set();

    for (const f of targetFiles) {
      try {
        const maxPages = isIncremental ? 1 : 2;
        const versions = await figma.getFileVersions(f.key, maxPages);

        let newCount = 0;
        const tx = db.transaction(() => {
          for (const v of versions) {
            const existing = db.prepare('SELECT id FROM figma_versions WHERE file_key = ? AND id = ?').get(f.key, String(v.id));
            if (!existing) newCount++;
            upsertVersion.run(
              String(v.id), f.key,
              v.user?.id || 'unknown', v.user?.handle || 'Unknown',
              v.label || null, v.description || null,
              v.created_at
            );
          }
        });
        tx();
        counts.versions += versions.length;

        if (newCount > 0) filesWithNewVersions.add(f.key);

        db.prepare('UPDATE figma_files SET version_count = ? WHERE file_key = ?')
          .run(versions.length, f.key);
      } catch (err) {
        console.warn(`[sync] Failed to get versions for ${f.key}:`, err.message);
      }
    }
    console.log(`[sync] Synced ${counts.versions} versions (${filesWithNewVersions.size} files with new data)`);

    // 4. Get comments for target files
    const commentFiles = targetFiles.slice(0, 50);
    const upsertComment = db.prepare(`
      INSERT INTO figma_comments (id, file_key, user_name, user_id, message, parent_id, created_at, resolved_at, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        resolved_at = excluded.resolved_at,
        synced_at = excluded.synced_at
    `);

    for (const f of commentFiles) {
      try {
        const comments = await figma.getFileComments(f.key);
        const tx = db.transaction(() => {
          for (const c of comments) {
            upsertComment.run(
              c.id, f.key,
              c.user?.handle || 'Unknown', c.user?.id || 'unknown',
              c.message || '', c.parent_id || null,
              c.created_at, c.resolved_at || null
            );
          }
        });
        tx();
        counts.comments += comments.length;
      } catch (err) {
        console.warn(`[sync] Failed to get comments for ${f.key}:`, err.message);
      }
    }
    console.log(`[sync] Synced ${counts.comments} comments`);

    // 5. Get team components
    try {
      const components = await figma.getTeamComponents(teamId);
      const upsertComp = db.prepare(`
        INSERT INTO figma_components (key, name, description, file_key, containing_frame, thumbnail_url, created_at, updated_at, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          thumbnail_url = excluded.thumbnail_url,
          updated_at = excluded.updated_at,
          synced_at = excluded.synced_at
      `);
      const tx = db.transaction(() => {
        for (const c of components) {
          upsertComp.run(
            c.key, c.name, c.description || null,
            c.file_key, c.containing_frame?.name || null,
            c.thumbnail_url || null,
            c.created_at || null, c.updated_at || null
          );
        }
      });
      tx();
      counts.components = components.length;
      console.log(`[sync] Synced ${components.length} components`);
    } catch (err) {
      console.warn('[sync] Failed to get components:', err.message);
    }

    // 6. Reconstruct sessions only for files with new versions (or all on first sync)
    const sessionFiles = isIncremental
      ? [...filesWithNewVersions]
      : db.prepare('SELECT file_key FROM figma_files').all().map(f => f.file_key);
    for (const fk of sessionFiles) {
      counts.sessions += reconstructSessions(fk);
    }
    console.log(`[sync] Reconstructed ${counts.sessions} sessions from ${sessionFiles.length} files`);

    setConfig('last_sync', new Date().toISOString());
    completeSync(syncId, 'completed', counts, startedAt);
    console.log(`[sync] ${counts.mode} sync completed:`, counts);
    return counts;
  } catch (err) {
    completeSync(syncId, 'failed', { error: err.message }, startedAt);
    console.error('[sync] Failed:', err);
    throw err;
  } finally {
    syncing = false;
  }
}
