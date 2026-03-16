import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getDb, getConfig, setConfig, getLastSync } from '../server/db.js';
import { setToken, testConnection } from '../server/figma-client.js';
import { fullSync, isSyncing } from '../server/sync-engine.js';
import { requireAuth, createSession, getSession, deleteSession, googleCallback, figmaCallback } from '../server/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json());
app.use(cookieParser());

// ── Auth routes (public) ──
app.get('/api/auth/status', (req, res) => {
  const authEnabled = !!(process.env.GOOGLE_CLIENT_ID || process.env.FIGMA_CLIENT_ID);
  const token = req.cookies?.gravity_session || req.headers['x-auth-token'];
  const session = getSession(token);
  res.json({
    auth_enabled: authEnabled,
    logged_in: !!session,
    user: session ? { name: session.user_name, email: session.user_email, avatar: session.user_avatar, provider: session.provider } : null,
    providers: { google: !!process.env.GOOGLE_CLIENT_ID, figma: !!process.env.FIGMA_CLIENT_ID },
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
    const user = await googleCallback(req.query.code, `${base}/api/auth/google/callback`);
    const token = createSession('google', user);
    res.cookie('gravity_session', token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.redirect('/');
  } catch (e) {
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
    const user = await figmaCallback(req.query.code, `${base}/api/auth/figma/callback`);
    const token = createSession('figma', user);
    res.cookie('gravity_session', token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.redirect('/');
  } catch (e) {
    res.redirect('/?auth_error=' + encodeURIComponent(e.message));
  }
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies?.gravity_session;
  if (token) deleteSession(token);
  res.clearCookie('gravity_session');
  res.json({ ok: true });
});

// ── Auth middleware for protected routes ──
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/') || req.path === '/cron' || req.path === '/webhook') return next();
  requireAuth(req, res, next);
});

// ── Status ──
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

// ── Config ──
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
  if (figma_pat) { setConfig('figma_pat', figma_pat); setToken(figma_pat); }
  if (sync_interval) setConfig('sync_interval', sync_interval);
  const teamId = figma_team_id || getConfig('figma_team_id') || process.env.FIGMA_TEAM_ID;
  if (teamId && (figma_pat || getConfig('figma_pat') || process.env.FIGMA_PAT)) {
    const result = await testConnection(teamId);
    return res.json({ saved: true, connection: result });
  }
  res.json({ saved: true });
});

// ── Sync ──
app.post('/api/sync', async (req, res) => {
  if (isSyncing()) return res.json({ status: 'already_running' });
  fullSync().catch(err => console.error('[api] Sync error:', err));
  res.json({ status: 'started' });
});

