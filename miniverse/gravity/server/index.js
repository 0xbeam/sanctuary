import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import cookieParser from 'cookie-parser';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getDb, getConfig, setConfig, getLastSync } from './db.js';
import { setToken, testConnection } from './figma-client.js';
import { fullSync, isSyncing } from './sync-engine.js';
import { requireAuth, createSession, getSession, deleteSession, googleCallback, figmaCallback } from './auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3847;

app.use(cors());
app.use(express.json());
app.use(cookieParser());

// ──────────────────────────────────────────
// AUTH ROUTES (public — no auth required)
// ──────────────────────────────────────────

app.get('/api/auth/status', (req, res) => {
  const authEnabled = !!(process.env.GOOGLE_CLIENT_ID || process.env.FIGMA_CLIENT_ID);
  const token = req.cookies?.gravity_session || req.headers['x-auth-token'];
  const session = getSession(token);
  res.json({
    auth_enabled: authEnabled,
    logged_in: !!session,
    user: session ? { name: session.user_name, email: session.user_email, avatar: session.user_avatar, provider: session.provider } : null,
    providers: {
      google: !!process.env.GOOGLE_CLIENT_ID,
      figma: !!process.env.FIGMA_CLIENT_ID,
    },
  });
});

app.get('/api/auth/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(400).json({ error: 'Google OAuth not configured' });
  const base = `${req.protocol}://${req.get('host')}`;
  const redirectUri = `${base}/api/auth/google/callback`;
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(process.env.GOOGLE_CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20email%20profile&access_type=offline`;
  res.redirect(url);
});

app.get('/api/auth/google/callback', async (req, res) => {
  try {
    const base = `${req.protocol}://${req.get('host')}`;
    const redirectUri = `${base}/api/auth/google/callback`;
    const user = await googleCallback(req.query.code, redirectUri);
    const token = createSession('google', user);
    res.cookie('gravity_session', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.redirect('/');
  } catch (e) {
    console.error('[auth] Google callback error:', e.message);
    res.redirect('/?auth_error=' + encodeURIComponent(e.message));
  }
});

app.get('/api/auth/figma', (req, res) => {
  if (!process.env.FIGMA_CLIENT_ID) return res.status(400).json({ error: 'Figma OAuth not configured' });
  const base = `${req.protocol}://${req.get('host')}`;
  const redirectUri = `${base}/api/auth/figma/callback`;
  const url = `https://www.figma.com/oauth?client_id=${encodeURIComponent(process.env.FIGMA_CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=file_read&state=gravity&response_type=code`;
  res.redirect(url);
});

app.get('/api/auth/figma/callback', async (req, res) => {
  try {
    const base = `${req.protocol}://${req.get('host')}`;
    const redirectUri = `${base}/api/auth/figma/callback`;
    const user = await figmaCallback(req.query.code, redirectUri);
    const token = createSession('figma', user);
    res.cookie('gravity_session', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.redirect('/');
  } catch (e) {
    console.error('[auth] Figma callback error:', e.message);
    res.redirect('/?auth_error=' + encodeURIComponent(e.message));
  }
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies?.gravity_session;
  if (token) deleteSession(token);
  res.clearCookie('gravity_session');
  res.json({ ok: true });
});

// ──────────────────────────────────────────
// AUTH MIDDLEWARE — protect all /api/* below
// ──────────────────────────────────────────
app.use('/api', (req, res, next) => {
  // Skip auth routes and cron/webhook
  if (req.path.startsWith('/auth/') || req.path === '/cron' || req.path === '/webhook') return next();
  requireAuth(req, res, next);
});

// Serve static files from parent directory (index.html, data.json)
app.use(express.static(join(__dirname, '..')));

// ──────────────────────────────────────────
// API: Status
// ──────────────────────────────────────────

app.get('/api/status', (req, res) => {
  const lastSync = getLastSync();
  const teamId = getConfig('figma_team_id') || process.env.FIGMA_TEAM_ID || null;
  const configured = !!(teamId && (getConfig('figma_pat') || process.env.FIGMA_PAT));

  const db = getDb();
  const fileCt = db.prepare('SELECT COUNT(*) as n FROM figma_files').get().n;
  const versionCt = db.prepare('SELECT COUNT(*) as n FROM figma_versions').get().n;
  const sessionCt = db.prepare('SELECT COUNT(*) as n FROM design_sessions').get().n;
  const commentCt = db.prepare('SELECT COUNT(*) as n FROM figma_comments').get().n;
  const componentCt = db.prepare('SELECT COUNT(*) as n FROM figma_components').get().n;

  res.json({
    configured,
    syncing: isSyncing(),
    lastSync: lastSync ? { completedAt: lastSync.completed_at, durationMs: lastSync.duration_ms, details: JSON.parse(lastSync.details || '{}') } : null,
    counts: { files: fileCt, versions: versionCt, sessions: sessionCt, comments: commentCt, components: componentCt },
  });
});

// ──────────────────────────────────────────
// API: Config
// ──────────────────────────────────────────

app.get('/api/config', (req, res) => {
  res.json({
    figma_team_id: getConfig('figma_team_id') || process.env.FIGMA_TEAM_ID || '',
    has_pat: !!(getConfig('figma_pat') || process.env.FIGMA_PAT),
    sync_interval: getConfig('sync_interval') || process.env.SYNC_INTERVAL || '15',
  });
});

app.post('/api/config', async (req, res) => {
  const { figma_team_id, figma_pat, sync_interval } = req.body;

  if (figma_team_id) setConfig('figma_team_id', figma_team_id);
  if (figma_pat) {
    setConfig('figma_pat', figma_pat);
    setToken(figma_pat);
  }
  if (sync_interval) setConfig('sync_interval', sync_interval);

  // Test connection if both are set
  const teamId = figma_team_id || getConfig('figma_team_id') || process.env.FIGMA_TEAM_ID;
  if (teamId && (figma_pat || getConfig('figma_pat') || process.env.FIGMA_PAT)) {
    const result = await testConnection(teamId);
    return res.json({ saved: true, connection: result });
  }

  res.json({ saved: true });
});

// ──────────────────────────────────────────
// API: Sync
// ──────────────────────────────────────────

app.post('/api/sync', async (req, res) => {
  if (isSyncing()) return res.json({ status: 'already_running' });

  // Don't await — run in background
  fullSync().catch(err => console.error('[api] Sync error:', err));
  res.json({ status: 'started' });
});

// ──────────────────────────────────────────
// API: Sessions (Time Intelligence)
// ──────────────────────────────────────────

app.get('/api/sessions', (req, res) => {
  const { designer, from, to, project, limit = '200' } = req.query;
  const db = getDb();

  let sql = 'SELECT * FROM design_sessions WHERE 1=1';
  const params = [];

  if (designer) { sql += ' AND designer_name = ?'; params.push(designer); }
  if (from) { sql += ' AND start_time >= ?'; params.push(from); }
  if (to) { sql += ' AND end_time <= ?'; params.push(to); }
  if (project) { sql += ' AND project_name LIKE ?'; params.push(`%${project}%`); }

  sql += ' ORDER BY start_time DESC LIMIT ?';
  params.push(parseInt(limit));

  res.json(db.prepare(sql).all(...params));
});

app.get('/api/sessions/summary', (req, res) => {
  const db = getDb();
  const { period = 'week' } = req.query;

  const cutoff = period === 'month'
    ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const byDesigner = db.prepare(`
    SELECT designer_name, SUM(duration_minutes) as total_minutes, COUNT(*) as session_count,
           AVG(duration_minutes) as avg_session_min, COUNT(DISTINCT file_key) as files_touched
    FROM design_sessions
    WHERE start_time >= ?
    GROUP BY designer_name
    ORDER BY total_minutes DESC
  `).all(cutoff);

  const total = db.prepare(`
    SELECT SUM(duration_minutes) as total_minutes, COUNT(*) as session_count,
           COUNT(DISTINCT designer_name) as active_designers
    FROM design_sessions
    WHERE start_time >= ?
  `).get(cutoff);

  const byDay = db.prepare(`
    SELECT DATE(start_time) as day, SUM(duration_minutes) as minutes, COUNT(*) as sessions
    FROM design_sessions
    WHERE start_time >= ?
    GROUP BY DATE(start_time)
    ORDER BY day
  `).all(cutoff);

  res.json({ period, cutoff, total, byDesigner, byDay });
});

// ──────────────────────────────────────────
// API: Designers
// ──────────────────────────────────────────

app.get('/api/designers', (req, res) => {
  const db = getDb();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const designers = db.prepare(`
    SELECT
      designer_name,
      designer_id,
      SUM(duration_minutes) as total_minutes,
      COUNT(*) as total_sessions,
      COUNT(DISTINCT file_key) as total_files,
      COUNT(DISTINCT project_name) as total_projects,
      MAX(end_time) as last_active,
      AVG(duration_minutes) as avg_session_min
    FROM design_sessions
    GROUP BY designer_name
    ORDER BY total_minutes DESC
  `).all();

  // Enrich with weekly hours
  for (const d of designers) {
    const week = db.prepare(`
      SELECT SUM(duration_minutes) as week_min FROM design_sessions
      WHERE designer_name = ? AND start_time >= ?
    `).get(d.designer_name, weekAgo);
    d.week_minutes = week?.week_min || 0;

    const month = db.prepare(`
      SELECT SUM(duration_minutes) as month_min FROM design_sessions
      WHERE designer_name = ? AND start_time >= ?
    `).get(d.designer_name, monthAgo);
    d.month_minutes = month?.month_min || 0;

    // Active days this month
    const days = db.prepare(`
      SELECT COUNT(DISTINCT DATE(start_time)) as days FROM design_sessions
      WHERE designer_name = ? AND start_time >= ?
    `).get(d.designer_name, monthAgo);
    d.active_days_month = days?.days || 0;
  }

  res.json(designers);
});

app.get('/api/designers/:name/pattern', (req, res) => {
  const db = getDb();
  const { name } = req.params;
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // 7x24 heatmap data: day-of-week x hour-of-day
  const sessions = db.prepare(`
    SELECT start_time, duration_minutes FROM design_sessions
    WHERE designer_name = ? AND start_time >= ?
  `).all(name, monthAgo);

  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const s of sessions) {
    const d = new Date(s.start_time);
    grid[d.getDay()][d.getHours()] += s.duration_minutes;
  }

  res.json({ designer: name, period: '30d', grid });
});

