const crypto = require('crypto');
const express = require('express');
const { db, getSettings } = require('../db');
const money = require('../money');
const { ValidationError, parsePair, toBasisPoints, applyPercentPair, formatPair, formatBasisPoints } = money;
const time = require('../time');
const fin = require('../finance');
const { logActivity, recordRevision, listRevisions, listActivity } = require('../log');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

const str = (v, max, field, { required = false, label = 'This field' } = {}) => {
  const s = String(v === null || v === undefined ? '' : v).trim();
  if (required && !s) throw new ValidationError(`${label} is required.`, field);
  if (s.length > max) throw new ValidationError(`${label} must be under ${max} characters.`, field);
  return s;
};

function memberOrNull(value) {
  if (value === null || value === undefined || value === '' || value === 'team') return null;
  const id = Number(value);
  if (!id || !db.prepare('SELECT id FROM users WHERE id = ?').get(id)) {
    throw new ValidationError('That team member does not exist.', 'member_id');
  }
  return id;
}

function readEntry(body) {
  const kind = String(body.kind || '').toLowerCase();
  if (!['in', 'out'].includes(kind)) throw new ValidationError('Choose money in or money out.', 'kind');
  const occurredOn = time.requireDate(body.occurred_on, 'occurred_on');
  const amount = parsePair(body.usd, body.robux);
  return {
    kind,
    title: str(body.title, 80, 'title', { required: true, label: 'Title' }),
    usd_cents: amount.usd_cents,
    robux: amount.robux,
    category: str(body.category, 40, 'category') || 'Other',
    occurred_on: occurredOn,
    month_key: time.monthKeyOf(occurredOn),
    note: str(body.note, 1000, 'note'),
    member_id: memberOrNull(body.member_id)
  };
}

const ENTRY_FIELDS = [
  { key: 'title', label: 'Title' },
  { key: 'kind', label: 'Direction' },
  { key: 'usd_cents', label: 'USD amount', type: 'usd' },
  { key: 'robux', label: 'Robux amount', type: 'robux' },
  { key: 'category', label: 'Category' },
  { key: 'occurred_on', label: 'Date' },
  { key: 'member_id', label: 'Whose money' },
  { key: 'note', label: 'Note' }
];

const describe = (e) => `${e.title} (${formatPair(e.amount)})`;
const who = (e) => (e.member_name ? `for ${e.member_name}` : 'for the team');

/* ---------------------------------------------------------------- entries */

router.get('/entries', (req, res, next) => {
  try {
    const q = req.query;
    res.json({
      entries: fin.listEntries({
        month: q.month ? time.requireMonthKey(q.month) : null,
        kind: ['in', 'out'].includes(q.kind) ? q.kind : null,
        memberId: q.member_id || null,
        search: q.q ? String(q.q).slice(0, 60) : null
      })
    });
  } catch (err) { next(err); }
});

router.get('/entries/:id', (req, res, next) => {
  try {
    const entry = fin.getEntry(Number(req.params.id));
    if (!entry) return res.status(404).json({ error: 'That payment is no longer here.' });
    res.json({ entry, revisions: listRevisions('entry', entry.id) });
  } catch (err) { next(err); }
});

router.post('/entries', (req, res, next) => {
  try {
    const p = readEntry(req.body);
    const now = time.nowIso();
    const info = db.prepare(`
      INSERT INTO entries (kind, title, usd_cents, robux, category, occurred_on, month_key, note, member_id,
                           created_by, created_at, updated_by, updated_at)
      VALUES (@kind, @title, @usd_cents, @robux, @category, @occurred_on, @month_key, @note, @member_id,
              @uid, @now, @uid, @now)
    `).run({ ...p, uid: req.user.id, now });
    const entry = fin.getEntry(info.lastInsertRowid);
    logActivity({
      userId: req.user.id, action: 'created', entityType: 'entry', entityId: entry.id,
      summary: `Added ${entry.kind === 'in' ? 'money in' : 'money out'} — ${describe(entry)} ${who(entry)}`,
      monthKey: entry.month_key
    });
    res.status(201).json({ entry });
  } catch (err) { next(err); }
});

