const crypto = require('crypto');
const { db, getSettings } = require('./db');
const { nowIso, currentMonthKey, shiftMonth, daysInMonth } = require('./time');
const { toMinor, applyPercentPair, formatPair } = require('./money');
const { logActivity } = require('./log');

const day = (month, d) => `${month}-${String(Math.min(d, daysInMonth(month))).padStart(2, '0')}`;

const sampleExists = () => db.prepare('SELECT COUNT(*) AS n FROM entries WHERE is_sample = 1').get().n > 0;

/*
 * Example payments so a new team can see how the numbers add up.
 * No accounts are created — the examples are shared out between whoever is
 * already on the team, and "Remove the example data" deletes exactly these rows.
 */
function loadSampleData(actor) {
  const settings = getSettings();
  const m0 = currentMonthKey(settings.timezone);
  const m1 = shiftMonth(m0, -1);
  const m2 = shiftMonth(m0, -2);
  const now = nowIso();

  const members = db.prepare('SELECT id FROM users WHERE active = 1 ORDER BY id').all().map((r) => r.id);
  const pick = (i) => members[i % members.length];

  // [direction, title, usd, robux, category, date, member (null = whole team), note]
  const rows = [
    ['in',  'Character pack — client order',   '1450.00', '0',     'Commission',      day(m0, 4),  pick(0), 'Paid half up front.'],
    ['in',  'Weapon set — paid in both',       '250.00',  '40000', 'Commission',      day(m0, 9),  pick(1), 'Client paid part in USD and part in Robux.'],
    ['in',  'Animation set',                   '0',       '28000', 'Commission',      day(m0, 12), pick(2), ''],
    ['in',  'Store asset sales',               '186.40',  '0',     'Asset sale',      day(m0, 15), null,    'Goes to the team.'],
    ['out', 'Outsourced rigging',              '180.00',  '0',     'Outsourced work', day(m0, 6),  null,    'Rigger for the creature pack.'],
    ['out', 'Advert test',                     '0',       '9000',  'Advertising',     day(m0, 11), null,    ''],
    ['out', 'Software seat',                   '49.90',   '0',     'Software',        day(m0, 2),  pick(0), 'Monthly.'],

    ['in',  'Map build — client order',        '980.00',  '0',     'Commission',      day(m1, 7),  pick(2), ''],
    ['in',  'VFX pack sale',                   '0',       '41000', 'Asset sale',      day(m1, 18), pick(1), ''],
    ['in',  'Monthly retainer',                '700.00',  '0',     'Sponsorship',     day(m1, 22), null,    ''],
    ['out', 'Platform fee',                    '54.00',   '0',     'Platform fee',    day(m1, 28), null,    ''],
    ['out', 'Concept art',                     '210.00',  '0',     'Outsourced work', day(m1, 14), null,    ''],

    ['in',  'UI icon batch',                   '1120.00', '0',     'Commission',      day(m2, 10), pick(0), ''],
    ['in',  'Model pack',                      '0',       '33000', 'Asset sale',      day(m2, 16), pick(1), ''],
    ['out', 'Team software licences',          '96.00',   '0',     'Software',        day(m2, 3),  null,    ''],
    ['out', 'Refund — cancelled order',        '150.00',  '0',     'Refund',          day(m2, 24), null,    'Client cancelled after the first pass.']
  ];

  const insertEntry = db.prepare(`
    INSERT INTO entries (kind, title, usd_cents, robux, category, occurred_on, month_key, note, member_id,
                         is_sample, created_by, created_at, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`);

  for (const [kind, title, usd, robux, category, date, memberId, note] of rows) {
    insertEntry.run(kind, title, toMinor(usd, 'USD'), toMinor(robux, 'ROBUX'), category,
      date, date.slice(0, 7), note, memberId, actor.id, now, actor.id, now);
  }

  // One example of a payment shared out by percentage.
  const splitTotal = { usd_cents: toMinor('0', 'USD'), robux: toMinor('240000', 'ROBUX') };
  const splitShares = [[pick(0), 2500], [pick(1), 1500], [pick(2), 2000]];
  const splitId = crypto.randomBytes(8).toString('hex');
  const label = 'Group game revenue';
  const insertShare = db.prepare(`
    INSERT INTO entries (kind, title, usd_cents, robux, category, occurred_on, month_key, note, member_id,
                         percent_bp, of_usd_cents, of_robux, split_id, split_label,
                         is_sample, created_by, created_at, updated_by, updated_at)
    VALUES ('in', ?, ?, ?, 'Revenue share', ?, ?, '', ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`);

  const seen = new Set();
  let sampleSplits = 0;
  for (const [memberId, bp] of splitShares) {
    if (seen.has(memberId)) continue;
    seen.add(memberId);
    const cut = applyPercentPair(splitTotal, bp);
    const name = db.prepare('SELECT display_name FROM users WHERE id = ?').get(memberId).display_name;
    insertShare.run(`${label} — ${name}'s ${bp / 100}%`, cut.usd_cents, cut.robux,
      day(m0, 20), m0, memberId, bp, splitTotal.usd_cents, splitTotal.robux, splitId, label,
      actor.id, now, actor.id, now);
    sampleSplits += 1;
  }

  logActivity({
    userId: actor.id, action: 'created', entityType: 'sample', entityId: null,
    summary: `Added the example data (${rows.length + sampleSplits} payments)`, monthKey: m0
  });
  return { entries: rows.length + sampleSplits, months: 3, split_total: formatPair(splitTotal) };
}

function clearSampleData(actor) {
  const removed = db.prepare('DELETE FROM entries WHERE is_sample = 1').run().changes;
  db.prepare("DELETE FROM activity WHERE entity_type = 'sample'").run();
  logActivity({
    userId: actor.id, action: 'deleted', entityType: 'sample', entityId: null,
    summary: `Removed the example data (${removed} payments)`,
    monthKey: currentMonthKey(getSettings().timezone)
  });
  return { entries: removed };
}

module.exports = { loadSampleData, clearSampleData, sampleExists };