// ──────────────────────────────────────────
// API: Projects (enhanced)
// ──────────────────────────────────────────

app.get('/api/projects', (req, res) => {
  const db = getDb();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const projects = db.prepare(`
    SELECT project_name, COUNT(*) as file_count, MAX(last_modified) as last_activity
    FROM figma_files
    WHERE project_name IS NOT NULL
    GROUP BY project_name
    ORDER BY last_activity DESC
  `).all();

  for (const p of projects) {
    const hours = db.prepare(`
      SELECT SUM(duration_minutes) as mins FROM design_sessions
      WHERE project_name = ? AND start_time >= ?
    `).get(p.project_name, weekAgo);
    p.week_minutes = hours?.mins || 0;

    const comments = db.prepare(`
      SELECT COUNT(*) as n FROM figma_comments c
      JOIN figma_files f ON c.file_key = f.file_key
      WHERE f.project_name = ? AND c.resolved_at IS NULL
    `).get(p.project_name);
    p.unresolved_comments = comments?.n || 0;
  }

  res.json(projects);
});

// ──────────────────────────────────────────
// API: Comments (Collaboration)
// ──────────────────────────────────────────

app.get('/api/comments', (req, res) => {
  const { unresolved, file, limit = '50' } = req.query;
  const db = getDb();

  let sql = `
    SELECT c.*, f.name as file_name, f.project_name
    FROM figma_comments c
    LEFT JOIN figma_files f ON c.file_key = f.file_key
    WHERE 1=1
  `;
  const params = [];

  if (unresolved === 'true') { sql += ' AND c.resolved_at IS NULL'; }
  if (file) { sql += ' AND c.file_key = ?'; params.push(file); }

  sql += ' ORDER BY c.created_at DESC LIMIT ?';
  params.push(parseInt(limit));

  res.json(db.prepare(sql).all(...params));
});

app.get('/api/comments/metrics', (req, res) => {
  const db = getDb();
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const total = db.prepare('SELECT COUNT(*) as n FROM figma_comments WHERE created_at >= ?').get(monthAgo).n;
  const unresolved = db.prepare('SELECT COUNT(*) as n FROM figma_comments WHERE resolved_at IS NULL AND created_at >= ?').get(monthAgo).n;

  const avgResolution = db.prepare(`
    SELECT AVG((julianday(resolved_at) - julianday(created_at)) * 24) as avg_hours
    FROM figma_comments
    WHERE resolved_at IS NOT NULL AND created_at >= ?
  `).get(monthAgo);

  const byWeek = db.prepare(`
    SELECT strftime('%Y-W%W', created_at) as week, COUNT(*) as comments
    FROM figma_comments
    WHERE created_at >= ?
    GROUP BY week ORDER BY week
  `).all(monthAgo);

  res.json({
    total,
    unresolved,
    avgResolutionHours: Math.round(avgResolution?.avg_hours || 0),
    byWeek,
  });
});

// ──────────────────────────────────────────
// API: Components (Design System Health)
// ──────────────────────────────────────────

app.get('/api/components', (req, res) => {
  const db = getDb();
  const components = db.prepare(`
    SELECT *,
      CAST((julianday('now') - julianday(COALESCE(updated_at, created_at))) AS INTEGER) as days_since_update
    FROM figma_components
    ORDER BY updated_at DESC
  `).all();

  for (const c of components) {
    const days = c.days_since_update || 999;
    c.health = days <= 30 ? 'healthy' : days <= 90 ? 'aging' : 'stale';
    c.health_score = Math.max(0, 100 - Math.floor(days * 0.8));
  }

  const total = components.length;
  const healthy = components.filter(c => c.health === 'healthy').length;
  const withDesc = components.filter(c => c.description).length;

  res.json({
    components,
    summary: {
      total,
      healthy,
      aging: components.filter(c => c.health === 'aging').length,
      stale: components.filter(c => c.health === 'stale').length,
      descriptionCoverage: total ? Math.round((withDesc / total) * 100) : 0,
      avgHealthScore: total ? Math.round(components.reduce((s, c) => s + c.health_score, 0) / total) : 0,
    },
  });
});

// ──────────────────────────────────────────
// API: Figma data for frontend (replaces data.json)
// ──────────────────────────────────────────

