import { api } from '../api.js';
import { esc, node, emptyState, confirmDialog, ok, fail } from '../ui.js';
import { pair, usd, relTime, monthLabel } from '../format.js';
import { saving, setViewMonth } from '../store.js';
import { amountCard, entriesTable, memberBreakdown } from './common.js';

async function render({ params, reload }) {
  const month = params[0];
  const data = await api.get(`/months/${month}`);
  const s = data.summary;

  const el = node(`
    <div class="stack" style="gap:18px">
      <div class="grid g-3">
        ${amountCard({ label: 'Money in', amount: s.totals.earned, tint: 'var(--pos)', tone: 'pos' })}
        ${amountCard({ label: 'Money out', amount: s.totals.spent, tint: 'var(--neg)', tone: 'neg' })}
        ${amountCard({
          label: 'Left over',
          amount: s.totals.net,
          tint: s.combined.net_cents >= 0 ? 'var(--pos)' : 'var(--neg)',
          tone: s.combined.net_cents >= 0 ? 'pos' : 'neg',
          foot: s.combined.enabled ? `<span class="pill accent">≈ ${esc(usd(s.combined.net_cents))} in total</span>` : ''
        })}
      </div>

      <div class="grid g-main" style="align-items:start">
        <section class="panel">
          <div class="panel-head"><h2>Payments</h2><div class="spacer"></div><a class="btn sm ghost" href="#/entry/new">Add one</a></div>
          <div data-entries></div>
        </section>
        <div class="stack" style="gap:18px">
          <section class="panel">
            <div class="panel-head"><h2>Each of us</h2></div>
            <div class="panel-body">${memberBreakdown(s)}</div>
          </section>
          <section class="panel">
            <div class="panel-head"><h2>What changed this month</h2></div>
            <div class="panel-body">
              ${data.activity.length ? `<div class="timeline">${data.activity.map((a) => `
                <div class="tl-item">
                  <div class="tl-dot">${a.action === 'created' ? '+' : a.action === 'deleted' ? '−' : '✎'}</div>
                  <div class="tl-body">
                    <div class="tl-sum">${esc(a.summary)}</div>
                    <div class="tl-meta">${esc(a.user_name || 'Someone')} · ${esc(relTime(a.created_at))}</div>
                  </div>
                </div>`).join('')}</div>` : '<p class="hint">Nothing was changed in this month.</p>'}
            </div>
          </section>
        </div>
      </div>
    </div>`);

  const box = el.querySelector('[data-entries]');
  box.innerHTML = data.entries.length
    ? entriesTable(data.entries)
    : emptyState({ title: 'No payments in this month' });

  box.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-del]');
    if (!btn) return;
    const entry = data.entries.find((x) => String(x.id) === btn.dataset.del);
    const yes = await confirmDialog({
      title: 'Delete from a finished month?',
      message: 'This changes an old month. The deletion is written down.',
      detail: `<b>${esc(entry.title)}</b><br><span class="dim">${esc(pair(entry.amount))} · ${esc(entry.occurred_on)}</span>`
    });
    if (!yes) return;
    try { await saving(() => api.del(`/entries/${entry.id}`)); ok('Deleted'); reload(); }
    catch (err) { fail('Could not delete', err.message); }
  });

  const actions = node(`
    <div class="row" style="gap:8px">
      <button class="btn sm ghost" data-open>Open on the dashboard</button>
      <a class="btn sm ghost" href="#/history">All months</a>
    </div>`);
  actions.querySelector('[data-open]').addEventListener('click', () => { setViewMonth(month); location.hash = '#/'; });

  return {
    title: monthLabel(month),
    subtitle: s.is_current ? 'This month is still going' : 'Finished month — you can still fix things',
    actions,
    el
  };
}

export default { render };
