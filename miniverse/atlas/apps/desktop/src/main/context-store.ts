import Database from "better-sqlite3";
import path from "path";
import { app } from "electron";
import type { ContextEvent } from "./window-tracker";

export class ContextStore {
  private db: Database.Database;

  constructor() {
    const dbPath = path.join(app.getPath("userData"), "atlas-context.db");
    this.db = new Database(dbPath);
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS context_events (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        app_name TEXT NOT NULL,
        bundle_id TEXT,
        window_title TEXT,
        browser_url TEXT,
        tab_title TEXT,
        duration_secs INTEGER,
        synced INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_timestamp ON context_events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_synced ON context_events(synced);
      CREATE INDEX IF NOT EXISTS idx_app_name ON context_events(app_name);
    `);
  }

  insert(event: ContextEvent) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO context_events (id, timestamp, app_name, bundle_id, window_title, browser_url, tab_title, duration_secs)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      event.id,
      event.timestamp,
      event.appName,
      event.bundleId,
      event.windowTitle,
      event.browserUrl,
      event.tabTitle,
      event.durationSecs
    );
  }

  getUnsyncedSince(sinceMs: number, limit: number): ContextEvent[] {
    const since = sinceMs > 0 ? new Date(sinceMs).toISOString() : "1970-01-01T00:00:00.000Z";
    const rows = this.db
      .prepare(
        `SELECT * FROM context_events WHERE synced = 0 AND timestamp > ? ORDER BY timestamp ASC LIMIT ?`
      )
      .all(since, limit) as {
      id: string;
      timestamp: string;
      app_name: string;
      bundle_id: string | null;
      window_title: string | null;
      browser_url: string | null;
      tab_title: string | null;
      duration_secs: number | null;
    }[];

    return rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      appName: r.app_name,
      bundleId: r.bundle_id,
      windowTitle: r.window_title,
      browserUrl: r.browser_url,
      tabTitle: r.tab_title,
      durationSecs: r.duration_secs,
    }));
  }

  markSynced(ids: string[]) {
    const stmt = this.db.prepare(`UPDATE context_events SET synced = 1 WHERE id = ?`);
    const batch = this.db.transaction((ids: string[]) => {
      for (const id of ids) stmt.run(id);
    });
    batch(ids);
  }

  getRecent(limit = 50): ContextEvent[] {
    const rows = this.db
      .prepare(`SELECT * FROM context_events ORDER BY timestamp DESC LIMIT ?`)
      .all(limit) as {
      id: string;
      timestamp: string;
      app_name: string;
      bundle_id: string | null;
      window_title: string | null;
      browser_url: string | null;
      tab_title: string | null;
      duration_secs: number | null;
    }[];

    return rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      appName: r.app_name,
      bundleId: r.bundle_id,
      windowTitle: r.window_title,
      browserUrl: r.browser_url,
      tabTitle: r.tab_title,
      durationSecs: r.duration_secs,
    }));
  }

  getStats() {
    const total = (this.db.prepare(`SELECT COUNT(*) as count FROM context_events`).get() as { count: number }).count;
    const unsynced = (this.db.prepare(`SELECT COUNT(*) as count FROM context_events WHERE synced = 0`).get() as { count: number }).count;
    const today = new Date().toISOString().split("T")[0];
    const todayCount = (
      this.db
        .prepare(`SELECT COUNT(*) as count FROM context_events WHERE timestamp >= ?`)
        .get(`${today}T00:00:00.000Z`) as { count: number }
    ).count;

    // Top apps today
    const topApps = this.db
      .prepare(
        `SELECT app_name, SUM(duration_secs) as total_secs, COUNT(*) as switches
         FROM context_events
         WHERE timestamp >= ? AND duration_secs IS NOT NULL
         GROUP BY app_name
         ORDER BY total_secs DESC
         LIMIT 10`
      )
      .all(`${today}T00:00:00.000Z`) as { app_name: string; total_secs: number; switches: number }[];

    return {
      totalEvents: total,
      unsyncedEvents: unsynced,
      todayEvents: todayCount,
      topApps: topApps.map((a) => ({
        app: a.app_name,
        minutes: Math.round(a.total_secs / 60),
        switches: a.switches,
      })),
    };
  }

  deleteOlderThan(days: number) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    this.db.prepare(`DELETE FROM context_events WHERE timestamp < ? AND synced = 1`).run(cutoff);
  }

  deleteAll() {
    this.db.exec(`DELETE FROM context_events`);
  }

  deleteLast(hours: number) {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    this.db.prepare(`DELETE FROM context_events WHERE timestamp >= ?`).run(cutoff);
  }
}