app.get('/api/dashboard', (req, res) => {
  const db = getDb();

  const files = db.prepare('SELECT COUNT(*) as n FROM figma_files').get().n;
  const activeFiles = db.prepare(`SELECT COUNT(*) as n FROM figma_files WHERE last_modified >= datetime('now', '-90 days')`).get().n;
  const designers = db.prepare('SELECT COUNT(DISTINCT designer_name) as n FROM design_sessions').get().n;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const weekHours = db.prepare(`SELECT SUM(duration_minutes) as mins FROM design_sessions WHERE start_time >= ?`).get(weekAgo);
  const activeToday = db.prepare(`SELECT COUNT(DISTINCT designer_name) as n FROM design_sessions WHERE DATE(start_time) = DATE('now')`).get().n;

  const projects = db.prepare('SELECT COUNT(DISTINCT project_name) as n FROM figma_files WHERE project_name IS NOT NULL').get().n;

  // Monthly timeline from sessions
  const timeline = db.prepare(`
    SELECT strftime('%Y-%m', start_time) as month, SUM(duration_minutes) as minutes, COUNT(*) as sessions
    FROM design_sessions
    GROUP BY month ORDER BY month
  `).all();

  // Recent activity
  const recentSessions = db.prepare(`
    SELECT designer_name, file_name, project_name, start_time, duration_minutes, confidence
    FROM design_sessions
    ORDER BY start_time DESC LIMIT 50
  `).all();

  res.json({
    summary: {
      total_projects: projects,
      total_files: files,
      active_files: activeFiles,
      stale_files: files - activeFiles,
      total_designers: designers,
      design_hours_week: Math.round((weekHours?.mins || 0) / 60),
      active_designers_today: activeToday,
    },
    timeline,
    recent_sessions: recentSessions,
  });
});

// ──────────────────────────────────────────
// API: Stale Files (Alerts)
// ──────────────────────────────────────────

app.get('/api/alerts/stale', (req, res) => {
  const db = getDb();
  const staleFiles = db.prepare(`
    SELECT f.file_key, f.name, f.project_name, f.last_modified,
      CAST((julianday('now') - julianday(f.last_modified)) AS INTEGER) as days_stale
    FROM figma_files f
    WHERE julianday('now') - julianday(f.last_modified) > 14
    ORDER BY f.last_modified ASC
    LIMIT 50
  `).all();

  const unresolvedComments = db.prepare(`
    SELECT c.file_key, f.name as file_name, f.project_name, COUNT(*) as count,
      MIN(c.created_at) as oldest
    FROM figma_comments c
    JOIN figma_files f ON c.file_key = f.file_key
    WHERE c.resolved_at IS NULL
      AND julianday('now') - julianday(c.created_at) > 2
    GROUP BY c.file_key
    ORDER BY count DESC
    LIMIT 20
  `).all();

  const inactiveDesigners = db.prepare(`
    SELECT designer_name, MAX(end_time) as last_active,
      CAST((julianday('now') - julianday(MAX(end_time))) AS INTEGER) as days_inactive
    FROM design_sessions
    GROUP BY designer_name
    HAVING julianday('now') - julianday(MAX(end_time)) > 7
    ORDER BY last_active ASC
  `).all();

  res.json({ staleFiles, unresolvedComments, inactiveDesigners });
});

// ──────────────────────────────────────────
// API: Designer Profile
// ──────────────────────────────────────────

app.get('/api/designers/:name/profile', (req, res) => {
  const db = getDb();
  const { name } = req.params;
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Summary stats
  const stats = db.prepare(`
    SELECT
      SUM(duration_minutes) as total_minutes,
      COUNT(*) as total_sessions,
      COUNT(DISTINCT file_key) as total_files,
      COUNT(DISTINCT project_name) as total_projects,
      AVG(duration_minutes) as avg_session_min,
      MIN(start_time) as first_active,
      MAX(end_time) as last_active
    FROM design_sessions
    WHERE designer_name = ?
  `).get(name);

  // Recent sessions (last 30 days)
  const sessions = db.prepare(`
    SELECT file_name, project_name, start_time, end_time, duration_minutes, version_count, confidence
    FROM design_sessions
    WHERE designer_name = ? AND start_time >= ?
    ORDER BY start_time DESC
  `).all(name, monthAgo);

  // Daily hours for last 30 days
  const dailyHours = db.prepare(`
    SELECT DATE(start_time) as day, SUM(duration_minutes) as minutes, COUNT(*) as sessions
    FROM design_sessions
    WHERE designer_name = ? AND start_time >= ?
    GROUP BY DATE(start_time)
    ORDER BY day
  `).all(name, monthAgo);

  // Top projects by time
  const topProjects = db.prepare(`
    SELECT project_name, SUM(duration_minutes) as minutes, COUNT(*) as sessions
    FROM design_sessions
    WHERE designer_name = ? AND start_time >= ?
    GROUP BY project_name
    ORDER BY minutes DESC
    LIMIT 10
  `).all(name, monthAgo);

  // 7x24 heatmap
  const allSessions = db.prepare(`
    SELECT start_time, duration_minutes FROM design_sessions
    WHERE designer_name = ? AND start_time >= ?
  `).all(name, monthAgo);

  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const s of allSessions) {
    const d = new Date(s.start_time);
    grid[d.getDay()][d.getHours()] += s.duration_minutes;
  }

  res.json({ designer: name, stats, sessions, dailyHours, topProjects, heatmap: grid });
});

// ──────────────────────────────────────────
// API: Project Velocity / Burndown
// ──────────────────────────────────────────

app.get('/api/projects/:name/velocity', (req, res) => {
  const db = getDb();
  const { name } = req.params;

  // Weekly velocity for last 12 weeks
  const weekly = db.prepare(`
    SELECT strftime('%Y-W%W', start_time) as week,
      SUM(duration_minutes) as minutes,
      COUNT(*) as sessions,
      COUNT(DISTINCT designer_name) as designers
    FROM design_sessions
    WHERE project_name = ?
      AND start_time >= datetime('now', '-84 days')
    GROUP BY week
    ORDER BY week
  `).all(name);

  // Daily for last 30 days
  const daily = db.prepare(`
    SELECT DATE(start_time) as day,
      SUM(duration_minutes) as minutes,
      COUNT(*) as sessions
    FROM design_sessions
    WHERE project_name = ?
      AND start_time >= datetime('now', '-30 days')
    GROUP BY day
    ORDER BY day
  `).all(name);

  // Contributors
  const contributors = db.prepare(`
    SELECT designer_name, SUM(duration_minutes) as minutes, COUNT(*) as sessions,
      MAX(end_time) as last_active
    FROM design_sessions
    WHERE project_name = ?
    GROUP BY designer_name
    ORDER BY minutes DESC
  `).all(name);

  res.json({ project: name, weekly, daily, contributors });
});

// ──────────────────────────────────────────
// API: File Timeline & Milestones (Module 3)
// ──────────────────────────────────────────

