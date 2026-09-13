import { api } from '../api.js';
import { esc, node, emptyState, confirmDialog, setBusy, ok, fail, fieldError, clearErrors } from '../ui.js';
import { money, pair, pct, dateLabel } from '../format.js';
import { state, saving } from '../store.js';
import { monthSwitcher, goMonth } from './common.js';

const todayInTz = (tz) => {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  catch (_) { return new Date().toISOString().slice(0, 10); }
};

async function render({ reload }) {
  const month = state.viewMonth || state.currentMonth;
  const [{ members }, { entries }] = await Promise.all([
    api.get('/members'),
    api.get(`/entries?month=${month}`)
  ]);

  // Payments created by a split are grouped back together for display.
  const groups = new Map();
  for (const e of entries.filter((x) => x.split_id)) {
    if (!groups.has(e.split_id)) {
      groups.set(e.split_id, { id: e.split_id, label: e.split_label, of: e.of_amount, date: e.occurred_on, parts: [] });
    }
    groups.get(e.split_id).parts.push(e);
  }
  const splits = [...groups.values()];

  const el = node(`
    <div class="grid g-main" style="align-items:start">
      <form class="panel" data-form novalidate>
        <div class="panel-head"><h2>Share a payment by percent</h2></div>
        <div class="panel-body stack" style="gap:18px">
          <div class="field">
            <label for="title">What is being shared?</label>
            <input class="input" id="title" name="title" maxlength="60" required placeholder="Game revenue for this month">
          </div>

          <div class="field">
            <span class="lbl">How much is there to share? <span class="faint">— one or both</span></span>
            <div class="form-grid">
              <div class="field"><label for="usd" class="faint">In USD</label>
                <input class="input num" id="usd" name="usd" inputmode="decimal" placeholder="0.00"></div>
              <div class="field"><label for="robux" class="faint">In Robux</label>
                <input class="input num" id="robux" name="robux" inputmode="numeric" placeholder="0"></div>
            </div>
          </div>

          <div class="field">
            <span class="lbl">Who gets what percent?</span>
            <div class="stack-sm" data-shares></div>
          </div>

          <div class="panel panel-pad" data-out style="background:var(--panel)"></div>

          <div class="form-grid">
            <div class="field">
              <label for="occurred_on">Date</label>
              <input class="input" id="occurred_on" name="occurred_on" type="date" required value="${esc(todayInTz(state.settings.timezone))}">
            </div>
            <div class="field">
              <label for="category">Category</label>
              <input class="input" id="category" name="category" maxlength="40" value="Revenue share">
            </div>
          </div>
        </div>
        <div class="panel-head" style="border-top:1px solid var(--line);border-bottom:0">
          <div class="spacer"></div>
          <button class="btn primary" type="submit">Save these payments</button>
        </div>
      </form>

      <div class="stack" style="gap:18px">
        <section class="panel">
          <div class="panel-head"><h2>How this works</h2></div>
          <div class="panel-body stack-sm" style="font-size:.86rem;color:var(--text-dim)">
            <p>· Put in the total, then give each of us a percent.</p>
            <p>· Each share is saved as that person's own payment, so it shows up in their money and in the team total.</p>
            <p>· Whatever percent is left over stays with the team.</p>
          </div>
        </section>
        <section class="panel">
          <div class="panel-head"><h2>Splits this month</h2></div>
          <div class="panel-body" data-list></div>
        </section>
      </div>
    </div>`);

  const form = el.querySelector('[data-form]');
  const sharesBox = el.querySelector('[data-shares]');
  const out = el.querySelector('[data-out]');
  const list = el.querySelector('[data-list]');

  sharesBox.innerHTML = members.map((m) => `
    <div class="split-row">
      <div class="avatar" style="width:28px;height:28px;border-radius:9px;font-size:.74rem;background:${esc(m.accent)}">${esc(m.display_name.slice(0, 1).toUpperCase())}</div>
      <span style="min-width:0;font-size:.9rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.display_name)}${m.is_you ? ' <span class="faint">(you)</span>' : ''}</span>
      <div class="row" style="gap:6px;flex-wrap:nowrap">
        <input class="input num" data-share="${m.id}" inputmode="decimal" placeholder="0" style="width:86px;text-align:right">
        <span class="faint">%</span>
      </div>
    </div>`).join('');

  const readShares = () => [...sharesBox.querySelectorAll('[data-share]')]
    .map((i) => ({ member_id: Number(i.dataset.share), percent: i.value.trim() }))
    .filter((s) => s.percent !== '' && parseFloat(s.percent) > 0);

  function paintOut() {
    const total = {
      usd_cents: Math.round((parseFloat(form.usd.value) || 0) * 100),
      robux: Math.round(parseFloat(form.robux.value) || 0)
    };
    const shares = readShares();
    const rows = shares.map((s) => {
      const m = members.find((x) => x.id === s.member_id);
      const p = parseFloat(s.percent) || 0;
      return {
        name: m ? m.display_name : '—', accent: m ? m.accent : '#666', percent: p,
        amount: { usd_cents: Math.round((total.usd_cents * p) / 100), robux: Math.round((total.robux * p) / 100) }
      };
    });
    const usedPct = rows.reduce((a, b) => a + b.percent, 0);
    const left = {
      usd_cents: total.usd_cents - rows.reduce((a, b) => a + b.amount.usd_cents, 0),
      robux: total.robux - rows.reduce((a, b) => a + b.amount.robux, 0)
    };
    const over = usedPct > 100;
    out.innerHTML = `
      <div class="row" style="justify-content:space-between;margin-bottom:10px">
        <b style="font-size:.88rem">Everyone gets</b>
        <span class="pill ${over ? 'neg' : usedPct === 100 ? 'pos' : ''}">${esc(String(Math.round(usedPct * 100) / 100))}% used</span>
      </div>
      ${rows.length ? `<div class="split-out">${rows.map((r) => `
        <div class="row" style="justify-content:space-between;font-size:.88rem">
          <span><i style="display:inline-block;width:8px;height:8px;border-radius:3px;background:${esc(r.accent)};margin-right:8px"></i>${esc(r.name)} <span class="faint">${esc(String(r.percent))}%</span></span>
          <b class="num">${esc(pair(r.amount, { empty: '—' }))}</b>
        </div>`).join('')}
        <div class="row" style="justify-content:space-between;font-size:.88rem;border-top:1px solid var(--line);padding-top:9px">
          <span class="dim">Left with the team</span><b class="num">${esc(pair(left, { empty: '—' }))}</b>
        </div>
      </div>` : '<p class="hint">Type a percent next to someone to see what they get.</p>'}
      ${over ? '<div class="err" style="margin-top:10px">⚠ That is more than 100% of the payment.</div>' : ''}`;
  }

  function paintList() {
    list.innerHTML = splits.length
      ? `<div class="stack">${splits.map((g) => `
          <div class="panel panel-pad" style="background:var(--panel)">
            <div class="row" style="justify-content:space-between;gap:10px">
              <div style="min-width:0">
                <b>${esc(g.label || 'Split')}</b>
                <div class="faint" style="font-size:.76rem">${esc(pair(g.of))} · ${esc(dateLabel(g.date))}</div>
              </div>
              <button class="btn sm ghost" data-unsplit="${esc(g.id)}">✕</button>
            </div>
            <div class="stack-sm" style="margin-top:10px">
              ${g.parts.map((p) => `
                <div class="row" style="justify-content:space-between;font-size:.85rem">
                  <span class="dim">${esc(p.member_name || 'The team')} · ${esc(pct(p.percent_bp))}</span>
                  <span class="num pos">${esc(pair(p.amount))}</span>
                </div>`).join('')}
            </div>
          </div>`).join('')}</div>`
      : emptyState({ icon: '%', title: 'No splits this month', text: 'Splits you save show up here.' });

    list.querySelectorAll('[data-unsplit]').forEach((b) => b.addEventListener('click', async () => {
      const g = splits.find((x) => x.id === b.dataset.unsplit);
      const yes = await confirmDialog({
        title: `Undo “${g.label}”?`,
        message: `All ${g.parts.length} payments made by this split are deleted.`,
        confirmLabel: 'Delete them'
      });
      if (!yes) return;
      try {
        await saving(() => api.del(`/splits/${g.id}`));
        ok('Split removed');
        reload();
      } catch (err) { fail('Could not remove it', err.message); }
    }));
  }

  form.addEventListener('input', paintOut);
  sharesBox.addEventListener('input', paintOut);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);
    const btn = form.querySelector('button[type=submit]');
    setBusy(btn, true);
    try {
      const res = await saving(() => api.post('/splits', {
        title: form.title.value,
        usd: form.usd.value,
        robux: form.robux.value,
        occurred_on: form.occurred_on.value,
        category: form.category.value,
        shares: readShares()
      }));
      ok('Split saved', `${res.entries.length} payment${res.entries.length === 1 ? '' : 's'} added.`);
      reload();
    } catch (err) {
      setBusy(btn, false);
      if (err.field === 'shares') out.insertAdjacentElement('afterend', node(`<div class="err">⚠ ${esc(err.message)}</div>`));
      else if (err.field) fieldError(form, err.field, err.message);
      else fail('Could not save', err.message);
    }
  });

  paintOut();
  paintList();

  const actions = node('<div class="row" style="gap:8px"></div>');
  actions.appendChild(monthSwitcher(month, goMonth));

  return { title: 'Split by percent', subtitle: 'Pick the percent, put in the amount — we do the maths', actions, el };
}

export default { render };
