import { getDb, logSync, completeSync, getConfig, setConfig } from './db.js';
import * as figma from './figma-client.js';
import { reconstructAllSessions } from './session-engine.js';

let syncing = false;

export function isSyncing() { return syncing; }

/**
 * Full sync: teams → projects → files → versions → comments → components → sessions
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
  const counts = { projects: 0, files: 0, versions: 0, comments: 0, components: 0, sessions: 0 };

  try {
    console.log('[sync] Starting full sync for team', teamId);
    const db = getDb();

    // 1. Get all projects
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
    for (const proj of projects) {
      try {
        const files = await figma.getProjectFiles(proj.id);
        for (const f of files) {
          upsertFile.run(f.key, f.name, proj.name, String(proj.id), f.last_modified, f.thumbnail_url || null);
          allFiles.push({ key: f.key, lastModified: f.last_modified });
        }
        counts.files += files.length;
      } catch (err) {
        console.warn(`[sync] Failed to get files for project ${proj.name}:`, err.message);
      }
    }
    console.log(`[sync] Found ${allFiles.length} files across ${projects.length} projects`);

    // 3. Get versions for recently modified files (last 90 days)
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const recentFiles = allFiles.filter(f => f.lastModified >= cutoff);
    console.log(`[sync] Fetching versions for ${recentFiles.length} recently modified files`);

    const upsertVersion = db.prepare(`
      INSERT INTO figma_versions (id, file_key, user_id, user_name, label, description, created_at, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(file_key, id) DO UPDATE SET
        label = excluded.label,
        synced_at = excluded.synced_at
    `);

    for (const f of recentFiles) {
      try {
        const versions = await figma.getFileVersions(f.key, 2); // 2 pages = ~50 versions
        const tx = db.transaction(() => {
          for (const v of versions) {
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

        // Update version count
        db.prepare('UPDATE figma_files SET version_count = ? WHERE file_key = ?')
          .run(versions.length, f.key);
      } catch (err) {
        console.warn(`[sync] Failed to get versions for ${f.key}:`, err.message);
      }
    }
    console.log(`[sync] Synced ${counts.versions} versions`);

    // 4. Get comments for recent files
    const commentFiles = recentFiles.slice(0, 50); // Limit to avoid rate limits
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

    // 6. Reconstruct sessions from version history
    counts.sessions = reconstructAllSessions();
    console.log(`[sync] Reconstructed ${counts.sessions} design sessions`);

    setConfig('last_sync', new Date().toISOString());
    completeSync(syncId, 'completed', counts, startedAt);
    console.log('[sync] Full sync completed:', counts);
    return counts;
  } catch (err) {
    completeSync(syncId, 'failed', { error: err.message }, startedAt);
    console.error('[sync] Failed:', err);
    throw err;
  } finally {
    syncing = false;
  }
}