// ── Cron endpoint (Vercel Cron) ──
app.get('/api/cron', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (isSyncing()) return res.json({ status: 'already_running' });
  try {
    await fullSync();
    res.json({ status: 'completed' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ── Sessions ──
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
  const byDesigner = db.prepare(`SELECT designer_name, SUM(duration_minutes) as total_minutes, COUNT(*) as session_count, AVG(duration_minutes) as avg_session_min, COUNT(DISTINCT file_key) as files_touched FROM design_sessions WHERE start_time >= ? GROUP BY designer_name ORDER BY total_minutes DESC`).all(cutoff);
  const total = db.prepare(`SELECT SUM(duration_minutes) as total_minutes, COUNT(*) as session_count, COUNT(DISTINCT designer_name) as active_designers FROM design_sessions WHERE start_time >= ?`).get(cutoff);
  const byDay = db.prepare(`SELECT DATE(start_time) as day, SUM(duration_minutes) as minutes, COUNT(*) as sessions FROM design_sessions WHERE start_time >= ? GROUP BY DATE(start_time) ORDER BY day`).all(cutoff);
  res.json({ period, cutoff, total, byDesigner, byDay });
});

// ── Designers ──
app.get('/api/designers', (req, res) => {
  const db = getDb();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const designers = db.prepare(`SELECT designer_name, designer_id, SUM(duration_minutes) as total_minutes, COUNT(*) as total_sessions, COUNT(DISTINCT file_key) as total_files, COUNT(DISTINCT project_name) as total_projects, MAX(end_time) as last_active, AVG(duration_minutes) as avg_session_min FROM design_sessions GROUP BY designer_name ORDER BY total_minutes DESC`).all();
  for (const d of designers) {
    const week = db.prepare(`SELECT SUM(duration_minutes) as week_min FROM design_sessions WHERE designer_name = ? AND start_time >= ?`).get(d.designer_name, weekAgo);
    d.week_minutes = week?.week_min || 0;
    const month = db.prepare(`SELECT SUM(duration_minutes) as month_min FROM design_sessions WHERE designer_name = ? AND start_time >= ?`).get(d.designer_name, monthAgo);
    d.month_minutes = month?.month_min || 0;
    const days = db.prepare(`SELECT COUNT(DISTINCT DATE(start_time)) as days FROM design_sessions WHERE designer_name = ? AND start_time >= ?`).get(d.designer_name, monthAgo);
    d.active_days_month = days?.days || 0;
  }
  res.json(designers);
});

app.get('/api/designers/:name/pattern', (req, res) => {
  const db = getDb();
  const { name } = req.params;
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sessions = db.prepare(`SELECT start_time, duration_minutes FROM design_sessions WHERE designer_name = ? AND start_time >= ?`).all(name, monthAgo);
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const s of sessions) { const d = new Date(s.start_time); grid[d.getDay()][d.getHours()] += s.duration_minutes; }
  res.json({ designer: name, period: '30d', grid });
});

// ── Projects ──
app.get('/api/projects', (req, res) => {
  const db = getDb();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const projects = db.prepare(`SELECT project_name, COUNT(*) as file_count, MAX(last_modified) as last_activity FROM figma_files WHERE project_name IS NOT NULL GROUP BY project_name ORDER BY last_activity DESC`).all();
  for (const p of projects) {
    const hours = db.prepare(`SELECT SUM(duration_minutes) as mins FROM design_sessions WHERE project_name = ? AND start_time >= ?`).get(p.project_name, weekAgo);
    p.week_minutes = hours?.mins || 0;
    const comments = db.prepare(`SELECT COUNT(*) as n FROM figma_comments c JOIN figma_files f ON c.file_key = f.file_key WHERE f.project_name = ? AND c.resolved_at IS NULL`).get(p.project_name);
    p.unresolved_comments = comments?.n || 0;
  }
  res.json(projects);
});

// ── Comments ──
app.get('/api/comments', (req, res) => {
  const { unresolved, file, limit = '50' } = req.query;
  const db = getDb();
  let sql = `SELECT c.*, f.name as file_name, f.project_name FROM figma_comments c LEFT JOIN figma_files f ON c.file_key = f.file_key WHERE 1=1`;
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
  const avgResolution = db.prepare(`SELECT AVG((julianday(resolved_at) - julianday(created_at)) * 24) as avg_hours FROM figma_comments WHERE resolved_at IS NOT NULL AND created_at >= ?`).get(monthAgo);
  const byWeek = db.prepare(`SELECT strftime('%Y-W%W', created_at) as week, COUNT(*) as comments FROM figma_comments WHERE created_at >= ? GROUP BY week ORDER BY week`).all(monthAgo);
  res.json({ total, unresolved, avgResolutionHours: Math.round(avgResolution?.avg_hours || 0), byWeek });
});

// ── Components ──
app.get('/api/components', (req, res) => {
  const db = getDb();
  const components = db.prepare(`SELECT *, CAST((julianday('now') - julianday(COALESCE(updated_at, created_at))) AS INTEGER) as days_since_update FROM figma_components ORDER BY updated_at DESC`).all();
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
    summary: { total, healthy, aging: components.filter(c => c.health === 'aging').length, stale: components.filter(c => c.health === 'stale').length, descriptionCoverage: total ? Math.round((withDesc / total) * 100) : 0, avgHealthScore: total ? Math.round(components.reduce((s, c) => s + c.health_score, 0) / total) : 0 },
  });
});

// ── Dashboard ──
app.get('/api/dashboard', (req, res) => {
  const db = getDb();
  const files = db.prepare('SELECT COUNT(*) as n FROM figma_files').get().n;
  const activeFiles = db.prepare(`SELECT COUNT(*) as n FROM figma_files WHERE last_modified >= datetime('now', '-90 days')`).get().n;
  const designers = db.prepare('SELECT COUNT(DISTINCT designer_name) as n FROM design_sessions').get().n;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const weekHours = db.prepare(`SELECT SUM(duration_minutes) as mins FROM design_sessions WHERE start_time >= ?`).get(weekAgo);
  const activeToday = db.prepare(`SELECT COUNT(DISTINCT designer_name) as n FROM design_sessions WHERE DATE(start_time) = DATE('now')`).get().n;
  const projects = db.prepare('SELECT COUNT(DISTINCT project_name) as n FROM figma_files WHERE project_name IS NOT NULL').get().n;
  const timeline = db.prepare(`SELECT strftime('%Y-%m', start_time) as month, SUM(duration_minutes) as minutes, COUNT(*) as sessions FROM design_sessions GROUP BY month ORDER BY month`).all();
  const recentSessions = db.prepare(`SELECT designer_name, file_name, project_name, start_time, duration_minutes, confidence FROM design_sessions ORDER BY start_time DESC LIMIT 50`).all();
  res.json({
    summary: { total_projects: projects, total_files: files, active_files: activeFiles, stale_files: files - activeFiles, total_designers: designers, design_hours_week: Math.round((weekHours?.mins || 0) / 60), active_designers_today: activeToday },
    timeline,
    recent_sessions: recentSessions,
  });
});

