const crypto = require('crypto');
const express = require('express');
const { db, getSettings, setSetting } = require('../db');
const { ValidationError } = require('../money');
const time = require('../time');
const rooms = require('../rooms');
const fin = require('../finance');
const { logActivity, listActivity } = require('../log');
const auth = require('../auth');
const seed = require('../seed');

const router = express.Router();
router.use(auth.requireAuth);

const isHex = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

/* Everyone on the team is a plain member — there is no owner and no admin. */

function memberCard(u, viewer) {
  const room = rooms.ensureRoom(u);
  const visible = rooms.canView(room, u, viewer);
  return {
    ...auth.publicUser(u),
    is_you: viewer.id === u.id,
    room: {
      room_name: visible ? room.room_name : null,
      visibility: room.visibility,
      edit_access: room.edit_access,
      updated_at: visible ? room.updated_at : null,
      accent: visible ? JSON.parse(room.theme).accent : u.accent,
      can_view: visible,
      can_edit: rooms.canEdit(room, u, viewer)
    }
  };
}

router.get('/members', (req, res, next) => {
  try {
    const settings = getSettings();
    const month = req.query.month ? time.requireMonthKey(req.query.month) : time.currentMonthKey(settings.timezone);
    const summary = fin.monthSummary(month, settings);
    const users = db.prepare('SELECT * FROM users ORDER BY display_name COLLATE NOCASE').all();
    res.json({
      month,
      members: users.map((u) => ({
        ...memberCard(u, req.user),
        stats: summary.members.find((m) => m.id === u.id) || null
      }))
    });
  } catch (err) { next(err); }
});

router.post('/members', (req, res, next) => {
  try {
    const username = auth.normalizeUsername(req.body.username);
    if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
      throw new ValidationError('That name is already taken.', 'username');
    }
    const displayName = String(req.body.display_name || '').trim() || username;
    let temp = String(req.body.password || '').trim();
    if (temp.length < 8) temp = crypto.randomBytes(6).toString('base64url') + '9a';
    const accent = isHex(req.body.accent)
      ? req.body.accent
      : rooms.ACCENTS[db.prepare('SELECT COUNT(*) n FROM users').get().n % rooms.ACCENTS.length];
    const info = db.prepare('INSERT INTO users (username, display_name, password_hash, accent, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(username, displayName, auth.hashPassword(temp), accent, time.nowIso());
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    rooms.ensureRoom(user);
    logActivity({
      userId: req.user.id, action: 'created', entityType: 'member', entityId: user.id,
      summary: `Added ${displayName} to the team`, monthKey: time.currentMonthKey(getSettings().timezone)
    });
    res.status(201).json({ member: auth.publicUser(user), temporary_password: temp });
  } catch (err) { next(err); }
});

router.put('/members/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!target) return res.status(404).json({ error: 'That member does not exist.' });
    if (req.user.id !== id) return res.status(403).json({ error: 'Only you can change your own name and colour.' });
    const displayName = String(req.body.display_name || target.display_name).trim();
    if (!displayName || displayName.length > 40) throw new ValidationError('Name must be 1-40 characters.', 'display_name');
    const accent = isHex(req.body.accent) ? req.body.accent : target.accent;
    db.prepare('UPDATE users SET display_name = ?, accent = ? WHERE id = ?').run(displayName, accent, id);
    res.json({ member: auth.publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) });
  } catch (err) { next(err); }
});

router.put('/members/:id/active', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!target) return res.status(404).json({ error: 'That member does not exist.' });
    const active = req.body.active ? 1 : 0;
    if (!active && db.prepare('SELECT COUNT(*) n FROM users WHERE active = 1').get().n <= 1) {
      throw new ValidationError('That is the last active member — the team cannot be empty.', 'active');
    }
    db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active, id);
    if (!active) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    logActivity({
      userId: req.user.id, action: 'edited', entityType: 'member', entityId: id,
      summary: `${active ? 'Brought back' : 'Removed'} ${target.display_name} (their payments stay in the history)`,
      monthKey: time.currentMonthKey(getSettings().timezone)
    });
    res.json({ member: auth.publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) });
  } catch (err) { next(err); }
});

