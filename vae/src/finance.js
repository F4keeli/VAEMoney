const { db, getSettings } = require('./db');
const money = require('./money');
const { zero, add, sub, pairToUsdCents } = money;
const { daysInMonth, monthLabel, currentMonthKey, shiftMonth } = require('./time');

const EARNING_CATEGORIES = ['Commission', 'Game revenue', 'Asset sale', 'Sponsorship', 'Revenue share', 'Other'];
const SPENDING_CATEGORIES = ['Member payment', 'Outsourced work', 'Software', 'Assets', 'Advertising', 'Platform fee', 'Refund', 'Other'];

const pairOf = (row) => ({ usd_cents: row.usd_cents || 0, robux: row.robux || 0 });

function shapeEntry(row) {
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,                       // 'in' = earned, 'out' = spent
    title: row.title,
    amount: pairOf(row),
    usd_cents: row.usd_cents,
    robux: row.robux,
    category: row.category,
    occurred_on: row.occurred_on,
    month_key: row.month_key,
    note: row.note,
    member_id: row.member_id,
    member_name: row.member_name || null,
    member_username: row.member_username || null,
    percent_bp: row.percent_bp,
    of_amount: row.percent_bp ? { usd_cents: row.of_usd_cents || 0, robux: row.of_robux || 0 } : null,
    split_id: row.split_id,
    split_label: row.split_label,
    is_sample: !!row.is_sample,
    created_by: row.created_by,
    created_by_name: row.created_by_name || null,
    created_at: row.created_at,
    updated_by: row.updated_by,
    updated_by_name: row.updated_by_name || null,
    updated_at: row.updated_at
  };
}

const ENTRY_SELECT = `
  SELECT e.*, m.display_name AS member_name, m.username AS member_username,
         c.display_name AS created_by_name, u.display_name AS updated_by_name
  FROM entries e
  LEFT JOIN users m ON m.id = e.member_id
  LEFT JOIN users c ON c.id = e.created_by
  LEFT JOIN users u ON u.id = e.updated_by
`;

const getEntry = (id) => shapeEntry(db.prepare(`${ENTRY_SELECT} WHERE e.id = ?`).get(id));

function listEntries({ month, kind, memberId, search } = {}) {
  const where = [];
  const params = [];
  if (month) { where.push('e.month_key = ?'); params.push(month); }
  if (kind) { where.push('e.kind = ?'); params.push(kind); }
  if (memberId === 'team') where.push('e.member_id IS NULL');
  else if (memberId) { where.push('e.member_id = ?'); params.push(memberId); }
  if (search) { where.push('(e.title LIKE ? OR e.note LIKE ? OR e.category LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  const sql = `${ENTRY_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY e.occurred_on DESC, e.id DESC`;
  return db.prepare(sql).all(...params).map(shapeEntry);
}

/*
 * Every payment counts towards the team totals. A payment that names a member
 * ALSO counts as that member's own money — it is never moved away from the team.
 */
function monthSummary(monthKey, settingsArg) {
  const settings = settingsArg || getSettings();
  const rate = Number(settings.robux_rate);
  const entries = listEntries({ month: monthKey });

  const totals = { earned: zero(), spent: zero(), net: zero() };
  const memberMap = new Map();
  for (const m of db.prepare('SELECT id, username, display_name, accent, active FROM users ORDER BY id').all()) {
    memberMap.set(m.id, {
      id: m.id, username: m.username, display_name: m.display_name, accent: m.accent, active: !!m.active,
      earned: zero(), spent: zero(), net: zero(), entry_count: 0
    });
  }

  const unassigned = { earned: zero(), spent: zero() };
  const categories = { earned: new Map(), spent: new Map() };
  const days = daysInMonth(monthKey);
  const daily = Array.from({ length: days }, (_, i) => ({ day: i + 1, earned: zero(), spent: zero() }));

  for (const e of entries) {
    const bucket = e.kind === 'in' ? 'earned' : 'spent';
    totals[bucket] = add(totals[bucket], e.amount);

    const catMap = categories[bucket];
    catMap.set(e.category, add(catMap.get(e.category) || zero(), e.amount));

    const dayIdx = Math.min(days, Math.max(1, Number(e.occurred_on.slice(8, 10)))) - 1;
    daily[dayIdx][bucket] = add(daily[dayIdx][bucket], e.amount);

    if (e.member_id && memberMap.has(e.member_id)) {
      const m = memberMap.get(e.member_id);
      m[bucket] = add(m[bucket], e.amount);
      m.entry_count += 1;
    } else {
      unassigned[bucket] = add(unassigned[bucket], e.amount);
    }
  }
  totals.net = sub(totals.earned, totals.spent);

  const teamEarnedUsd = pairToUsdCents(totals.earned, rate);
  const members = [...memberMap.values()].map((m) => {
    m.net = sub(m.earned, m.spent);
    m.earned_usd_cents = pairToUsdCents(m.earned, rate);
    m.net_usd_cents = pairToUsdCents(m.net, rate);
    m.share_bp = teamEarnedUsd > 0 ? Math.round((m.earned_usd_cents / teamEarnedUsd) * 10000) : 0;
    return m;
  }).sort((a, b) => b.earned_usd_cents - a.earned_usd_cents || a.display_name.localeCompare(b.display_name));

  const catList = (map) => [...map.entries()]
    .map(([category, amount]) => ({ category, amount, usd_equiv: pairToUsdCents(amount, rate) }))
    .sort((a, b) => b.usd_equiv - a.usd_equiv);

  return {
    month: monthKey,
    label: monthLabel(monthKey),
    days,
    is_current: monthKey === currentMonthKey(settings.timezone),
    totals,
    combined: {
      enabled: settings.conversion_enabled === '1',
      rate,
      earned_cents: teamEarnedUsd,
      spent_cents: pairToUsdCents(totals.spent, rate),
      net_cents: pairToUsdCents(totals.net, rate)
    },
    members,
    unassigned,
    categories: { earned: catList(categories.earned), spent: catList(categories.spent) },
    daily,
    counts: {
      entries: entries.length,
      earned: entries.filter((e) => e.kind === 'in').length,
      spent: entries.filter((e) => e.kind === 'out').length
    }
  };
}

function knownMonths(settings) {
  const set = new Set(db.prepare('SELECT DISTINCT month_key FROM entries').all().map((r) => r.month_key));
  set.add(currentMonthKey(settings.timezone));
  return [...set].filter(Boolean).sort().reverse();
}

function monthTotals(monthKey, settings) {
  const s = monthSummary(monthKey, settings);
  return { month: s.month, label: s.label, is_current: s.is_current, totals: s.totals, combined: s.combined, counts: s.counts };
}

function trend(months, settings) {
  const current = currentMonthKey(settings.timezone);
  const out = [];
  for (let i = months - 1; i >= 0; i--) out.push(monthTotals(shiftMonth(current, -i), settings));
  return out;
}

const listSplit = (splitId) => listEntries({}).filter((e) => e.split_id === splitId);

module.exports = {
  EARNING_CATEGORIES, SPENDING_CATEGORIES,
  shapeEntry, getEntry, listEntries, listSplit,
  monthSummary, knownMonths, monthTotals, trend
};
