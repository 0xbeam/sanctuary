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

    // 7. Post-sync computations (v4)
    try {
      computeCollaborationEdges(db);
      computeWorkloadSnapshots(db);
      snapshotComponents(db);
      console.log('[sync] Post-sync computations completed');
    } catch (err) {
      console.warn('[sync] Post-sync computation error:', err.message);
    }

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

/**
 * Compute collaboration edges: which designers co-edit the same files within 7-day windows.
 */
function computeCollaborationEdges(db) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Get all designer-file pairs from recent sessions
  const pairs = db.prepare(`
    SELECT DISTINCT designer_name, file_key, MAX(end_time) as last_active
    FROM design_sessions
    WHERE start_time >= datetime('now', '-90 days')
    GROUP BY designer_name, file_key
  `).all();

  // Build file -> designers map
  const fileDesigners = {};
  for (const p of pairs) {
    if (!fileDesigners[p.file_key]) fileDesigners[p.file_key] = [];
    fileDesigners[p.file_key].push({ designer: p.designer_name, last: p.last_active });
  }

  // Compute edges
  const edges = {};
  for (const [fileKey, designers] of Object.entries(fileDesigners)) {
    for (let i = 0; i < designers.length; i++) {
      for (let j = i + 1; j < designers.length; j++) {
        const a = designers[i].designer < designers[j].designer ? designers[i] : designers[j];
        const b = designers[i].designer < designers[j].designer ? designers[j] : designers[i];
        const key = `${a.designer}||${b.designer}`;
        if (!edges[key]) edges[key] = { a: a.designer, b: b.designer, files: 0, lastOverlap: '' };
        edges[key].files++;
        const latest = a.last > b.last ? a.last : b.last;
        if (latest > edges[key].lastOverlap) edges[key].lastOverlap = latest;
      }
    }
  }

  // Write to DB
  const now = new Date().toISOString();
  db.prepare('DELETE FROM collaboration_edges').run();
  const insert = db.prepare(`
    INSERT INTO collaboration_edges (designer_a, designer_b, shared_files, co_work_score, last_overlap, computed_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction(() => {
    for (const e of Object.values(edges)) {
      insert.run(e.a, e.b, e.files, e.files, e.lastOverlap, now);
    }
  });
  tx();
  console.log(`[sync] Computed ${Object.keys(edges).length} collaboration edges`);
}

/**
 * Compute workload snapshots for the current week.
 */
function computeWorkloadSnapshots(db) {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + mondayOffset);
  weekStart.setHours(0, 0, 0, 0);
  const weekLabel = weekStart.toISOString().slice(0, 10);

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();

  const designers = db.prepare('SELECT DISTINCT designer_name FROM design_sessions').all();

  const upsert = db.prepare(`
    INSERT INTO workload_snapshots (designer_name, week, total_minutes, after_hours_pct, weekend_pct, projects, workload_score, risk_level, computed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(designer_name, week) DO UPDATE SET
      total_minutes = excluded.total_minutes,
      after_hours_pct = excluded.after_hours_pct,
      weekend_pct = excluded.weekend_pct,
      projects = excluded.projects,
      workload_score = excluded.workload_score,
      risk_level = excluded.risk_level,
      computed_at = excluded.computed_at
  `);

  const tx = db.transaction(() => {
    for (const { designer_name } of designers) {
      const sessions = db.prepare(`
        SELECT start_time, duration_minutes FROM design_sessions
        WHERE designer_name = ? AND start_time >= ?
      `).all(designer_name, weekAgo);

      let totalMins = 0, afterMins = 0, weekendMins = 0;
      const projects = new Set();

      for (const s of sessions) {
        const d = new Date(s.start_time);
        totalMins += s.duration_minutes;
        if (d.getHours() < 9 || d.getHours() >= 18) afterMins += s.duration_minutes;
        if (d.getDay() === 0 || d.getDay() === 6) weekendMins += s.duration_minutes;
      }

      // Get projects
      const projRows = db.prepare(`
        SELECT DISTINCT project_name FROM design_sessions
        WHERE designer_name = ? AND start_time >= ?
      `).all(designer_name, weekAgo);

      const afterPct = totalMins > 0 ? Math.round((afterMins / totalMins) * 100) : 0;
      const weekendPct = totalMins > 0 ? Math.round((weekendMins / totalMins) * 100) : 0;

      // Average from previous 4 weeks
      const avg = db.prepare(`
        SELECT SUM(duration_minutes) / 4.0 as avg FROM design_sessions
        WHERE designer_name = ? AND start_time >= ? AND start_time < ?
      `).get(designer_name, fourWeeksAgo, weekAgo);
      const avgMins = avg?.avg || totalMins;

      // Score
      let score = 50;
      if (avgMins > 0) score = Math.min(100, Math.round((totalMins / avgMins) * 50));
      if (afterPct > 20) score += 15;
      if (weekendPct > 10) score += 10;
      score = Math.min(100, Math.max(0, score));

      // Risk
      const recentSnaps = db.prepare(`
        SELECT risk_level FROM workload_snapshots
        WHERE designer_name = ? AND week < ? ORDER BY week DESC LIMIT 3
      `).all(designer_name, weekLabel);
      const consecutiveHigh = recentSnaps.filter(s => s.risk_level !== 'green').length;

      let risk = 'green';
      const overAvg = avgMins > 0 && totalMins > avgMins * 1.2;
      const suddenDrop = avgMins > 0 && totalMins < avgMins * 0.5;
      if ((overAvg && consecutiveHigh >= 2 && afterPct > 30) || (suddenDrop && avgMins > 60)) risk = 'red';
      else if (overAvg || afterPct > 20 || consecutiveHigh >= 1) risk = 'amber';

      upsert.run(designer_name, weekLabel, totalMins, afterPct, weekendPct, projRows.length, score, risk, new Date().toISOString());
    }
  });
  tx();
  console.log(`[sync] Computed workload snapshots for ${designers.length} designers`);
}

/**
 * Snapshot current component state for change detection.
 */
function snapshotComponents(db) {
  const now = new Date().toISOString();
  const components = db.prepare('SELECT key, name, description FROM figma_components').all();

  const insert = db.prepare('INSERT INTO component_snapshots (component_key, name, description, synced_at) VALUES (?, ?, ?, ?)');
  const tx = db.transaction(() => {
    for (const c of components) {
      insert.run(c.key, c.name, c.description, now);
    }
  });
  tx();
  console.log(`[sync] Snapshot ${components.length} components`);
}