app.get('/api/files/:key/timeline', (req, res) => {
  const db = getDb();
  const { key } = req.params;

  const file = db.prepare('SELECT * FROM figma_files WHERE file_key = ?').get(key);
  if (!file) return res.status(404).json({ error: 'File not found' });

  const versions = db.prepare(`
    SELECT id, user_name, user_id, label, description, created_at
    FROM figma_versions WHERE file_key = ? ORDER BY created_at DESC
  `).all(key);

  const sessions = db.prepare(`
    SELECT designer_name, start_time, end_time, duration_minutes, version_count, confidence
    FROM design_sessions WHERE file_key = ? ORDER BY start_time DESC
  `).all(key);

  const comments = db.prepare(`
    SELECT id, user_name, message, parent_id, created_at, resolved_at
    FROM figma_comments WHERE file_key = ? ORDER BY created_at DESC
  `).all(key);

  // Version velocity: versions per week over last 12 weeks
  const velocity = db.prepare(`
    SELECT strftime('%Y-W%W', created_at) as week, COUNT(*) as versions
    FROM figma_versions WHERE file_key = ? AND created_at >= datetime('now', '-84 days')
    GROUP BY week ORDER BY week
  `).all(key);

  res.json({ file, versions, sessions, comments, velocity });
});

app.get('/api/milestones', (req, res) => {
  const db = getDb();
  const limit = parseInt(req.query.limit || '30');

  const milestones = db.prepare(`
    SELECT v.id, v.file_key, v.user_name, v.label, v.description, v.created_at,
           f.name as file_name, f.project_name
    FROM figma_versions v
    JOIN figma_files f ON v.file_key = f.file_key
    WHERE v.label IS NOT NULL AND v.label != ''
    ORDER BY v.created_at DESC
    LIMIT ?
  `).all(limit);

  res.json(milestones);
});

// ──────────────────────────────────────────
// API: Weekly Digest (Module 1)
// ──────────────────────────────────────────

app.get('/api/digest/weekly', (req, res) => {
  const db = getDb();

  // Determine week boundaries
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  let weekStart, weekEnd;
  if (req.query.week) {
    // Parse ISO week like 2026-W11
    const [y, w] = req.query.week.split('-W').map(Number);
    const jan1 = new Date(y, 0, 1);
    const jan1Day = jan1.getDay() || 7;
    weekStart = new Date(jan1);
    weekStart.setDate(jan1.getDate() + (w - 1) * 7 - jan1Day + 1);
    weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
  } else {
    weekStart = new Date(now);
    weekStart.setDate(now.getDate() + mondayOffset);
    weekStart.setHours(0, 0, 0, 0);
    weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
  }

  const ws = weekStart.toISOString();
  const we = weekEnd.toISOString();
  const prevWs = new Date(weekStart);
  prevWs.setDate(prevWs.getDate() - 7);
  const prevWe = ws;

  // Check cache
  const cached = db.prepare('SELECT data FROM digests WHERE type = ? AND period_start = ?').get('weekly', ws);
  if (cached && !req.query.fresh && req.query.format !== 'markdown') return res.json(JSON.parse(cached.data));

  // Total hours this week vs last week
  const thisWeek = db.prepare('SELECT SUM(duration_minutes) as mins, COUNT(*) as sessions, COUNT(DISTINCT designer_name) as designers FROM design_sessions WHERE start_time >= ? AND start_time < ?').get(ws, we);
  const lastWeek = db.prepare('SELECT SUM(duration_minutes) as mins, COUNT(*) as sessions FROM design_sessions WHERE start_time >= ? AND start_time < ?').get(prevWs.toISOString(), prevWe);

  // Per designer this week vs last week
  const designerThisWeek = db.prepare(`
    SELECT designer_name, SUM(duration_minutes) as minutes, COUNT(*) as sessions, COUNT(DISTINCT project_name) as projects
    FROM design_sessions WHERE start_time >= ? AND start_time < ?
    GROUP BY designer_name ORDER BY minutes DESC
  `).all(ws, we);

  const designerLastWeek = db.prepare(`
    SELECT designer_name, SUM(duration_minutes) as minutes
    FROM design_sessions WHERE start_time >= ? AND start_time < ?
    GROUP BY designer_name
  `).all(prevWs.toISOString(), prevWe);
  const lastWeekMap = Object.fromEntries(designerLastWeek.map(d => [d.designer_name, d.minutes]));

  const designers = designerThisWeek.map(d => ({
    ...d,
    prev_minutes: lastWeekMap[d.designer_name] || 0,
    delta: d.minutes - (lastWeekMap[d.designer_name] || 0),
  }));

  // Projects momentum: this week hours vs 4-week average
  const fourWeeksAgo = new Date(weekStart);
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

  const projectsThisWeek = db.prepare(`
    SELECT project_name, SUM(duration_minutes) as minutes
    FROM design_sessions WHERE start_time >= ? AND start_time < ? AND project_name IS NOT NULL
    GROUP BY project_name
  `).all(ws, we);

  const projectsAvg = db.prepare(`
    SELECT project_name, SUM(duration_minutes) / 4.0 as avg_minutes
    FROM design_sessions WHERE start_time >= ? AND start_time < ? AND project_name IS NOT NULL
    GROUP BY project_name
  `).all(fourWeeksAgo.toISOString(), ws);
  const avgMap = Object.fromEntries(projectsAvg.map(p => [p.project_name, p.avg_minutes]));

  const projects = projectsThisWeek.map(p => ({
    project_name: p.project_name,
    minutes: p.minutes,
    avg_minutes: Math.round(avgMap[p.project_name] || 0),
    momentum: p.minutes > (avgMap[p.project_name] || 0) * 1.2 ? 'up' : p.minutes < (avgMap[p.project_name] || 0) * 0.8 ? 'down' : 'steady',
  })).sort((a, b) => b.minutes - a.minutes);

  // Newly stale files (active last week, untouched this week)
  const newlyStale = db.prepare(`
    SELECT f.file_key, f.name, f.project_name, f.last_modified
    FROM figma_files f
    WHERE EXISTS (
      SELECT 1 FROM design_sessions s WHERE s.file_key = f.file_key AND s.start_time >= ? AND s.start_time < ?
    )
    AND NOT EXISTS (
      SELECT 1 FROM design_sessions s WHERE s.file_key = f.file_key AND s.start_time >= ? AND s.start_time < ?
    )
    LIMIT 10
  `).all(prevWs.toISOString(), prevWe, ws, we);

  // Unresolved comments older than 48h
  const staleComments = db.prepare(`
    SELECT c.id, c.file_key, f.name as file_name, c.user_name, c.message, c.created_at
    FROM figma_comments c JOIN figma_files f ON c.file_key = f.file_key
    WHERE c.resolved_at IS NULL AND julianday('now') - julianday(c.created_at) > 2
    ORDER BY c.created_at ASC LIMIT 10
  `).all();

  // Top 3 most active files this week
  const topFiles = db.prepare(`
    SELECT v.file_key, f.name, f.project_name, COUNT(*) as version_count
    FROM figma_versions v JOIN figma_files f ON v.file_key = f.file_key
    WHERE v.created_at >= ? AND v.created_at < ?
    GROUP BY v.file_key ORDER BY version_count DESC LIMIT 3
  `).all(ws, we);

  const digest = {
    period: { start: ws, end: we },
    totalHours: Math.round((thisWeek.mins || 0) / 60 * 10) / 10,
    prevTotalHours: Math.round((lastWeek.mins || 0) / 60 * 10) / 10,
    totalSessions: thisWeek.sessions || 0,
    activeDesigners: thisWeek.designers || 0,
    designers,
    projects,
    newlyStale,
    staleComments,
    topFiles,
  };

  // Generate markdown
  if (req.query.format === 'markdown') {
    let md = `# Weekly Design Digest\n**${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${new Date(weekEnd - 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}**\n\n`;
    const delta = digest.totalHours - digest.prevTotalHours;
    md += `## Summary\n- **${digest.totalHours}h** total design time (${delta >= 0 ? '↑' : '↓'} ${Math.abs(delta).toFixed(1)}h vs last week)\n- **${digest.activeDesigners}** active designers · **${digest.totalSessions}** sessions\n\n`;
    if (designers.length) {
      md += `## Designer Hours\n| Designer | Hours | Δ |\n|----------|-------|---|\n`;
      for (const d of designers) md += `| ${d.designer_name} | ${(d.minutes / 60).toFixed(1)}h | ${d.delta >= 0 ? '↑' : '↓'}${Math.abs(d.delta / 60).toFixed(1)}h |\n`;
      md += '\n';
    }
    if (projects.length) {
      md += `## Projects\n`;
      for (const p of projects) md += `- **${p.project_name}**: ${(p.minutes / 60).toFixed(1)}h ${p.momentum === 'up' ? '🔥' : p.momentum === 'down' ? '⚠️' : '→'}\n`;
      md += '\n';
    }
    if (topFiles.length) {
      md += `## Most Active Files\n`;
      for (const f of topFiles) md += `- ${f.name} (${f.version_count} versions)\n`;
      md += '\n';
    }
    if (staleComments.length) {
      md += `## Needs Attention\n- ${staleComments.length} unresolved comments older than 48h\n`;
      if (newlyStale.length) md += `- ${newlyStale.length} files went quiet this week\n`;
    }
    return res.type('text/markdown').send(md);
  }

  // Cache the digest
  db.prepare(`INSERT INTO digests (type, period_start, period_end, data, created_at) VALUES (?, ?, ?, ?, datetime('now')) ON CONFLICT(type, period_start) DO UPDATE SET data = excluded.data, created_at = excluded.created_at`).run('weekly', ws, we, JSON.stringify(digest));

  res.json(digest);
});

