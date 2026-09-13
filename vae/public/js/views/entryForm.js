import { api } from '../api.js';
import { esc, node, fieldError, clearErrors, setBusy, ok, fail, confirmDialog } from '../ui.js';
import { money, pair, dateTimeLabel, monthLabel } from '../format.js';
import { state, saving } from '../store.js';

const todayInTz = (tz) => {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  catch (_) { return new Date().toISOString().slice(0, 10); }
};

const fmtDiff = (c, v) => {
  if (v === null || v === '') return '—';
  if (c.type === 'usd') return money(v, 'USD');
  if (c.type === 'robux') return money(v, 'ROBUX');
  return String(v);
};

const revisionList = (revisions) => (revisions.length ? `
  <div class="timeline">${revisions.map((r) => `
    <div class="tl-item">
      <div class="tl-dot">✎</div>
      <div class="tl-body">
        <div class="tl-sum">${esc(r.user_name || 'Someone')} changed this</div>
        <div class="tl-meta">${esc(dateTimeLabel(r.created_at))}</div>
        <div class="diff">${r.changes.map((c) => `
          <div class="diff-row">
            <span class="faint" style="min-width:92px">${esc(c.label)}</span>
            <span class="diff-from">${esc(fmtDiff(c, c.from))}</span>
            <span class="faint">→</span>
            <span class="diff-to">${esc(fmtDiff(c, c.to))}</span>
          </div>`).join('')}</div>
      </div>
    </div>`).join('')}</div>`
  : '<p class="hint">Nothing has been changed since it was added.</p>');