router.put('/entries/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const before = fin.getEntry(id);
    if (!before) return res.status(404).json({ error: 'That payment is no longer here.' });
    const p = readEntry(req.body);
    const now = time.nowIso();
    db.prepare(`
      UPDATE entries SET kind=@kind, title=@title, usd_cents=@usd_cents, robux=@robux, category=@category,
        occurred_on=@occurred_on, month_key=@month_key, note=@note, member_id=@member_id,
        updated_by=@uid, updated_at=@now
      WHERE id=@id
    `).run({ ...p, id, uid: req.user.id, now });
    const after = fin.getEntry(id);
    const changes = recordRevision({ entityType: 'entry', entityId: id, userId: req.user.id, before, after, fields: ENTRY_FIELDS });
    if (changes.length) {
      const historic = after.month_key !== time.currentMonthKey(getSettings().timezone);
      logActivity({
        userId: req.user.id, action: 'edited', entityType: 'entry', entityId: id,
        summary: `${historic ? 'Corrected' : 'Edited'} ${describe(after)} — ${changes.map((c) => c.label.toLowerCase()).join(', ')}`,
        monthKey: after.month_key
      });
    }
    res.json({ entry: after, changes, revisions: listRevisions('entry', id) });
  } catch (err) { next(err); }
});

router.delete('/entries/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const entry = fin.getEntry(id);
    if (!entry) return res.status(404).json({ error: 'That payment is no longer here.' });
    db.prepare('DELETE FROM entries WHERE id = ?').run(id);
    logActivity({
      userId: req.user.id, action: 'deleted', entityType: 'entry', entityId: id,
      summary: `Deleted ${describe(entry)} ${who(entry)}`, monthKey: entry.month_key
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ split */
/* Share one payment between members by percentage. Each share is saved as a
   normal payment, so it shows up in that member's money and in the team total. */

router.post('/splits', (req, res, next) => {
  try {
    const body = req.body;
    const occurredOn = time.requireDate(body.occurred_on, 'occurred_on');
    const total = parsePair(body.usd, body.robux);
    const title = str(body.title, 60, 'title', { required: true, label: 'What is being split' });
    const category = str(body.category, 40, 'category') || 'Revenue share';
    const note = str(body.note, 600, 'note');

    const seen = new Set();
    const shares = [];
    for (const s of (Array.isArray(body.shares) ? body.shares : [])) {
      const memberId = Number(s.member_id);
      if (!memberId) continue;
      if (s.percent === '' || s.percent === null || s.percent === undefined) continue;
      const bp = toBasisPoints(s.percent, 'shares');
      if (bp <= 0) continue;
      if (seen.has(memberId)) throw new ValidationError('Each member can only appear once.', 'shares');
      const member = db.prepare('SELECT id, display_name FROM users WHERE id = ?').get(memberId);
      if (!member) throw new ValidationError('One of those members does not exist.', 'shares');
      seen.add(memberId);
      shares.push({ member, bp });
    }
    if (!shares.length) throw new ValidationError('Give at least one member a percentage.', 'shares');
    const totalBp = shares.reduce((a, b) => a + b.bp, 0);
    if (totalBp > 10000) {
      throw new ValidationError(`The percentages add up to ${formatBasisPoints(totalBp)} — that is more than the whole payment.`, 'shares');
    }

    const splitId = crypto.randomBytes(8).toString('hex');
    const now = time.nowIso();
    const insert = db.prepare(`
      INSERT INTO entries (kind, title, usd_cents, robux, category, occurred_on, month_key, note, member_id,
                           percent_bp, of_usd_cents, of_robux, split_id, split_label,
                           created_by, created_at, updated_by, updated_at)
      VALUES ('in', @title, @usd_cents, @robux, @category, @occurred_on, @month_key, @note, @member_id,
              @percent_bp, @of_usd_cents, @of_robux, @split_id, @split_label,
              @uid, @now, @uid, @now)
    `);

    const created = [];
    for (const s of shares) {
      const cut = applyPercentPair(total, s.bp);
      const info = insert.run({
        title: `${title} — ${s.member.display_name}'s ${formatBasisPoints(s.bp)}`,
        usd_cents: cut.usd_cents,
        robux: cut.robux,
        category, occurred_on: occurredOn, month_key: time.monthKeyOf(occurredOn), note,
        member_id: s.member.id,
        percent_bp: s.bp, of_usd_cents: total.usd_cents, of_robux: total.robux,
        split_id: splitId, split_label: title,
        uid: req.user.id, now
      });
      created.push(fin.getEntry(info.lastInsertRowid));
    }

    logActivity({
      userId: req.user.id, action: 'created', entityType: 'split', entityId: null,
      summary: `Split ${formatPair(total)} from “${title}” between ${shares.map((s) => `${s.member.display_name} ${formatBasisPoints(s.bp)}`).join(', ')}`,
      monthKey: time.monthKeyOf(occurredOn)
    });

    res.status(201).json({
      split_id: splitId,
      entries: created,
      leftover: {
        percent_bp: 10000 - totalBp,
        amount: applyPercentPair(total, 10000 - totalBp)
      }
    });
  } catch (err) { next(err); }
});

router.get('/splits/:id', (req, res, next) => {
  try {
    const entries = fin.listSplit(String(req.params.id));
    if (!entries.length) return res.status(404).json({ error: 'That split is no longer here.' });
    res.json({ entries });
  } catch (err) { next(err); }
});

router.delete('/splits/:id', (req, res, next) => {
  try {
    const splitId = String(req.params.id);
    const entries = fin.listSplit(splitId);
    if (!entries.length) return res.status(404).json({ error: 'That split is no longer here.' });
    db.prepare('DELETE FROM entries WHERE split_id = ?').run(splitId);
    logActivity({
      userId: req.user.id, action: 'deleted', entityType: 'split', entityId: null,
      summary: `Deleted the split “${entries[0].split_label}” (${entries.length} payments)`,
      monthKey: entries[0].month_key
    });
    res.json({ ok: true, removed: entries.length });
  } catch (err) { next(err); }
});

/* -------------------------------------------------- summaries and history */

router.get('/summary', (req, res, next) => {
  try {
    const settings = getSettings();
    const month = req.query.month ? time.requireMonthKey(req.query.month) : time.currentMonthKey(settings.timezone);
    res.json({
      summary: fin.monthSummary(month, settings),
      trend: fin.trend(6, settings),
      activity: listActivity({ limit: 6 })
    });
  } catch (err) { next(err); }
});

router.get('/months', (req, res, next) => {
  try {
    const settings = getSettings();
    res.json({
      current_month: time.currentMonthKey(settings.timezone),
      timezone: settings.timezone,
      months: fin.knownMonths(settings).map((m) => fin.monthTotals(m, settings))
    });
  } catch (err) { next(err); }
});

router.get('/months/:month', (req, res, next) => {
  try {
    const settings = getSettings();
    const month = time.requireMonthKey(req.params.month);
    res.json({
      summary: fin.monthSummary(month, settings),
      entries: fin.listEntries({ month }),
      activity: listActivity({ month, limit: 100 })
    });
  } catch (err) { next(err); }
});

router.get('/activity', (req, res, next) => {
  try {
    res.json({ activity: listActivity({ limit: req.query.limit || 80, month: req.query.month || null }) });
  } catch (err) { next(err); }
});

router.get('/meta', (req, res) => {
  res.json({ earning_categories: fin.EARNING_CATEGORIES, spending_categories: fin.SPENDING_CATEGORIES });
});

module.exports = router;