app.get('/api/digest/history', (req, res) => {
  const db = getDb();
  const { type = 'weekly', limit = '8' } = req.query;
  const digests = db.prepare('SELECT * FROM digests WHERE type = ? ORDER BY period_start DESC LIMIT ?').all(type, parseInt(limit));
  res.json(digests.map(d => ({ ...d, data: JSON.parse(d.data) })));
});

// ──────────────────────────────────────────
// API: Workload & Burnout Detection (Module 4)
// ──────────────────────────────────────────

app.get('/api/workload/current', (req, res) => {
  const db = getDb();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();

  const designers = db.prepare('SELECT DISTINCT designer_name FROM design_sessions').all();
  const results = [];

  for (const { designer_name } of designers) {
    // This week
    const thisWeek = db.prepare(`
      SELECT SUM(duration_minutes) as mins, COUNT(DISTINCT project_name) as projects
      FROM design_sessions WHERE designer_name = ? AND start_time >= ?
    `).get(designer_name, weekAgo);

    // 4-week average per week
    const fourWeek = db.prepare(`
      SELECT SUM(duration_minutes) / 4.0 as avg_mins
      FROM design_sessions WHERE designer_name = ? AND start_time >= ? AND start_time < ?
    `).get(designer_name, fourWeeksAgo, weekAgo);

    // After-hours analysis (before 9am or after 6pm)
    const allSessions = db.prepare(`
      SELECT start_time, duration_minutes FROM design_sessions
      WHERE designer_name = ? AND start_time >= ?
    `).all(designer_name, weekAgo);

    let afterHoursMins = 0, weekendMins = 0, totalMins = 0;
    for (const s of allSessions) {
      const d = new Date(s.start_time);
      const hour = d.getHours();
      const day = d.getDay();
      totalMins += s.duration_minutes;
      if (hour < 9 || hour >= 18) afterHoursMins += s.duration_minutes;
      if (day === 0 || day === 6) weekendMins += s.duration_minutes;
    }

    const afterHoursPct = totalMins > 0 ? Math.round((afterHoursMins / totalMins) * 100) : 0;
    const weekendPct = totalMins > 0 ? Math.round((weekendMins / totalMins) * 100) : 0;
    const avgMins = fourWeek?.avg_mins || totalMins;
    const weekMins = thisWeek?.mins || 0;

    // Check consecutive high weeks from snapshots
    const recentSnapshots = db.prepare(`
      SELECT risk_level FROM workload_snapshots
      WHERE designer_name = ? ORDER BY week DESC LIMIT 3
    `).all(designer_name);
    const consecutiveHighWeeks = recentSnapshots.filter(s => s.risk_level !== 'green').length;

    // Compute workload score (0-100, higher = more overloaded)
    let score = 50;
    if (avgMins > 0) score = Math.min(100, Math.round((weekMins / avgMins) * 50));
    if (afterHoursPct > 20) score += 15;
    if (weekendPct > 10) score += 10;
    if ((thisWeek?.projects || 0) > 3) score += 5;
    score = Math.min(100, Math.max(0, score));

    // Risk level
    let risk = 'green';
    const overAvg = avgMins > 0 && weekMins > avgMins * 1.2;
    const suddenDrop = avgMins > 0 && weekMins < avgMins * 0.5;
    if (overAvg && consecutiveHighWeeks >= 2 && afterHoursPct > 30) risk = 'red';
    else if (suddenDrop && avgMins > 60) risk = 'red';
    else if (overAvg || afterHoursPct > 20 || consecutiveHighWeeks >= 1) risk = 'amber';

    results.push({
      designer_name,
      week_minutes: weekMins,
      avg_week_minutes: Math.round(avgMins),
      after_hours_pct: afterHoursPct,
      weekend_pct: weekendPct,
      projects: thisWeek?.projects || 0,
      workload_score: score,
      risk_level: risk,
    });
  }

  res.json(results.sort((a, b) => b.workload_score - a.workload_score));
});

app.get('/api/workload/history', (req, res) => {
  const db = getDb();
  const { designer, weeks = '12' } = req.query;
  if (!designer) return res.status(400).json({ error: 'designer param required' });

  const snapshots = db.prepare(`
    SELECT * FROM workload_snapshots
    WHERE designer_name = ? ORDER BY week DESC LIMIT ?
  `).all(designer, parseInt(weeks));

  res.json(snapshots.reverse());
});

app.get('/api/workload/balance', (req, res) => {
  const db = getDb();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();

  const thisWeek = db.prepare(`
    SELECT designer_name, SUM(duration_minutes) as minutes
    FROM design_sessions WHERE start_time >= ?
    GROUP BY designer_name ORDER BY minutes DESC
  `).all(weekAgo);

  const avgWeek = db.prepare(`
    SELECT designer_name, SUM(duration_minutes) / 4.0 as avg_minutes
    FROM design_sessions WHERE start_time >= ? AND start_time < ?
    GROUP BY designer_name
  `).all(fourWeeksAgo, weekAgo);
  const avgMap = Object.fromEntries(avgWeek.map(d => [d.designer_name, d.avg_minutes]));

  const teamAvg = thisWeek.length > 0 ? thisWeek.reduce((s, d) => s + d.minutes, 0) / thisWeek.length : 0;

  res.json({
    designers: thisWeek.map(d => ({
      designer_name: d.designer_name,
      this_week: d.minutes,
      personal_avg: Math.round(avgMap[d.designer_name] || 0),
    })),
    team_avg: Math.round(teamAvg),
  });
});

