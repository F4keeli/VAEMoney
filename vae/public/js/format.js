export const CURRENCY = {
  USD:   { label: 'USD',   symbol: '$',  decimals: 2, scale: 100, color: 'var(--usd)' },
  ROBUX: { label: 'Robux', symbol: 'R$', decimals: 0, scale: 1,   color: 'var(--robux)' }
};

export function money(minor, currency, { sign = false, compact = false } = {}) {
  const c = CURRENCY[currency] || CURRENCY.USD;
  const n = Number(minor || 0) / c.scale;
  const abs = Math.abs(n);
  let body;
  if (compact && abs >= 10000) {
    const units = [[1e9, 'B'], [1e6, 'M'], [1e3, 'k']];
    const [div, suffix] = units.find(([d]) => abs >= d);
    const v = abs / div;
    body = (v >= 100 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, '')) + suffix;
  } else {
    body = abs.toLocaleString('en-US', { minimumFractionDigits: c.decimals, maximumFractionDigits: c.decimals });
  }
  const prefix = n < 0 ? '-' : (sign && n > 0 ? '+' : '');
  return `${prefix}${c.symbol}${body}`;
}

export const usd = (cents, opts) => money(cents, 'USD', opts);
export const rbx = (robux, opts) => money(robux, 'ROBUX', opts);

/* A payment can hold USD, Robux or both, so amounts travel as a pair. */
export function pair(p, { empty = '—', compact = false, sign = '' } = {}) {
  if (!p) return empty;
  const parts = [];
  if (p.usd_cents) parts.push(sign + money(p.usd_cents, 'USD', { compact }));
  if (p.robux) parts.push(sign + money(p.robux, 'ROBUX', { compact }));
  return parts.length ? parts.join('  +  ') : empty;
}
export const pairEmpty = (p) => !p || (!p.usd_cents && !p.robux);
export const pct = (bp) => `${(Number(bp || 0) / 100).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')}%`;

export function monthLabel(key) {
  if (!key) return '';
  const [y, m] = key.split('-').map(Number);
  return `${new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })} ${y}`;
}
export function monthShort(key) {
  const [y, m] = key.split('-').map(Number);
  return `${new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} ${String(y).slice(2)}`;
}
export function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${String(Math.floor(total / 12)).padStart(4, '0')}-${String((total % 12) + 1).padStart(2, '0')}`;
}
export function dateLabel(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${new Date(Date.UTC(y, m - 1, d)).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })}`;
}
export function dateTimeLabel(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function relTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return dateTimeLabel(iso);
}
export const clockLabel = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export const initials = (name) => String(name || '?').trim().slice(0, 1).toUpperCase();
export const netTone = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
