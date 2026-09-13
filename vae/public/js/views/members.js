import { api } from '../api.js';
import { esc, node, modal, confirmDialog, setBusy, ok, fail, fieldError, clearErrors } from '../ui.js';
import { money, pct } from '../format.js';
import { state, saving } from '../store.js';
import { monthSwitcher, goMonth } from './common.js';

const ACCENTS = ['#7c5cff', '#3ddc97', '#ff8a5c', '#4cc2ff', '#ff5c8a', '#ffd166', '#9b8cff', '#2fd4c4'];

const showPassword = (title, password) => modal({
  title,
  subtitle: 'Copy it now — it is not shown again.',
  body: `<div class="panel panel-pad mono" style="font-size:1.05rem;text-align:center;letter-spacing:.04em">${esc(password)}</div>
         <p class="hint" style="margin-top:12px">They can change it themselves in Settings after signing in.</p>`,
  footer: '<button class="btn primary" onclick="this.closest(\'.overlay\').remove()">Done</button>'
});

async function render({ reload }) {
  const month = state.viewMonth || state.currentMonth;
  const { members } = await api.get(`/members?month=${month}`);

  const el = node(`
    <div class="stack" style="gap:18px">
      <div class="grid g-3" data-cards></div>
      <p class="hint">Everyone here is a normal member — nobody is the boss. Anyone can add payments, fix them, and change the team settings.</p>
    </div>`);

  el.querySelector('[data-cards]').innerHTML = members.map((m) => {
    const st = m.stats;
    const room = m.room.visibility === 'private'
      ? (m.is_you ? 'Room: private (only you)' : 'Room: private')
      : m.room.edit_access === 'team' ? 'Room: open, team can edit' : 'Room: open to look at';
    return `
      <article class="member-card">
        <div class="glow" style="background:${esc(m.accent)}"></div>
        <div class="member-head">
          <div class="avatar lg" style="background:${esc(m.accent)}">${esc(m.display_name.slice(0, 1).toUpperCase())}</div>
          <div style="min-width:0">
            <div class="member-name">${esc(m.display_name)}${m.is_you ? ' <span class="pill accent" style="font-size:.62rem">you</span>' : ''}${!m.active ? ' <span class="pill neg" style="font-size:.62rem">removed</span>' : ''}</div>
            <div class="member-sub">${esc(room)}</div>
          </div>
        </div>
        <div class="stack-sm" style="margin-top:16px;font-size:.88rem">
          <div class="row" style="justify-content:space-between"><span class="dim">Their money in (USD)</span><b class="num pos">${esc(money(st ? st.earned.usd_cents : 0, 'USD'))}</b></div>
          <div class="row" style="justify-content:space-between"><span class="dim">Their money in (Robux)</span><b class="num pos">${esc(money(st ? st.earned.robux : 0, 'ROBUX'))}</b></div>
          <div class="row" style="justify-content:space-between"><span class="dim">Spent on them</span><b class="num neg">${esc(money(st ? st.spent.usd_cents : 0, 'USD'))}${st && st.spent.robux ? ' + ' + esc(money(st.spent.robux, 'ROBUX')) : ''}</b></div>
          <div class="row" style="justify-content:space-between;border-top:1px solid var(--line);padding-top:8px">
            <span class="dim">Share of what we earned</span><b>${esc(pct(st ? st.share_bp : 0))}</b></div>
        </div>
        <div class="row" style="margin-top:16px;gap:8px">
          <a class="btn sm ${m.room.can_view ? '' : 'ghost'}" href="#/room/${esc(m.username)}">${m.room.can_view ? 'Their room' : 'Room is private'}</a>
          ${m.is_you ? '<button class="btn sm ghost" data-profile>Edit my name</button>' : `<button class="btn sm ghost" data-manage="${m.id}">Help</button>`}
        </div>
      </article>`;
  }).join('');

  const profileBtn = el.querySelector('[data-profile]');
  if (profileBtn) profileBtn.addEventListener('click', () => {
    const me = members.find((m) => m.is_you);
    const m = modal({
      title: 'Your name and colour',
      body: `<form class="stack" data-f novalidate>
        <div class="field"><label for="dn">Name shown to the team</label>
          <input class="input" id="dn" name="display_name" maxlength="40" value="${esc(me.display_name)}"></div>
        <div class="field"><span class="lbl">Your colour</span>
          <div class="swatches">${ACCENTS.map((c) => `<button type="button" class="swatch ${c === me.accent ? 'on' : ''}" data-c="${c}" style="background:${c}"></button>`).join('')}</div>
        </div>
      </form>`,
      footer: '<button class="btn ghost" data-x>Cancel</button><button class="btn primary" data-save>Save</button>'
    });
    let accent = me.accent;
    m.body.querySelectorAll('.swatch').forEach((b) => b.addEventListener('click', () => {
      accent = b.dataset.c;
      m.body.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('on', x === b));
    }));
    m.footer.querySelector('[data-x]').onclick = m.close;
    m.footer.querySelector('[data-save]').onclick = async (e) => {
      const form = m.body.querySelector('[data-f]');
      setBusy(e.target, true);
      try {
        await saving(() => api.put(`/members/${me.id}`, { display_name: form.display_name.value, accent }));
        state.me.display_name = form.display_name.value;
        state.me.accent = accent;
        ok('Saved');
        m.close();
        reload();
      } catch (err) { setBusy(e.target, false); fieldError(form, err.field, err.message); }
    };
  });

  el.querySelectorAll('[data-manage]').forEach((btn) => btn.addEventListener('click', () => {
    const member = members.find((x) => String(x.id) === btn.dataset.manage);
    const m = modal({
      title: `Help ${member.display_name}`,
      subtitle: 'Anyone on the team can do this.',
      body: `<div class="stack">
        <button class="btn ghost" data-reset>Give them a new password</button>
        <button class="btn ${member.active ? 'danger' : ''}" data-active>${member.active ? 'Remove from the team' : 'Bring them back'}</button>
        <p class="hint">Removing someone only blocks signing in. Every payment of theirs stays in the history.</p>
      </div>`,
      footer: '<button class="btn ghost" data-x>Close</button>'
    });
    m.footer.querySelector('[data-x]').onclick = () => { m.close(); reload(); };
    m.body.querySelector('[data-reset]').addEventListener('click', async () => {
      const yes = await confirmDialog({
        title: 'New password?',
        message: `${member.display_name} gets signed out and needs the new password to come back in.`,
        confirmLabel: 'Make one', danger: false
      });
      if (!yes) return;
      const res = await saving(() => api.put(`/members/${member.id}/password`, {}));
      m.close();
      showPassword(`New password for ${member.display_name}`, res.temporary_password);
    });
    m.body.querySelector('[data-active]').addEventListener('click', async () => {
      const yes = await confirmDialog({
        title: member.active ? `Remove ${member.display_name}?` : `Bring ${member.display_name} back?`,
        message: member.active ? 'They cannot sign in any more. Their payments stay.' : 'They can sign in again.',
        confirmLabel: member.active ? 'Remove' : 'Bring back',
        danger: member.active
      });
      if (!yes) return;
      try {
        await saving(() => api.put(`/members/${member.id}/active`, { active: !member.active }));
        ok('Done');
        m.close();
        reload();
      } catch (err) { fail('Could not do that', err.message); }
    });
  }));

  const actions = node('<div class="row" style="gap:8px"></div>');
  actions.appendChild(monthSwitcher(month, goMonth));
  const add = node('<button class="btn primary sm">+ Add someone</button>');
  add.addEventListener('click', () => {
    const m = modal({
      title: 'Add someone to the team',
      subtitle: 'They get an account and their own room.',
      body: `<form class="stack" data-f novalidate>
        <div class="field"><label for="u">Sign-in name</label><input class="input" id="u" name="username" placeholder="memory" required></div>
        <div class="field"><label for="d">Name shown to the team</label><input class="input" id="d" name="display_name" placeholder="Memory"></div>
        <p class="hint">A password is made for them — copy it and send it over. They can change it later.</p>
      </form>`,
      footer: '<button class="btn ghost" data-x>Cancel</button><button class="btn primary" data-save>Add them</button>'
    });
    m.footer.querySelector('[data-x]').onclick = m.close;
    m.footer.querySelector('[data-save]').onclick = async (e) => {
      const form = m.body.querySelector('[data-f]');
      clearErrors(form);
      setBusy(e.target, true, 'Adding…');
      try {
        const res = await saving(() => api.post('/members', Object.fromEntries(new FormData(form).entries())));
        m.close();
        showPassword(`${res.member.display_name} is ready`, res.temporary_password);
        reload();
      } catch (err) { setBusy(e.target, false); err.field ? fieldError(form, err.field, err.message) : fail('Could not add them', err.message); }
    };
  });
  actions.appendChild(add);

  return { title: 'The team', subtitle: `${members.length} of us · numbers are for the month shown`, actions, el };
}

export default { render };