// ──────────────────────────────────────────
// API: Comment Threading (Module 7)
// ──────────────────────────────────────────

app.get('/api/comments/threads', (req, res) => {
  const db = getDb();
  const { file } = req.query;

  let sql = `
    SELECT c.*, f.name as file_name, f.project_name
    FROM figma_comments c
    LEFT JOIN figma_files f ON c.file_key = f.file_key
    WHERE c.parent_id IS NULL
  `;
  const params = [];
  if (file) { sql += ' AND c.file_key = ?'; params.push(file); }
  sql += ' ORDER BY c.created_at DESC LIMIT 100';

  const roots = db.prepare(sql).all(...params);

  // Fetch replies for each root
  const getReplies = db.prepare(`
    SELECT c.*, f.name as file_name FROM figma_comments c
    LEFT JOIN figma_files f ON c.file_key = f.file_key
    WHERE c.parent_id = ? ORDER BY c.created_at ASC
  `);

  const threads = roots.map(root => {
    const replies = getReplies.all(root.id);
    const lastActivity = replies.length > 0 ? replies[replies.length - 1].created_at : root.created_at;
    const daysSinceActivity = (Date.now() - new Date(lastActivity).getTime()) / 86400000;

    let status = 'active';
    if (root.resolved_at) status = 'resolved';
    else if (replies.length === 0 && daysSinceActivity > 1) status = 'awaiting';
    else if (daysSinceActivity > 7) status = 'stale';

    return { ...root, replies, reply_count: replies.length, status, last_activity: lastActivity };
  });

  res.json(threads);
});

app.get('/api/comments/threads/open', (req, res) => {
  const db = getDb();

  const roots = db.prepare(`
    SELECT c.*, f.name as file_name, f.project_name
    FROM figma_comments c
    LEFT JOIN figma_files f ON c.file_key = f.file_key
    WHERE c.parent_id IS NULL AND c.resolved_at IS NULL
    ORDER BY c.created_at ASC
    LIMIT 100
  `).all();

  const getReplies = db.prepare('SELECT * FROM figma_comments WHERE parent_id = ? ORDER BY created_at ASC');

  const threads = roots.map(root => {
    const replies = getReplies.all(root.id);
    const lastActivity = replies.length > 0 ? replies[replies.length - 1].created_at : root.created_at;
    const daysSinceActivity = (Date.now() - new Date(lastActivity).getTime()) / 86400000;

    let status = 'active';
    if (replies.length === 0 && daysSinceActivity > 1) status = 'awaiting';
    else if (daysSinceActivity > 7) status = 'stale';

    return { ...root, reply_count: replies.length, status, last_activity: lastActivity, days_since: Math.floor(daysSinceActivity) };
  }).sort((a, b) => a.days_since - b.days_since); // stalest first... actually reverse:
  // Sort: awaiting first, then stale, then active — and within each by staleness
  threads.sort((a, b) => {
    const order = { awaiting: 0, stale: 1, active: 2 };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    return b.days_since - a.days_since;
  });

  res.json(threads);
});

app.get('/api/comments/response-times', (req, res) => {
  const db = getDb();

  // For each designer who is the primary editor of files, compute avg response time
  // Primary editor = designer with most session hours on a file
  const primaryEditors = db.prepare(`
    SELECT file_key, designer_name, SUM(duration_minutes) as mins
    FROM design_sessions
    GROUP BY file_key, designer_name
  `).all();

  // Build map: file_key -> primary designer
  const filePrimary = {};
  for (const row of primaryEditors) {
    if (!filePrimary[row.file_key] || row.mins > filePrimary[row.file_key].mins) {
      filePrimary[row.file_key] = { designer: row.designer_name, mins: row.mins };
    }
  }

  // Get root comments on files with primary editors
  const rootComments = db.prepare(`
    SELECT c.id, c.file_key, c.created_at, c.user_name
    FROM figma_comments c
    WHERE c.parent_id IS NULL AND c.resolved_at IS NOT NULL
  `).all();

  // For each root comment, find the first reply
  const getFirstReply = db.prepare(`
    SELECT MIN(created_at) as first_reply FROM figma_comments WHERE parent_id = ?
  `);

  const responseTimes = {}; // designer -> [hours]

  for (const comment of rootComments) {
    const primary = filePrimary[comment.file_key];
    if (!primary) continue;

    const reply = getFirstReply.get(comment.id);
    if (!reply?.first_reply) continue;

    const hours = (new Date(reply.first_reply) - new Date(comment.created_at)) / 3600000;
    if (hours < 0 || hours > 720) continue; // ignore outliers > 30 days

    if (!responseTimes[primary.designer]) responseTimes[primary.designer] = [];
    responseTimes[primary.designer].push(hours);
  }

  const results = Object.entries(responseTimes).map(([designer, times]) => ({
    designer_name: designer,
    avg_hours: Math.round(times.reduce((s, t) => s + t, 0) / times.length),
    median_hours: Math.round(times.sort((a, b) => a - b)[Math.floor(times.length / 2)]),
    total_resolved: times.length,
  })).sort((a, b) => a.avg_hours - b.avg_hours);

  res.json(results);
});

app.get('/api/comments/review-status', (req, res) => {
  const db = getDb();

  const files = db.prepare(`
    SELECT c.file_key, f.name as file_name, f.project_name,
      COUNT(*) as total_comments,
      SUM(CASE WHEN c.resolved_at IS NOT NULL THEN 1 ELSE 0 END) as resolved,
      SUM(CASE WHEN c.resolved_at IS NULL THEN 1 ELSE 0 END) as unresolved,
      MAX(c.created_at) as last_comment
    FROM figma_comments c
    JOIN figma_files f ON c.file_key = f.file_key
    WHERE c.parent_id IS NULL
    GROUP BY c.file_key
    HAVING unresolved > 0
    ORDER BY unresolved DESC
    LIMIT 50
  `).all();

  // Count awaiting (no replies, >24h)
  for (const file of files) {
    const awaiting = db.prepare(`
      SELECT COUNT(*) as n FROM figma_comments c
      WHERE c.file_key = ? AND c.parent_id IS NULL AND c.resolved_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM figma_comments r WHERE r.parent_id = c.id)
        AND julianday('now') - julianday(c.created_at) > 1
    `).get(file.file_key);
    file.awaiting_response = awaiting.n;
  }

  res.json(files);
});

// ──────────────────────────────────────────
// API: Design System Governance (Module 5)
// ──────────────────────────────────────────