async function render({ params }) {
  const id = params[0] ? Number(params[0]) : null;
  const editing = !!id;
  const [{ members }, meta, existing] = await Promise.all([
    api.get('/members'),
    api.get('/meta'),
    editing ? api.get(`/entries/${id}`) : Promise.resolve(null)
  ]);
  const entry = existing ? existing.entry : null;
  let kind = entry ? entry.kind : 'in';

  const el = node(`
    <div class="grid g-main" style="align-items:start">
      <form class="panel" data-form novalidate>
        <div class="panel-head">
          <h2>${editing ? 'Edit payment' : 'New payment'}</h2>
          <div class="spacer"></div>
          <div class="btn-group" data-kind>
            <button type="button" data-k="in" class="${kind === 'in' ? 'on income' : ''}">Money in</button>
            <button type="button" data-k="out" class="${kind === 'out' ? 'on expense' : ''}">Money out</button>
          </div>
        </div>
        <div class="panel-body stack" style="gap:18px">
          <div data-historic></div>

          <div class="field">
            <label for="title">What was it?</label>
            <input class="input" id="title" name="title" maxlength="80" required placeholder="Character pack for a client" value="${esc(entry ? entry.title : '')}">
          </div>

          <div class="field">
            <span class="lbl">How much? <span class="faint">— fill in one or both</span></span>
            <div class="form-grid">
              <div class="field">
                <label for="usd" class="faint">In USD</label>
                <input class="input num" id="usd" name="usd" inputmode="decimal" placeholder="0.00"
                       value="${entry && entry.amount.usd_cents ? (entry.amount.usd_cents / 100).toFixed(2) : ''}">
              </div>
              <div class="field">
                <label for="robux" class="faint">In Robux</label>
                <input class="input num" id="robux" name="robux" inputmode="numeric" placeholder="0"
                       value="${entry && entry.amount.robux ? entry.amount.robux : ''}">
              </div>
            </div>
            <span class="hint">If a payment came as part USD and part Robux, put both in — it stays one payment.</span>
          </div>

          <div class="field">
            <label for="member_id">Whose money is it?</label>
            <select class="input" id="member_id" name="member_id">
              <option value="team" ${entry && !entry.member_id ? 'selected' : ''}>The whole team</option>
              ${members.map((m) => `<option value="${m.id}" ${entry && entry.member_id === m.id ? 'selected' : ''}${!entry && m.id === state.me.id ? ' selected' : ''}>${esc(m.display_name)}${m.is_you ? ' (you)' : ''}</option>`).join('')}
            </select>
            <span class="hint">Put on one of us, it counts as their money <b>and</b> in the team total — it is never taken away from the team.</span>
          </div>

          <div class="form-grid">
            <div class="field">
              <label for="category">Category</label>
              <input class="input" id="category" name="category" list="cats" maxlength="40" value="${esc(entry ? entry.category : '')}">
              <datalist id="cats"></datalist>
            </div>
            <div class="field">
              <label for="occurred_on">Date</label>
              <input class="input" id="occurred_on" name="occurred_on" type="date" required value="${esc(entry ? entry.occurred_on : todayInTz(state.settings.timezone))}">
              <span class="hint" data-monthhint></span>
            </div>
          </div>

          <div class="field">
            <label for="note">Note <span class="faint">(optional)</span></label>
            <textarea class="input" id="note" name="note" maxlength="1000" placeholder="Anything worth remembering">${esc(entry ? entry.note : '')}</textarea>
          </div>
        </div>
        <div class="panel-head" style="border-top:1px solid var(--line);border-bottom:0">
          <button class="btn ghost" type="button" data-cancel>Cancel</button>
          ${editing ? '<button class="btn danger" type="button" data-delete>Delete</button>' : ''}
          <div class="spacer"></div>
          <button class="btn primary" type="submit">${editing ? 'Save' : 'Add it'}</button>
        </div>
      </form>

      <div class="stack" style="gap:18px">
        <section class="panel">
          <div class="panel-head"><h2>Preview</h2></div>
          <div class="panel-body" data-preview></div>
        </section>
        ${editing ? `
        <section class="panel">
          <div class="panel-head"><h2>What changed</h2></div>
          <div class="panel-body" data-revisions>${revisionList(existing.revisions)}</div>
        </section>
        <section class="panel">
          <div class="panel-body stack-sm" style="font-size:.84rem">
            <div class="row" style="justify-content:space-between"><span class="dim">Added by</span><span>${esc(entry.created_by_name || '—')}</span></div>
            <div class="row" style="justify-content:space-between"><span class="dim">Added</span><span>${esc(dateTimeLabel(entry.created_at))}</span></div>
            <div class="row" style="justify-content:space-between"><span class="dim">Last change</span><span>${esc(entry.updated_by_name || '—')} · ${esc(dateTimeLabel(entry.updated_at))}</span></div>
            ${entry.percent_bp ? `<div class="row" style="justify-content:space-between"><span class="dim">From a split</span><span>${entry.percent_bp / 100}% of ${esc(pair(entry.of_amount))}</span></div>` : ''}
          </div>
        </section>` : ''}
      </div>
    </div>`);

  const form = el.querySelector('[data-form]');
  const preview = el.querySelector('[data-preview]');
  const monthHint = el.querySelector('[data-monthhint]');
  const historic = el.querySelector('[data-historic]');

  function paintCategories() {
    const list = kind === 'in' ? meta.earning_categories : meta.spending_categories;
    el.querySelector('#cats').innerHTML = list.map((c) => `<option value="${esc(c)}"></option>`).join('');
    if (!form.category.value) form.category.value = list[0];
  }

  function paintPreview() {
    const amount = {
      usd_cents: Math.round((parseFloat(form.usd.value) || 0) * 100),
      robux: Math.round(parseFloat(form.robux.value) || 0)
    };
    const memberName = form.member_id.value === 'team'
      ? 'The whole team'
      : (members.find((m) => String(m.id) === form.member_id.value) || {}).display_name;
    preview.innerHTML = `
      <div class="stat" style="--tint:${kind === 'in' ? 'var(--pos)' : 'var(--neg)'}">
        <div class="stat-label">${kind === 'in' ? 'Money in' : 'Money out'}</div>
        <div class="amount-lines">
          ${amount.usd_cents ? `<div class="amount-line ${kind === 'in' ? 'pos' : 'neg'}"><span class="cur">USD</span><b class="num">${esc(money(amount.usd_cents, 'USD'))}</b></div>` : ''}
          ${amount.robux ? `<div class="amount-line ${kind === 'in' ? 'pos' : 'neg'}"><span class="cur">Robux</span><b class="num">${esc(money(amount.robux, 'ROBUX'))}</b></div>` : ''}
          ${!amount.usd_cents && !amount.robux ? '<div class="amount-line muted"><span class="cur">—</span><b>no amount yet</b></div>' : ''}
        </div>
        <div class="stat-foot">
          <span class="pill">${esc(form.title.value.trim() || 'Untitled')}</span>
          <span class="pill">${esc(memberName || '—')}</span>
        </div>
      </div>`;

    const date = form.occurred_on.value;
    if (date) {
      const mk = date.slice(0, 7);
      monthHint.textContent = `Goes into ${monthLabel(mk)}`;
      historic.innerHTML = mk < state.currentMonth
        ? `<div class="big-note" style="border-color:rgba(255,200,87,.35);background:rgba(255,200,87,.06)">
             This lands in <b>${esc(monthLabel(mk))}</b>, a month that already finished. That is fine — old months stay open for fixes, and the change is written down.
           </div>` : '';
    }
  }

  el.querySelectorAll('[data-kind] button').forEach((b) => b.addEventListener('click', () => {
    kind = b.dataset.k;
    el.querySelectorAll('[data-kind] button').forEach((x) => { x.className = x === b ? `on ${kind === 'in' ? 'income' : 'expense'}` : ''; });
    form.category.value = '';
    paintCategories();
    paintPreview();
  }));
  form.addEventListener('input', paintPreview);
  form.addEventListener('change', paintPreview);
  el.querySelector('[data-cancel]').addEventListener('click', () => { history.length > 1 ? history.back() : (location.hash = '#/entries'); });

  const del = el.querySelector('[data-delete]');
  if (del) del.addEventListener('click', async () => {
    const yes = await confirmDialog({
      title: 'Delete this payment?',
      message: 'It comes off the totals. The deletion stays in the changes list.',
      detail: `<b>${esc(entry.title)}</b><br><span class="dim">${esc(pair(entry.amount))}</span>`
    });
    if (!yes) return;
    await saving(() => api.del(`/entries/${id}`));
    ok('Deleted');
    location.hash = '#/entries';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);
    const btn = form.querySelector('button[type=submit]');
    const body = { ...Object.fromEntries(new FormData(form).entries()), kind };
    setBusy(btn, true);
    try {
      const res = await saving(() => (editing ? api.put(`/entries/${id}`, body) : api.post('/entries', body)));
      ok(editing ? 'Saved' : 'Added', `${res.entry.title} · ${pair(res.entry.amount)}`);
      if (editing) {
        el.querySelector('[data-revisions]').innerHTML = revisionList(res.revisions);
        setBusy(btn, false);
      } else location.hash = '#/entries';
    } catch (err) {
      setBusy(btn, false);
      if (err.field) fieldError(form, err.field, err.message);
      else fail('Could not save', err.message);
    }
  });

  paintCategories();
  paintPreview();

  return {
    title: editing ? 'Edit payment' : 'Add a payment',
    subtitle: 'USD, Robux, or both on the same payment',
    actions: '<a class="btn sm ghost" href="#/entries">Back</a>',
    el
  };
}

export default { render };
