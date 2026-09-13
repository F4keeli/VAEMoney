import { api, qs } from '../api.js';
import { esc, node, emptyState, confirmDialog, ok, fail } from '../ui.js';
import { pair } from '../format.js';
import { state, saving } from '../store.js';
import { monthSwitcher, entriesTable, amountCard, goMonth } from './common.js';

const filters = { kind: '', member_id: '', q: '' };

async function render({ reload }) {
  const month = state.viewMonth || state.currentMonth;
  const [{ entries }, { members }, { summary }] = await Promise.all([
    api.get(`/entries${qs({ month, ...filters })}`),
    api.get('/members'),
    api.get(`/summary?month=${month}`)
  ]);

  const shown = { usd_cents: 0, robux: 0 };
  for (const e of entries) { shown.usd_cents += e.amount.usd_cents; shown.robux += e.amount.robux; }
  const filtered = Object.values(filters).some(Boolean);

  const el = node(`
    <div class="stack" style="gap:18px">
      <div class="panel">
        <div class="panel-head" style="flex-wrap:wrap;gap:10px">
          <div class="btn-group" data-kind>
            <button data-k="" class="${filters.kind === '' ? 'on' : ''}">Everything</button>
            <button data-k="in" class="${filters.kind === 'in' ? 'on income' : ''}">Money in</button>
            <button data-k="out" class="${filters.kind === 'out' ? 'on expense' : ''}">Money out</button>
          </div>
          <select class="input" data-f="member_id" style="width:auto;min-width:160px">
            <option value="">Everyone</option>
            <option value="team" ${filters.member_id === 'team' ? 'selected' : ''}>The team only</option>
            ${members.map((m) => `<option value="${m.id}" ${String(filters.member_id) === String(m.id) ? 'selected' : ''}>${esc(m.display_name)}</option>`).join('')}
          </select>
          <input class="input" data-f="q" placeholder="Search" value="${esc(filters.q)}" style="width:auto;flex:1;min-width:150px">
          ${filtered ? '<button class="btn sm ghost" data-clear>Clear</button>' : ''}
        </div>
        <div class="panel-body row" style="justify-content:space-between;gap:14px">
          <span class="dim" style="font-size:.88rem">Showing <b>${entries.length}</b> payment${entries.length === 1 ? '' : 's'} worth <b class="num">${esc(pair(shown, { empty: 'nothing' }))}</b></span>
          <a class="btn sm primary" href="#/entry/new">+ Add a payment</a>
        </div>
      </div>
      <div class="panel" data-list></div>
    </div>`);

  const list = el.querySelector('[data-list]');
  list.innerHTML = entries.length
    ? entriesTable(entries)
    : emptyState({
        icon: '∅',
        title: filtered ? 'Nothing matches' : 'No payments this month',
        text: filtered ? 'Try clearing the filters or picking another month.' : 'Everything the team gets or spends goes here.',
        action: '<a class="btn primary" href="#/entry/new">Add a payment</a>'
      });

  el.querySelectorAll('[data-kind] button').forEach((b) => b.addEventListener('click', () => { filters.kind = b.dataset.k; reload(); }));
  el.querySelectorAll('[data-f]').forEach((i) => i.addEventListener('change', () => { filters[i.dataset.f] = i.value.trim(); reload(); }));
  const clear = el.querySelector('[data-clear]');
  if (clear) clear.addEventListener('click', () => { Object.keys(filters).forEach((k) => { filters[k] = ''; }); reload(); });

  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-del]');
    if (!btn) return;
    const entry = entries.find((x) => String(x.id) === btn.dataset.del);
    const yes = await confirmDialog({
      title: 'Delete this payment?',
      message: 'It will come off the totals. The deletion is kept in the changes list.',
      detail: `<b>${esc(entry.title)}</b><br><span class="dim">${esc(pair(entry.amount))} · ${esc(entry.occurred_on)}</span>`
    });
    if (!yes) return;
    try {
      await saving(() => api.del(`/entries/${entry.id}`));
      ok('Deleted', entry.title);
      reload();
    } catch (err) { fail('Could not delete', err.message); }
  });

  const actions = node('<div class="row" style="gap:8px"></div>');
  actions.appendChild(monthSwitcher(month, goMonth));

  return { title: 'Payments', subtitle: 'Everything in and out, newest first', actions, el };
}

export default { render };