app.get('/api/components/governance', (req, res) => {
  const db = getDb();

  const components = db.prepare(`
    SELECT c.*,
      CAST((julianday('now') - julianday(COALESCE(c.updated_at, c.created_at))) AS INTEGER) as days_since_update
    FROM figma_components c
    ORDER BY c.name ASC
  `).all();

  // Check which component files have recent sessions
  const activeFiles = new Set(
    db.prepare(`SELECT DISTINCT file_key FROM design_sessions WHERE start_time >= datetime('now', '-90 days')`).all().map(r => r.file_key)
  );

  for (const c of components) {
    const days = c.days_since_update || 999;
    const hasDesc = !!c.description;
    const isActive = activeFiles.has(c.file_key);
    const isOrganized = !!(c.containing_frame && c.containing_frame.includes('/'));

    // Maturity assessment
    if (!isActive && days > 90) c.maturity = 'orphaned';
    else if (days <= 90) c.maturity = 'active';
    else if (hasDesc && days > 90) c.maturity = 'stable';
    else c.maturity = 'aging';

    c.documented = hasDesc;
    c.organized = isOrganized;
    c.health_score = Math.max(0, 100 - Math.floor(days * 0.5) + (hasDesc ? 15 : 0) + (isOrganized ? 10 : 0) + (isActive ? 10 : 0));
    c.health_score = Math.min(100, c.health_score);
  }

  // Naming patterns
  const nameGroups = {};
  for (const c of components) {
    // Extract naming convention: split by / or - or camelCase
    const parts = c.name.split(/[\/\-_]/).filter(Boolean);
    const prefix = parts[0]?.toLowerCase() || 'other';
    if (!nameGroups[prefix]) nameGroups[prefix] = { count: 0, examples: [] };
    nameGroups[prefix].count++;
    if (nameGroups[prefix].examples.length < 3) nameGroups[prefix].examples.push(c.name);
  }

  const total = components.length;
  const documented = components.filter(c => c.documented).length;

  res.json({
    components,
    summary: {
      total,
      active: components.filter(c => c.maturity === 'active').length,
      stable: components.filter(c => c.maturity === 'stable').length,
      aging: components.filter(c => c.maturity === 'aging').length,
      orphaned: components.filter(c => c.maturity === 'orphaned').length,
      documented,
      documentationCoverage: total ? Math.round((documented / total) * 100) : 0,
      avgHealthScore: total ? Math.round(components.reduce((s, c) => s + c.health_score, 0) / total) : 0,
    },
    nameGroups: Object.entries(nameGroups)
      .map(([prefix, data]) => ({ prefix, ...data }))
      .sort((a, b) => b.count - a.count),
  });
});

app.get('/api/components/coverage-trend', (req, res) => {
  const db = getDb();

  // Get doc coverage from recent sync_log entries
  const syncs = db.prepare(`
    SELECT details, completed_at FROM sync_log
    WHERE status = 'completed' ORDER BY completed_at DESC LIMIT 12
  `).all();

  // Also compute current coverage
  const total = db.prepare('SELECT COUNT(*) as n FROM figma_components').get().n;
  const withDesc = db.prepare(`SELECT COUNT(*) as n FROM figma_components WHERE description IS NOT NULL AND description != ''`).get().n;

  const trend = [{ date: new Date().toISOString(), coverage: total ? Math.round((withDesc / total) * 100) : 0 }];

  // If we have component snapshots, compute historical coverage
  const snapDates = db.prepare('SELECT DISTINCT synced_at FROM component_snapshots ORDER BY synced_at DESC LIMIT 12').all();
  for (const { synced_at } of snapDates) {
    const snapTotal = db.prepare('SELECT COUNT(*) as n FROM component_snapshots WHERE synced_at = ?').get(synced_at).n;
    const snapDesc = db.prepare(`SELECT COUNT(*) as n FROM component_snapshots WHERE synced_at = ? AND description IS NOT NULL AND description != ''`).get(synced_at).n;
    if (snapTotal > 0) trend.push({ date: synced_at, coverage: Math.round((snapDesc / snapTotal) * 100) });
  }

  res.json(trend.sort((a, b) => a.date.localeCompare(b.date)));
});

app.get('/api/components/changelog', (req, res) => {
  const db = getDb();

  // Compare latest two snapshot dates
  const dates = db.prepare('SELECT DISTINCT synced_at FROM component_snapshots ORDER BY synced_at DESC LIMIT 2').all();
  if (dates.length < 2) return res.json([]);

  const [latest, previous] = dates;

  const changes = db.prepare(`
    SELECT n.component_key, n.name as new_name, n.description as new_desc,
           o.name as old_name, o.description as old_desc
    FROM component_snapshots n
    JOIN component_snapshots o ON n.component_key = o.component_key AND o.synced_at = ?
    WHERE n.synced_at = ? AND (n.name != o.name OR COALESCE(n.description,'') != COALESCE(o.description,''))
  `).all(previous.synced_at, latest.synced_at);

  res.json(changes);
});

// ──────────────────────────────────────────
// API: Collaboration Network (Module 2)
// ──────────────────────────────────────────

app.get('/api/collaboration/network', (req, res) => {
  const db = getDb();

  // Get precomputed edges
  const edges = db.prepare('SELECT * FROM collaboration_edges ORDER BY co_work_score DESC LIMIT 50').all();

  // Get all designers as nodes
  const nodes = db.prepare(`
    SELECT designer_name, COUNT(DISTINCT file_key) as files, SUM(duration_minutes) as total_minutes
    FROM design_sessions
    GROUP BY designer_name
  `).all();

  res.json({ nodes, edges });
});

app.get('/api/collaboration/isolation', (req, res) => {
  const db = getDb();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Files only touched by one designer in last 30 days
  const isolated = db.prepare(`
    SELECT s.file_key, f.name as file_name, f.project_name,
      s.designer_name, SUM(s.duration_minutes) as minutes,
      COUNT(*) as sessions
    FROM design_sessions s
    JOIN figma_files f ON s.file_key = f.file_key
    WHERE s.start_time >= ?
    GROUP BY s.file_key
    HAVING COUNT(DISTINCT s.designer_name) = 1
    ORDER BY minutes DESC
    LIMIT 30
  `).all(thirtyDaysAgo);

  // Cross-pollination score: % of designers on 3+ projects
  const allDesigners = db.prepare('SELECT COUNT(DISTINCT designer_name) as n FROM design_sessions WHERE start_time >= ?').get(thirtyDaysAgo).n;
  const multiProject = db.prepare(`
    SELECT COUNT(*) as n FROM (
      SELECT designer_name FROM design_sessions WHERE start_time >= ?
      GROUP BY designer_name HAVING COUNT(DISTINCT project_name) >= 3
    )
  `).get(thirtyDaysAgo).n;

  res.json({
    isolated_files: isolated,
    cross_pollination: allDesigners > 0 ? Math.round((multiProject / allDesigners) * 100) : 0,
    total_designers: allDesigners,
    multi_project_designers: multiProject,
  });
});

app.get('/api/designers/:name/collaborators', (req, res) => {
  const db = getDb();
  const { name } = req.params;

  const collabs = db.prepare(`
    SELECT * FROM collaboration_edges
    WHERE designer_a = ? OR designer_b = ?
    ORDER BY co_work_score DESC LIMIT 10
  `).all(name, name);

  const results = collabs.map(e => ({
    collaborator: e.designer_a === name ? e.designer_b : e.designer_a,
    shared_files: e.shared_files,
    co_work_score: e.co_work_score,
    last_overlap: e.last_overlap,
  }));

  res.json(results);
});

// ──────────────────────────────────────────
// API: Client Reporting (Module 6)
// ──────────────────────────────────────────

