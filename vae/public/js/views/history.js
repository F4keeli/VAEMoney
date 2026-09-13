import { api } from '../api.js';
import { esc, node, emptyState } from '../ui.js';
import { money, usd, pair } from '../format.js';
import { sparkline } from '../charts.js';

async function render() {
  const data = await api.get('/months');
  const months = data.months;
  const netSeries = [...months].reverse().map((m) => m.combined.net_cents);

  const el = node(`
    <div class="stack" style="gap:18px">
      <div class="panel panel-pad row" style="justify-content:space-between;gap:16px">
        <div>
          <div class="faint" style="font-size:.72rem;letter-spacing:.08em;text-transform:uppercase">Months saved</div>
          <div style="font-size:1.5rem;font-weight:650;margin-top:4px">${months.length}</div>
          <p class="hint" style="margin-top:4px">A new month starts on the 1st. Nothing from an old month is ever deleted.</p>
        </div>
        <div style="width:180px">${sparkline(netSeries, '#7c5cff')}<div class="faint" style="font-size:.72rem;text-align:right">profit over time</div></div>
      </div>
      <div class="stack" data-months></div>
    </div>`);

  const list = el.querySelector('[data-months]');
  list.innerHTML = months.length
    ? months.map((m) => `
      <a class="month-card" href="#/history/${m.month}">
        <div class="avatar" style="background:${m.is_current ? 'var(--accent)' : 'var(--panel-3)'};color:${m.is_current ? '#fff' : 'var(--text-dim)'};width:44px;height:44px;border-radius:14px;font-size:.78rem;flex-direction:column;line-height:1.05">
          <span style="font-size:.62rem;opacity:.8">${esc(m.label.split(' ')[0].slice(0, 3).toUpperCase())}</span>
          <span>${esc(m.month.slice(2, 4))}</span>
        </div>
        <div>
          <div class="mc-label">${esc(m.label)} ${m.is_current ? '<span class="pill accent" style="font-size:.62rem">now</span>' : ''}</div>
          <div class="mc-meta">${m.counts.entries} payment${m.counts.entries === 1 ? '' : 's'}</div>
        </div>
        <div class="mc-nums">
          <div class="num pos" style="font-weight:560">${esc(pair(m.totals.earned, { empty: '—', compact: true }))}<span class="faint" style="font-weight:400;font-size:.74rem"> in</span></div>
          <div class="num neg" style="font-size:.8rem">${esc(pair(m.totals.spent, { empty: '—', compact: true }))}<span class="faint" style="font-weight:400;font-size:.74rem"> out</span></div>
        </div>
        <span class="faint" style="font-size:1.1rem">›</span>
      </a>`).join('')
    : `<div class="panel">${emptyState({ title: 'No months yet' })}</div>`;

  return { title: 'Months', subtitle: `Calendar months in ${esc(data.timezone)}`, el };
}

export default { render };
