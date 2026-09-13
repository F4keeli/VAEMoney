const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db } = require('./db');
const { ValidationError } = require('./money');
const { nowIso } = require('./time');

const COOKIE = 'vae_sid';
const SESSION_DAYS = 30;
const BCRYPT_ROUNDS = 12;

function hashPassword(plain) {
  if (typeof plain !== 'string' || plain.length < 8) {
    throw new ValidationError('Password must be at least 8 characters.', 'password');
  }
  if (plain.length > 200) throw new ValidationError('Password is too long.', 'password');
  return bcrypt.hashSync(plain, BCRYPT_ROUNDS);
}

function verifyPassword(plain, hash) {
  try { return bcrypt.compareSync(String(plain || ''), String(hash || '')); }
  catch (_) { return false; }
}

function normalizeUsername(raw) {
  const u = String(raw || '').trim().toLowerCase();
  if (!/^[a-z0-9_.-]{3,24}$/.test(u)) {
    throw new ValidationError('Username must be 3-24 characters: letters, numbers, dot, dash or underscore.', 'username');
  }
  return u;
}

function createSession(userId) {
  const id = crypto.randomBytes(32).toString('hex');
  const created = new Date();
  const expires = new Date(created.getTime() + SESSION_DAYS * 864e5);
  db.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(id, userId, created.toISOString(), expires.toISOString());
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(created.toISOString(), userId);
  return { id, expires };
}

function destroySession(id) {
  if (id) db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

function purgeExpiredSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(nowIso());
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

// Secure only when the request really arrived over HTTPS, so the same build
// works on http://localhost and behind a hosting provider's TLS proxy.
function setSessionCookie(req, res, id, expires) {
  const secure = req.secure || process.env.VAE_SECURE_COOKIES === '1';
  res.cookie(COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    expires,
    path: '/'
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

const publicUser = (u) => u && ({
  id: u.id,
  username: u.username,
  display_name: u.display_name,
  accent: u.accent,
  active: !!u.active,
  is_sample: !!u.is_sample,
  created_at: u.created_at
});

// Attaches req.user when a live session cookie is present.
function attachUser(req, res, next) {
  const sid = readCookie(req, COOKIE);
  req.sessionId = sid;
  req.user = null;
  if (sid) {
    const row = db.prepare(`
      SELECT u.*, s.expires_at AS session_expires
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > ? AND u.active = 1
    `).get(sid, nowIso());
    if (row) req.user = row;
    else clearSessionCookie(res);
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in to continue.' });
  next();
}

// Blocks cross-site form posts: browsers cannot set this header cross-origin without a CORS preflight.
function requireAppHeader(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-vae-app') !== '1') return res.status(403).json({ error: 'Request blocked: missing app header.' });
  next();
}

module.exports = {
  COOKIE, hashPassword, verifyPassword, normalizeUsername, createSession, destroySession,
  purgeExpiredSessions, setSessionCookie, clearSessionCookie, attachUser, requireAuth,
  requireAppHeader, publicUser, readCookie
};