app.get('/api/reports/project', (req, res) => {
  const db = getDb();
  const { name, from, to, format } = req.query;
  if (!name) return res.status(400).json({ error: 'name param required' });

  const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const toDate = to || new Date().toISOString();

  // Total hours + sessions
  const totals = db.prepare(`
    SELECT SUM(duration_minutes) as mins, COUNT(*) as sessions, COUNT(DISTINCT designer_name) as designers
    FROM design_sessions WHERE project_name = ? AND start_time >= ? AND start_time < ?
  `).get(name, fromDate, toDate);

  // Per designer
  const byDesigner = db.prepare(`
    SELECT designer_name, SUM(duration_minutes) as minutes, COUNT(*) as sessions
    FROM design_sessions WHERE project_name = ? AND start_time >= ? AND start_time < ?
    GROUP BY designer_name ORDER BY minutes DESC
  `).all(name, fromDate, toDate);

  // Weekly breakdown
  const weekly = db.prepare(`
    SELECT strftime('%Y-W%W', start_time) as week, SUM(duration_minutes) as minutes, COUNT(*) as sessions
    FROM design_sessions WHERE project_name = ? AND start_time >= ? AND start_time < ?
    GROUP BY week ORDER BY week
  `).all(name, fromDate, toDate);

  // Milestones (labeled versions)
  const milestones = db.prepare(`
    SELECT v.label, v.description, v.user_name, v.created_at, f.name as file_name
    FROM figma_versions v JOIN figma_files f ON v.file_key = f.file_key
    WHERE f.project_name = ? AND v.created_at >= ? AND v.created_at < ?
      AND v.label IS NOT NULL AND v.label != ''
    ORDER BY v.created_at DESC
  `).all(name, fromDate, toDate);

  // Comment activity
  const commentStats = db.prepare(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN c.resolved_at IS NOT NULL THEN 1 ELSE 0 END) as resolved,
      SUM(CASE WHEN c.resolved_at IS NULL THEN 1 ELSE 0 END) as open
    FROM figma_comments c JOIN figma_files f ON c.file_key = f.file_key
    WHERE f.project_name = ? AND c.created_at >= ? AND c.created_at < ?
  `).get(name, fromDate, toDate);

  // Files touched
  const files = db.prepare(`
    SELECT s.file_key, f.name, SUM(s.duration_minutes) as minutes,
      COUNT(DISTINCT v.id) as versions
    FROM design_sessions s
    JOIN figma_files f ON s.file_key = f.file_key
    LEFT JOIN figma_versions v ON v.file_key = s.file_key AND v.created_at >= ? AND v.created_at < ?
    WHERE s.project_name = ? AND s.start_time >= ? AND s.start_time < ?
    GROUP BY s.file_key ORDER BY minutes DESC
  `).all(fromDate, toDate, name, fromDate, toDate);

  const report = {
    project: name,
    period: { from: fromDate, to: toDate },
    totalHours: Math.round((totals.mins || 0) / 60 * 10) / 10,
    totalSessions: totals.sessions || 0,
    activeDesigners: totals.designers || 0,
    byDesigner,
    weekly,
    milestones,
    comments: commentStats,
    files,
  };

  if (format === 'markdown') {
    const fromStr = new Date(fromDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const toStr = new Date(toDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    let md = `# Project Report: ${name}\n**${fromStr} — ${toStr}**\n\n`;
    md += `## Summary\n- **${report.totalHours}h** design time across **${report.totalSessions}** sessions\n- **${report.activeDesigners}** contributing designers\n- **${commentStats.total || 0}** comments (${commentStats.resolved || 0} resolved, ${commentStats.open || 0} open)\n\n`;

    if (byDesigner.length) {
      md += `## Team Contributions\n| Designer | Hours | Sessions |\n|----------|-------|----------|\n`;
      for (const d of byDesigner) md += `| ${d.designer_name} | ${(d.minutes / 60).toFixed(1)}h | ${d.sessions} |\n`;
      md += '\n';
    }

    if (milestones.length) {
      md += `## Milestones\n`;
      for (const m of milestones) md += `- **${m.label}** — ${m.file_name} by ${m.user_name} (${new Date(m.created_at).toLocaleDateString()})\n`;
      md += '\n';
    }

    if (files.length) {
      md += `## Files\n| File | Hours | Versions |\n|------|-------|----------|\n`;
      for (const f of files.slice(0, 15)) md += `| ${f.name} | ${(f.minutes / 60).toFixed(1)}h | ${f.versions} |\n`;
      md += '\n';
    }

    return res.type('text/markdown').send(md);
  }

  res.json(report);
});

app.get('/api/reports/multi', (req, res) => {
  const db = getDb();
  const { projects, from, to } = req.query;
  if (!projects) return res.status(400).json({ error: 'projects param required (comma-separated)' });

  const projectList = projects.split(',').map(p => p.trim());
  const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const toDate = to || new Date().toISOString();

  const placeholders = projectList.map(() => '?').join(',');

  const totals = db.prepare(`
    SELECT project_name, SUM(duration_minutes) as mins, COUNT(*) as sessions, COUNT(DISTINCT designer_name) as designers
    FROM design_sessions WHERE project_name IN (${placeholders}) AND start_time >= ? AND start_time < ?
    GROUP BY project_name
  `).all(...projectList, fromDate, toDate);

  const grandTotal = db.prepare(`
    SELECT SUM(duration_minutes) as mins, COUNT(*) as sessions, COUNT(DISTINCT designer_name) as designers
    FROM design_sessions WHERE project_name IN (${placeholders}) AND start_time >= ? AND start_time < ?
  `).get(...projectList, fromDate, toDate);

  res.json({
    projects: totals,
    combined: {
      totalHours: Math.round((grandTotal.mins || 0) / 60 * 10) / 10,
      totalSessions: grandTotal.sessions || 0,
      activeDesigners: grandTotal.designers || 0,
    },
    period: { from: fromDate, to: toDate },
  });
});

// ──────────────────────────────────────────
// Webhook endpoint
// ──────────────────────────────────────────

app.post('/api/webhook', (req, res) => {
  const { event_type, file_key, timestamp } = req.body;
  console.log(`[webhook] ${event_type} for ${file_key} at ${timestamp}`);

  // Trigger targeted re-sync in background
  if (event_type === 'FILE_UPDATE' || event_type === 'FILE_VERSION_UPDATE') {
    // Could do a targeted file-only sync here
    console.log(`[webhook] Would refresh file ${file_key}`);
  }

  res.sendStatus(200);
});

// ──────────────────────────────────────────
// Initialize and start
// ──────────────────────────────────────────

// Export app for Vercel serverless
export { app };

// ──────────────────────────────────────────
// Local server mode (not Vercel)
// ──────────────────────────────────────────
if (!process.env.VERCEL) {
  const pat = getConfig('figma_pat') || process.env.FIGMA_PAT;
  if (pat) setToken(pat);

  const interval = parseInt(getConfig('sync_interval') || process.env.SYNC_INTERVAL || '15', 10);
  cron.schedule(`*/${interval} * * * *`, () => {
    console.log('[cron] Running scheduled sync');
    fullSync().catch(err => console.error('[cron] Sync failed:', err));
  });

  console.log(`[gravity] Sync scheduled every ${interval} minutes`);

  app.listen(PORT, () => {
    console.log(`[gravity] Server running at http://localhost:${PORT}`);
    console.log(`[gravity] Dashboard: http://localhost:${PORT}/index.html`);
  });
} else {
  // Vercel: just set the token
  const pat = getConfig('figma_pat') || process.env.FIGMA_PAT;
  if (pat) setToken(pat);
}
