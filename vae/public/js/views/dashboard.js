import { api } from '../api.js';
import { esc, node, emptyState } from '../ui.js';
import { money, usd, pair, pct, relTime, monthLabel } from '../format.js';
import { state } from '../store.js';
import { trendChart, PALETTE } from '../charts.js';
import { monthSwitcher, amountCard, memberBreakdown, chartLegend, trendPoints, goMonth } from './common.js';

async function render() {
  const month = state.viewMonth || state.currentMonth;
  const data = await api.get(`/summary?month=${month}`);
  const s = data.summary;
  const t = s.totals;
  const empty = s.counts.entries === 0;

  const el = node('<div class="stack" style="gap:18px"></div>');

  if (empty) {
    el.appendChild(node(`
      <div class="panel">
        ${emptyState({
          icon: '✦',
          title: `Nothing in ${monthLabel(month)} yet`,
          text: 'Add a payment the team got or spent. You can also load some example data to see how it works, and delete it later.',
          action: `<div class="row" style="justify-content:center">
                     <a class="btn primary" href="#/entry/new">Add a payment</a>
                     <a class="btn ghost" href="#/settings">Load example data</a>
                   </div>`
        })}
      </div>`));
  }

  el.appendChild(node(`
    <div class="grid g-3">
      ${amountCard({ label: 'Money in this month', amount: t.earned, tint: 'var(--pos)', tone: 'pos' })}
      ${amountCard({ label: 'Money out this month', amount: t.spent, tint: 'var(--neg)', tone: 'neg' })}
      ${amountCard({
        label: 'Left over (profit)',
        amount: t.net,
        tint: s.combined.net_cents >= 0 ? 'var(--pos)' : 'var(--neg)',
        tone: s.combined.net_cents >= 0 ? 'pos' : 'neg',
        foot: s.combined.enabled
          ? `<span class="pill accent">≈ ${esc(usd(s.combined.net_cents))} in total</span><span class="faint">at $${esc(s.combined.rate)} per Robux</span>`
          : '<span class="faint">USD and Robux are kept apart</span>'
      })}
    </div>`));

  const main = node(`
    <div class="grid g-main">
      <div class="stack" style="gap:18px">
        <section class="panel">
          <div class="panel-head">
            <h2>Each of us this month</h2>
            <div class="spacer"></div>
            <a class="btn sm ghost" href="#/team">Team</a>
          </div>
          <div class="panel-body">
            ${memberBreakdown(s)}
            ${(s.unassigned.earned.usd_cents || s.unassigned.earned.robux || s.unassigned.spent.usd_cents || s.unassigned.spent.robux) ? `
              <div class="big-note" style="margin-top:16px">
                Not put on anyone: <b class="pos">${esc(pair(s.unassigned.earned, { empty: 'nothing' }))}</b> in
                and <b class="neg">${esc(pair(s.unassigned.spent, { empty: 'nothing' }))}</b> out — these belong to the whole team.
              </div>` : ''}
            <p class="hint" style="margin-top:14px">A payment put on one of us counts as their money <b>and</b> in the team totals above.</p>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2>The last 6 months</h2>
            <div class="spacer"></div>
            <div class="btn-group" data-cur>
              <button data-c="USD" class="on">USD</button>
              <button data-c="ROBUX">Robux</button>
            </div>
          </div>
          <div class="panel-body stack">
            <div data-trend></div>
            ${chartLegend}
          </div>
        </section>
      </div>

      <div class="stack" style="gap:18px">
        <section class="panel">
          <div class="panel-head"><h2>Where it came from</h2></div>
          <div class="panel-body">${catList(s.categories.earned, 'in')}</div>
        </section>
        <section class="panel">
          <div class="panel-head"><h2>Where it went</h2></div>
          <div class="panel-body">${catList(s.categories.spent, 'out')}</div>
        </section>
        <section class="panel">
          <div class="panel-head"><h2>Latest changes</h2><div class="spacer"></div><a class="btn sm ghost" href="#/activity">All</a></div>
          <div class="panel-body">
            ${data.activity.length ? `<div class="stack-sm">${data.activity.map((a) => `
              <div class="row" style="gap:10px;align-items:flex-start">
                <div class="avatar" style="width:26px;height:26px;border-radius:8px;font-size:.7rem;background:${esc(a.accent || '#333')}">${esc((a.user_name || '?').slice(0, 1).toUpperCase())}</div>
                <div style="min-width:0">
                  <div style="font-size:.85rem">${esc(a.summary)}</div>
                  <div class="faint" style="font-size:.74rem">${esc(a.user_name || 'Someone')} · ${esc(relTime(a.created_at))}</div>
                </div>
              </div>`).join('')}</div>` : '<p class="hint">Nothing has happened yet.</p>'}
          </div>
        </section>
      </div>
    </div>`);

  function catList(rows, kind) {
    if (!rows.length) return `<p class="hint">Nothing ${kind === 'in' ? 'came in' : 'went out'} this month.</p>`;
    const max = Math.max(1, ...rows.map((r) => r.usd_equiv));
    return `<div class="stack-sm">${rows.slice(0, 7).map((r, i) => `
      <div>
        <div class="row" style="justify-content:space-between;font-size:.86rem;margin-bottom:5px">
          <span class="dim">${esc(r.category)}</span>
          <span class="num">${esc(pair(r.amount))}</span>
        </div>
        <div class="mbar-track" style="height:5px"><div class="mbar-fill" style="width:${Math.max(3, Math.round((r.usd_equiv / max) * 100))}%;background:${PALETTE[i % PALETTE.length]}"></div></div>
      </div>`).join('')}</div>`;
  }

  let currency = 'USD';
  const paintTrend = () => {
    main.querySelector('[data-trend]').innerHTML = trendChart(trendPoints(data.trend, currency), currency);
  };
  main.querySelectorAll('[data-cur] button').forEach((b) => b.addEventListener('click', () => {
    currency = b.dataset.c;
    main.querySelectorAll('[data-cur] button').forEach((x) => x.classList.toggle('on', x === b));
    paintTrend();
  }));
  paintTrend();
  el.appendChild(main);

  const actions = node('<div class="row" style="gap:8px"></div>');
  actions.appendChild(monthSwitcher(month, goMonth));
  actions.appendChild(node('<a class="btn primary sm" href="#/entry/new">+ Add a payment</a>'));

  return {
    title: `${state.settings.team_name} · ${s.label}`,
    subtitle: s.is_current ? `This month so far · ${s.counts.entries} payments` : `Finished month · ${s.counts.entries} payments`,
    actions,
    el
  };
}

export default { render };