// ── Stale Alerts ──
app.get('/api/alerts/stale', (req, res) => {
  const db = getDb();
  const staleFiles = db.prepare(`SELECT f.file_key, f.name, f.project_name, f.last_modified, CAST((julianday('now') - julianday(f.last_modified)) AS INTEGER) as days_stale FROM figma_files f WHERE julianday('now') - julianday(f.last_modified) > 14 ORDER BY f.last_modified ASC LIMIT 50`).all();
  const unresolvedComments = db.prepare(`SELECT c.file_key, f.name as file_name, f.project_name, COUNT(*) as count, MIN(c.created_at) as oldest FROM figma_comments c JOIN figma_files f ON c.file_key = f.file_key WHERE c.resolved_at IS NULL AND julianday('now') - julianday(c.created_at) > 2 GROUP BY c.file_key ORDER BY count DESC LIMIT 20`).all();
  const inactiveDesigners = db.prepare(`SELECT designer_name, MAX(end_time) as last_active, CAST((julianday('now') - julianday(MAX(end_time))) AS INTEGER) as days_inactive FROM design_sessions GROUP BY designer_name HAVING julianday('now') - julianday(MAX(end_time)) > 7 ORDER BY last_active ASC`).all();
  res.json({ staleFiles, unresolvedComments, inactiveDesigners });
});

// ── Designer Profile ──
app.get('/api/designers/:name/profile', (req, res) => {
  const db = getDb();
  const { name } = req.params;
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const stats = db.prepare(`SELECT SUM(duration_minutes) as total_minutes, COUNT(*) as total_sessions, COUNT(DISTINCT file_key) as total_files, COUNT(DISTINCT project_name) as total_projects, AVG(duration_minutes) as avg_session_min, MIN(start_time) as first_active, MAX(end_time) as last_active FROM design_sessions WHERE designer_name = ?`).get(name);
  const sessions = db.prepare(`SELECT file_name, project_name, start_time, end_time, duration_minutes, version_count, confidence FROM design_sessions WHERE designer_name = ? AND start_time >= ? ORDER BY start_time DESC`).all(name, monthAgo);
  const dailyHours = db.prepare(`SELECT DATE(start_time) as day, SUM(duration_minutes) as minutes, COUNT(*) as sessions FROM design_sessions WHERE designer_name = ? AND start_time >= ? GROUP BY DATE(start_time) ORDER BY day`).all(name, monthAgo);
  const topProjects = db.prepare(`SELECT project_name, SUM(duration_minutes) as minutes, COUNT(*) as sessions FROM design_sessions WHERE designer_name = ? AND start_time >= ? GROUP BY project_name ORDER BY minutes DESC LIMIT 10`).all(name, monthAgo);
  const allSessions = db.prepare(`SELECT start_time, duration_minutes FROM design_sessions WHERE designer_name = ? AND start_time >= ?`).all(name, monthAgo);
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const s of allSessions) { const d = new Date(s.start_time); grid[d.getDay()][d.getHours()] += s.duration_minutes; }
  res.json({ designer: name, stats, sessions, dailyHours, topProjects, heatmap: grid });
});

// ── Project Velocity ──
app.get('/api/projects/:name/velocity', (req, res) => {
  const db = getDb();
  const { name } = req.params;
  const weekly = db.prepare(`SELECT strftime('%Y-W%W', start_time) as week, SUM(duration_minutes) as minutes, COUNT(*) as sessions, COUNT(DISTINCT designer_name) as designers FROM design_sessions WHERE project_name = ? AND start_time >= datetime('now', '-84 days') GROUP BY week ORDER BY week`).all(name);
  const daily = db.prepare(`SELECT DATE(start_time) as day, SUM(duration_minutes) as minutes, COUNT(*) as sessions FROM design_sessions WHERE project_name = ? AND start_time >= datetime('now', '-30 days') GROUP BY day ORDER BY day`).all(name);
  const contributors = db.prepare(`SELECT designer_name, SUM(duration_minutes) as minutes, COUNT(*) as sessions, MAX(end_time) as last_active FROM design_sessions WHERE project_name = ? GROUP BY designer_name ORDER BY minutes DESC`).all(name);
  res.json({ project: name, weekly, daily, contributors });
});

// ── Webhook ──
app.post('/api/webhook', (req, res) => {
  const { event_type, file_key, timestamp } = req.body;
  console.log(`[webhook] ${event_type} for ${file_key} at ${timestamp}`);
  res.sendStatus(200);
});

// Initialize Figma token
const pat = getConfig('figma_pat') || process.env.FIGMA_PAT;
if (pat) setToken(pat);

export default app;
