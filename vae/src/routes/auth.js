const crypto = require('crypto');
const express = require('express');
const { db, getSettings, setSetting } = require('../db');
const { ValidationError } = require('../money');
const { nowIso, currentMonthKey } = require('../time');
const { ensureRoom, ACCENTS } = require('../rooms');
const { logActivity } = require('../log');
const auth = require('../auth');

const router = express.Router();

const userCount = () => db.prepare('SELECT COUNT(*) AS n FROM users').get().n;

router.get('/bootstrap', (req, res) => {
  const settings = getSettings();
  res.json({
    team_name: settings.team_name,
    needs_setup: userCount() === 0,
    join_required: settings.join_code !== '',
    signed_in: !!req.user
  });
});

router.post('/register', (req, res, next) => {
  try {
    const settings = getSettings();
    const first = userCount() === 0;

    // The site lives on a public URL, so after the first account a join code
    // keeps strangers out. It is generated once and any member can change it.
    if (!first) {
      if (!settings.join_code) throw new ValidationError('This team is not accepting new accounts right now.', 'join_code');
      if (String(req.body.join_code || '').trim() !== settings.join_code) {
        throw new ValidationError('That team code is not right — ask someone on the team for it.', 'join_code');
      }
    }

    const username = auth.normalizeUsername(req.body.username);
    const displayName = String(req.body.display_name || '').trim() || username;
    if (displayName.length > 40) throw new ValidationError('Display name is too long.', 'display_name');
    if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
      throw new ValidationError('That name is already taken.', 'username');
    }
    const hash = auth.hashPassword(String(req.body.password || ''));
    const accent = ACCENTS[userCount() % ACCENTS.length];
    const info = db.prepare(`INSERT INTO users (username, display_name, password_hash, accent, created_at)
                             VALUES (?, ?, ?, ?, ?)`)
      .run(username, displayName, hash, accent, nowIso());
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    ensureRoom(user);

    let joinCode = settings.join_code;
    if (first && !joinCode) {
      joinCode = crypto.randomBytes(4).toString('hex').toUpperCase();
      setSetting('join_code', joinCode);
    }

    const session = auth.createSession(user.id);
    auth.setSessionCookie(req, res, session.id, session.expires);
    logActivity({
      userId: user.id, action: 'created', entityType: 'member', entityId: user.id,
      summary: `${displayName} joined the team`, monthKey: currentMonthKey(settings.timezone)
    });
    res.status(201).json({ user: auth.publicUser(user), join_code: first ? joinCode : undefined });
  } catch (err) { next(err); }
});

router.post('/login', (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim().toLowerCase();
    const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    const ok = row && row.active && auth.verifyPassword(req.body.password, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'Wrong name or password.' });
    const session = auth.createSession(row.id);
    auth.setSessionCookie(req, res, session.id, session.expires);
    res.json({ user: auth.publicUser(row) });
  } catch (err) { next(err); }
});

router.post('/logout', (req, res) => {
  auth.destroySession(req.sessionId);
  auth.clearSessionCookie(res);
  res.json({ ok: true });
});

router.post('/password', auth.requireAuth, (req, res, next) => {
  try {
    if (!auth.verifyPassword(req.body.current_password, req.user.password_hash)) {
      throw new ValidationError('Your current password is not right.', 'current_password');
    }
    const hash = auth.hashPassword(String(req.body.new_password || ''));
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').run(req.user.id, req.sessionId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
  const settings = getSettings();
  res.json({
    user: auth.publicUser(req.user),
    settings: {
      team_name: settings.team_name,
      timezone: settings.timezone,
      robux_rate: Number(settings.robux_rate),
      conversion_enabled: settings.conversion_enabled === '1'
    },
    current_month: currentMonthKey(settings.timezone),
    server_time: nowIso()
  });
});

module.exports = router;
