const { ValidationError } = require('./money');

function validTimezone(tz) {
  try { new Intl.DateTimeFormat('en-CA', { timeZone: tz }); return true; }
  catch (_) { return false; }
}

function todayIn(tz) {
  const zone = validTimezone(tz) ? tz : 'UTC';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function currentMonthKey(tz) {
  return todayIn(tz).slice(0, 7);
}

function monthKeyOf(dateStr) {
  return String(dateStr).slice(0, 7);
}

function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function requireDate(s, field) {
  if (!isValidDate(s)) throw new ValidationError('Use a real date in YYYY-MM-DD form.', field || 'occurred_on');
  return s;
}

function isValidMonthKey(s) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(s || ''));
}

function requireMonthKey(s, field) {
  if (!isValidMonthKey(s)) throw new ValidationError('Use a month in YYYY-MM form.', field || 'month');
  return s;
}

function daysInMonth(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function monthLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const name = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  return `${name} ${y}`;
}

function shiftMonth(monthKey, delta) {
  const [y, m] = monthKey.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  return `${String(ny).padStart(4, '0')}-${String(nm + 1).padStart(2, '0')}`;
}

// First and last calendar day of the month, inclusive.
function monthBounds(monthKey) {
  return { start: `${monthKey}-01`, end: `${monthKey}-${String(daysInMonth(monthKey)).padStart(2, '0')}` };
}

function nowIso() {
  return new Date().toISOString();
}

module.exports = {
  validTimezone, todayIn, currentMonthKey, monthKeyOf, isValidDate, requireDate,
  isValidMonthKey, requireMonthKey, daysInMonth, monthLabel, shiftMonth, monthBounds, nowIso
};
