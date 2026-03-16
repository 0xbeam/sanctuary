import crypto from 'crypto';
import { getDb } from './db.js';

// ── Session management ──

export function createSession(provider, user) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
  getDb().prepare(`
    INSERT INTO auth_sessions (token, provider, user_email, user_name, user_avatar, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(token, provider, user.email || null, user.name, user.avatar || null, now, expires);
  return token;
}

export function getSession(token) {
  if (!token) return null;
  const session = getDb().prepare(
    'SELECT * FROM auth_sessions WHERE token = ? AND expires_at > datetime(\'now\')'
  ).get(token);
  return session || null;
}

export function deleteSession(token) {
  getDb().prepare('DELETE FROM auth_sessions WHERE token = ?').run(token);
}

// ── Auth middleware ──

export function requireAuth(req, res, next) {
  // Skip auth if not configured
  if (!process.env.GOOGLE_CLIENT_ID && !process.env.FIGMA_CLIENT_ID) {
    return next();
  }

  const token = req.cookies?.gravity_session || req.headers['x-auth-token'];
  const session = getSession(token);

  if (!session) {
    return res.status(401).json({ error: 'unauthorized', login_required: true });
  }

  req.user = session;
  next();
}

// ── Google OAuth ──

export async function googleCallback(code, redirectUri) {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Google token exchange failed: ${err}`);
  }

  const tokens = await tokenRes.json();
  const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userRes.ok) throw new Error('Failed to fetch Google user info');
  const user = await userRes.json();

  return {
    email: user.email,
    name: user.name || user.email,
    avatar: user.picture || null,
  };
}

// ── Figma OAuth ──

export async function figmaCallback(code, redirectUri) {
  const tokenRes = await fetch('https://www.figma.com/api/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.FIGMA_CLIENT_ID,
      client_secret: process.env.FIGMA_CLIENT_SECRET,
      redirect_uri: redirectUri,
      code,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Figma token exchange failed: ${err}`);
  }

  const tokens = await tokenRes.json();
  const userRes = await fetch('https://api.figma.com/v1/me', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userRes.ok) throw new Error('Failed to fetch Figma user info');
  const user = await userRes.json();

  return {
    email: user.email,
    name: user.handle || user.email,
    avatar: user.img_url || null,
  };
}
