import { esc, node } from '../ui.js';
import { money, pair, pct, monthLabel, monthShort, shiftMonth, dateLabel } from '../format.js';
import { state, setViewMonth } from '../store.js';

export function monthSwitcher(month, onChange) {
  const wrap = node(`
    <div class="row" style="gap:6px">
      <button class="btn icon ghost" data-d="-1" aria-label="Previous month">‹</button>
      <div class="pill" style="padding:7px 14px;font-size:.85rem;min-width:132px;justify-content:center">${esc(monthLabel(month))}</div>
      <button class="btn icon ghost" data-d="1" aria-label="Next month">›</button>
      ${month !== state.currentMonth ? '<button class="btn sm ghost" data-now>This month</button>' : ''}
    </div>`);
  wrap.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => onChange(shiftMonth(month, Number(b.dataset.d)))));
  const now = wrap.querySelector('[data-now]');
  if (now) now.addEventListener('click', () => onChange(state.currentMonth));
  return wrap;
}

export function goMonth(month) {
  setViewMonth(month);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/* One card showing an amount in both currencies, one line each. */
export const amountCard = ({ label, amount, tint = 'var(--accent)', tone = '', foot = '' }) => `
  <div class="stat" style="--tint:${tint}">
    <div class="stat-label">${esc(label)}</div>
    <div class="amount-lines">
      <div class="amount-line ${tone}"><span class="cur">USD</span><b class="num">${esc(money(amount.usd_cents, 'USD'))}</b></div>
      <div class="amount-line ${tone}"><span class="cur">Robux</span><b class="num">${esc(money(amount.robux, 'ROBUX'))}</b></div>
    </div>
    ${foot ? `<div class="stat-foot">${foot}</div>` : ''}
  </div>`;

export const kindDot = (kind) => `<span class="kind-dot" style="background:${kind === 'in' ? 'var(--pos)' : 'var(--neg)'}"></span>`;
export const whoLabel = (entry) => (entry.member_id ? entry.member_name : 'The team');

export function entryRowHtml(entry) {
  const tone = entry.kind === 'in' ? 'pos' : 'neg';
  const sign = entry.kind === 'in' ? '+' : '−';
  const amounts = [];
  if (entry.amount.usd_cents) amounts.push(`${sign}${money(entry.amount.usd_cents, 'USD')}`);
  if (entry.amount.robux) amounts.push(`${sign}${money(entry.amount.robux, 'ROBUX')}`);
  return `
    <tr data-entry="${entry.id}">
      <td>
        <div class="row" style="gap:9px;flex-wrap:nowrap">
          ${kindDot(entry.kind)}
          <div style="min-width:0">
            <div class="entry-title">${esc(entry.title)}${entry.is_sample ? ' <span class="pill" style="font-size:.62rem">example</span>' : ''}</div>
            <div class="entry-meta">${esc(entry.category)} · ${esc(whoLabel(entry))}${entry.percent_bp ? ` · ${esc(pct(entry.percent_bp))} of ${esc(pair(entry.of_amount))}` : ''}</div>
          </div>
        </div>
      </td>
      <td class="dim" style="white-space:nowrap">${esc(dateLabel(entry.occurred_on))}</td>
      <td class="right" style="white-space:nowrap">
        ${amounts.map((a) => `<div class="num ${tone}" style="font-weight:560">${esc(a)}</div>`).join('')}
      </td>
      <td class="right">
        <div class="row-actions">
          <a class="btn sm ghost" href="#/entry/${entry.id}">Edit</a>
          <button class="btn sm ghost" data-del="${entry.id}" aria-label="Delete">✕</button>
        </div>
      </td>
    </tr>`;
}

export const entriesTable = (entries) => `
  <div class="tbl-wrap">
    <table class="tbl">
      <thead><tr><th>Payment</th><th>Date</th><th class="right">Amount</th><th></th></tr></thead>
      <tbody>${entries.map(entryRowHtml).join('')}</tbody>
    </table>
  </div>`;

/* Who earned what this month — every member's own money, side by side. */
export function memberBreakdown(summary, { link = true } = {}) {
  const rows = summary.members.filter((m) => m.active || m.entry_count);
  if (!rows.length) return '<p class="hint">Nobody has any payments this month yet.</p>';
  const max = Math.max(1, ...rows.map((m) => m.earned_usd_cents));
  return `<div class="mbar">${rows.map((m) => `
    <div class="mbar-row">
      <div class="avatar" style="background:${esc(m.accent)};width:30px;height:30px;border-radius:9px;font-size:.8rem">${esc(m.display_name.slice(0, 1).toUpperCase())}</div>
      <div style="min-width:0">
        <div class="row" style="justify-content:space-between;gap:8px;margin-bottom:5px">
          <span style="font-weight:540;font-size:.9rem">${link ? `<a href="#/room/${esc(m.username)}">${esc(m.display_name)}</a>` : esc(m.display_name)}</span>
          <span class="faint" style="font-size:.78rem">${esc(pct(m.share_bp))} of what the team earned</span>
        </div>
        <div class="mbar-track"><div class="mbar-fill" style="width:${Math.max(2, Math.round((m.earned_usd_cents / max) * 100))}%;background:${esc(m.accent)}"></div></div>
      </div>
      <div style="text-align:right;white-space:nowrap">
        <div class="num" style="font-weight:560">${esc(money(m.earned.usd_cents, 'USD'))}</div>
        <div class="num faint" style="font-size:.78rem">${esc(money(m.earned.robux, 'ROBUX'))}</div>
      </div>
    </div>`).join('')}</div>`;
}

export const chartLegend = `
  <div class="legend">
    <span><i style="background:#3ddc97"></i>Money in</span>
    <span><i style="background:#ff5f6d"></i>Money out</span>
  </div>`;

export const trendPoints = (trend, currency) => {
  const key = currency === 'USD' ? 'usd_cents' : 'robux';
  return trend.map((t) => ({
    label: monthLabel(t.month),
    short: monthShort(t.month),
    current: t.is_current,
    income: t.totals.earned[key],
    expense: t.totals.spent[key]
  }));
};