router.put('/members/:id/password', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!target) return res.status(404).json({ error: 'That member does not exist.' });
    const temp = crypto.randomBytes(6).toString('base64url') + '9a';
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(auth.hashPassword(temp), id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    logActivity({
      userId: req.user.id, action: 'edited', entityType: 'member', entityId: id,
      summary: `Reset the password for ${target.display_name}`, monthKey: time.currentMonthKey(getSettings().timezone)
    });
    res.json({ temporary_password: temp });
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ rooms */

function roomPayload(owner, viewer, month) {
  const row = rooms.ensureRoom(owner);
  if (!rooms.canView(row, owner, viewer)) return null;
  const settings = getSettings();
  const monthKey = month || time.currentMonthKey(settings.timezone);
  const summary = fin.monthSummary(monthKey, settings);
  return {
    ...rooms.shapeRoom(row, owner, viewer),
    month: monthKey,
    month_label: summary.label,
    stats: summary.members.find((m) => m.id === owner.id) || null,
    activity: listActivity({ limit: 6, userId: owner.id })
  };
}

router.get('/rooms/:username', (req, res, next) => {
  try {
    const owner = db.prepare('SELECT * FROM users WHERE username = ?').get(String(req.params.username || '').toLowerCase());
    if (!owner) return res.status(404).json({ error: 'No member with that name.' });
    const payload = roomPayload(owner, req.user, req.query.month ? time.requireMonthKey(req.query.month) : null);
    if (!payload) return res.status(403).json({ error: 'This room is private.', private: true });
    res.json({ room: payload });
  } catch (err) { next(err); }
});

router.put('/rooms/:username', (req, res, next) => {
  try {
    const owner = db.prepare('SELECT * FROM users WHERE username = ?').get(String(req.params.username || '').toLowerCase());
    if (!owner) return res.status(404).json({ error: 'No member with that name.' });
    const row = rooms.ensureRoom(owner);
    if (!rooms.canEdit(row, owner, req.user)) return res.status(403).json({ error: 'You do not have edit access to this room.' });
    const roomName = String(req.body.room_name ?? row.room_name).trim().slice(0, 48) || `${owner.display_name}'s Room`;
    const theme = rooms.sanitizeTheme(req.body.theme, owner.display_name, owner.accent);
    let visibility = row.visibility;
    let editAccess = row.edit_access;
    if (req.user.id === owner.id) {
      if (req.body.visibility) visibility = req.body.visibility === 'private' ? 'private' : 'team';
      if (req.body.edit_access) editAccess = req.body.edit_access === 'team' ? 'team' : 'owner';
    }
    const now = time.nowIso();
    db.prepare('UPDATE rooms SET room_name = ?, visibility = ?, edit_access = ?, theme = ?, updated_at = ? WHERE user_id = ?')
      .run(roomName, visibility, editAccess, JSON.stringify(theme), now, owner.id);
    res.json({ room: roomPayload(owner, req.user, null), saved_at: now });
  } catch (err) { next(err); }
});

router.post('/rooms/:username/reset', (req, res, next) => {
  try {
    const owner = db.prepare('SELECT * FROM users WHERE username = ?').get(String(req.params.username || '').toLowerCase());
    if (!owner) return res.status(404).json({ error: 'No member with that name.' });
    const row = rooms.ensureRoom(owner);
    if (!rooms.canEdit(row, owner, req.user)) return res.status(403).json({ error: 'You do not have edit access to this room.' });
    const theme = rooms.sanitizeTheme(rooms.defaultTheme(owner.display_name, owner.accent), owner.display_name, owner.accent);
    const now = time.nowIso();
    db.prepare('UPDATE rooms SET room_name = ?, theme = ?, updated_at = ? WHERE user_id = ?')
      .run(`${owner.display_name}'s Room`, JSON.stringify(theme), now, owner.id);
    res.json({ room: roomPayload(owner, req.user, null), saved_at: now });
  } catch (err) { next(err); }
});

/* --------------------------------------------------------------- settings */

const shapeSettings = (s) => ({
  team_name: s.team_name,
  timezone: s.timezone,
  robux_rate: Number(s.robux_rate),
  conversion_enabled: s.conversion_enabled === '1',
  join_code: s.join_code
});

router.get('/settings', (req, res) => {
  const s = getSettings();
  res.json({
    settings: shapeSettings(s),
    sample_loaded: seed.sampleExists(),
    current_month: time.currentMonthKey(s.timezone),
    today: time.todayIn(s.timezone)
  });
});

router.put('/settings', (req, res, next) => {
  try {
    const b = req.body;
    const changed = [];
    if (b.team_name !== undefined) {
      const name = String(b.team_name).trim().slice(0, 40);
      if (!name) throw new ValidationError('Team name cannot be empty.', 'team_name');
      setSetting('team_name', name); changed.push('team name');
    }
    if (b.timezone !== undefined) {
      if (!time.validTimezone(b.timezone)) throw new ValidationError('That is not a timezone this server knows.', 'timezone');
      setSetting('timezone', b.timezone); changed.push('timezone');
    }
    if (b.robux_rate !== undefined) {
      const rate = Number(b.robux_rate);
      if (!Number.isFinite(rate) || rate <= 0 || rate > 1) throw new ValidationError('Enter a rate between 0 and 1 (USD for 1 Robux).', 'robux_rate');
      setSetting('robux_rate', String(rate)); changed.push('conversion rate');
    }
    if (b.conversion_enabled !== undefined) { setSetting('conversion_enabled', b.conversion_enabled ? '1' : '0'); changed.push('combined total'); }
    if (b.join_code !== undefined) { setSetting('join_code', String(b.join_code).trim().slice(0, 40)); changed.push('team code'); }
    const s = getSettings();
    if (changed.length) {
      logActivity({
        userId: req.user.id, action: 'edited', entityType: 'settings', entityId: null,
        summary: `Changed the team settings (${changed.join(', ')})`, monthKey: time.currentMonthKey(s.timezone)
      });
    }
    res.json({ settings: shapeSettings(s), saved_at: time.nowIso() });
  } catch (err) { next(err); }
});

router.post('/settings/new-code', (req, res, next) => {
  try {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    setSetting('join_code', code);
    logActivity({
      userId: req.user.id, action: 'edited', entityType: 'settings', entityId: null,
      summary: 'Made a new team code', monthKey: time.currentMonthKey(getSettings().timezone)
    });
    res.json({ join_code: code, saved_at: time.nowIso() });
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------ sample data */

router.post('/sample', (req, res, next) => {
  try {
    if (seed.sampleExists()) return res.status(409).json({ error: 'The example data is already here.' });
    res.json({ ok: true, loaded: seed.loadSampleData(req.user) });
  } catch (err) { next(err); }
});

router.delete('/sample', (req, res, next) => {
  try {
    res.json({ ok: true, removed: seed.clearSampleData(req.user) });
  } catch (err) { next(err); }
});

module.exports = router;
