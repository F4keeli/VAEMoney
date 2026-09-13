const CURRENCIES = {
  USD:   { code: 'USD',   label: 'USD',   symbol: '$',  decimals: 2, scale: 100 },
  ROBUX: { code: 'ROBUX', label: 'Robux', symbol: 'R$', decimals: 0, scale: 1 }
};

class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.status = 400;
    this.field = field || null;
  }
}

function isCurrency(code) {
  return Object.prototype.hasOwnProperty.call(CURRENCIES, String(code || '').toUpperCase());
}

function normalizeCurrency(code, field) {
  const c = String(code || '').toUpperCase();
  if (!isCurrency(c)) throw new ValidationError('Currency must be USD or Robux.', field || 'currency');
  return c;
}

// Parses a human-typed amount into integer minor units (USD cents, whole Robux).
// Uses BigInt string math so decimals never drift.
function toMinor(raw, currency, field) {
  const cur = CURRENCIES[normalizeCurrency(currency, field)];
  let s = String(raw === null || raw === undefined ? '' : raw).trim().replace(/[\s, ]/g, '');
  if (s === '') throw new ValidationError('Enter an amount.', field || 'amount');
  if (s.startsWith('+')) s = s.slice(1);
  const negative = s.startsWith('-');
  if (negative) s = s.slice(1);
  if (!/^\d*\.?\d*$/.test(s) || !/\d/.test(s)) {
    throw new ValidationError('That amount is not a valid number.', field || 'amount');
  }
  const [intPart = '0', fracPart = ''] = s.split('.');
  const d = cur.decimals;
  const padded = (fracPart + '0'.repeat(d + 1)).slice(0, d + 1);
  const keep = padded.slice(0, d);
  let minor = BigInt(intPart || '0') * BigInt(cur.scale) + BigInt(keep === '' ? '0' : keep);
  if (Number(padded[d]) >= 5) minor += 1n;
  if (minor > 9007199254740991n) throw new ValidationError('That amount is too large.', field || 'amount');
  const value = Number(minor);
  return negative ? -value : value;
}

function fromMinor(minor, currency) {
  const cur = CURRENCIES[normalizeCurrency(currency)];
  return Number(minor) / cur.scale;
}

function formatMinor(minor, currency) {
  const cur = CURRENCIES[normalizeCurrency(currency)];
  const n = Math.abs(Number(minor)) / cur.scale;
  const body = n.toLocaleString('en-US', { minimumFractionDigits: cur.decimals, maximumFractionDigits: cur.decimals });
  return (Number(minor) < 0 ? '-' : '') + cur.symbol + body;
}

// Percentages are stored as basis points: 12.5% -> 1250
function toBasisPoints(raw, field) {
  let s = String(raw === null || raw === undefined ? '' : raw).trim().replace(/[\s,% ]/g, '');
  if (s === '') throw new ValidationError('Enter a percentage.', field || 'percent');
  if (!/^\d*\.?\d*$/.test(s) || !/\d/.test(s)) {
    throw new ValidationError('That percentage is not a valid number.', field || 'percent');
  }
  const [intPart = '0', fracPart = ''] = s.split('.');
  const padded = (fracPart + '000').slice(0, 3);
  let bp = BigInt(intPart || '0') * 100n + BigInt(padded.slice(0, 2));
  if (Number(padded[2]) >= 5) bp += 1n;
  const value = Number(bp);
  if (value > 1000000) throw new ValidationError('A percentage cannot be over 10,000%.', field || 'percent');
  return value;
}

function formatBasisPoints(bp) {
  const n = Number(bp) / 100;
  return (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, '')) + '%';
}

// Share of a base amount, rounded half-up to the currency's smallest unit.
function applyPercent(baseMinor, bp) {
  const product = BigInt(Math.round(Number(baseMinor))) * BigInt(Math.round(Number(bp)));
  const whole = product / 10000n;
  const rest = product % 10000n;
  const rounded = rest * 2n >= 10000n ? whole + 1n : whole;
  return Number(rounded);
}

function robuxToUsdCents(robux, rate) {
  const r = Number(rate);
  if (!Number.isFinite(r) || r <= 0) return 0;
  return Math.round(Number(robux) * r * 100);
}


/* ---------------------------------------------------------------------------
   A payment can carry USD, Robux, or both at the same time, so amounts move
   around as a pair: { usd_cents, robux }. Both are whole numbers.
   --------------------------------------------------------------------------- */

const zero = () => ({ usd_cents: 0, robux: 0 });
const add = (a, b) => ({ usd_cents: a.usd_cents + b.usd_cents, robux: a.robux + b.robux });
const sub = (a, b) => ({ usd_cents: a.usd_cents - b.usd_cents, robux: a.robux - b.robux });
const isEmpty = (a) => a.usd_cents === 0 && a.robux === 0;

// Blank means "none of this currency", not an error.
function parsePair(usdInput, robuxInput, { field = 'usd', required = true } = {}) {
  const blank = (v) => v === null || v === undefined || String(v).trim() === '';
  const usd_cents = blank(usdInput) ? 0 : toMinor(usdInput, 'USD', 'usd');
  const robux = blank(robuxInput) ? 0 : toMinor(robuxInput, 'ROBUX', 'robux');
  if (usd_cents < 0 || robux < 0) throw new ValidationError('Amounts cannot be negative.', field);
  if (required && usd_cents === 0 && robux === 0) {
    throw new ValidationError('Enter an amount in USD, in Robux, or both.', field);
  }
  return { usd_cents, robux };
}

const pairToUsdCents = (pair, rate) => pair.usd_cents + robuxToUsdCents(pair.robux, rate);

const applyPercentPair = (pair, bp) => ({
  usd_cents: applyPercent(pair.usd_cents, bp),
  robux: applyPercent(pair.robux, bp)
});

function formatPair(pair, { empty = '—' } = {}) {
  const parts = [];
  if (pair.usd_cents) parts.push(formatMinor(pair.usd_cents, 'USD'));
  if (pair.robux) parts.push(formatMinor(pair.robux, 'ROBUX'));
  return parts.length ? parts.join(' + ') : empty;
}

module.exports = {
  zero, add, sub, isEmpty, parsePair, pairToUsdCents, applyPercentPair, formatPair,
  CURRENCIES, ValidationError, isCurrency, normalizeCurrency,
  toMinor, fromMinor, formatMinor, toBasisPoints, formatBasisPoints,
  applyPercent, robuxToUsdCents
};
