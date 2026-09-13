import { api } from '../api.js';
import { esc, node, fieldError, clearErrors, setBusy, ok, modal } from '../ui.js';

const FEATURES = [
  ['One place for all of us', 'Same link, same numbers — what one of us adds, everyone sees.'],
  ['USD and Robux together', 'A payment can be part USD and part Robux. Both are kept on their own line.'],
  ['Your money and the team’s', 'A payment put on you counts as yours and in the team total.'],
  ['Months look after themselves', 'A fresh month on the 1st, and every old month kept.']
];

async function render({ onDone }) {
  const boot = await api.get('/auth/bootstrap');
  let mode = boot.needs_setup ? 'register' : 'login';

  const wrap = node(`
    <div class="auth">
      <section class="auth-art">
        <div class="halo" style="width:420px;height:420px;background:#7c5cff;top:-90px;left:-120px"></div>
        <div class="halo" style="width:360px;height:360px;background:#3ddc97;bottom:-120px;right:-90px;opacity:.22"></div>
        <div style="position:relative">
          <div class="brand" style="padding-left:0">
            <div class="brand-mark">V</div>
            <div>
              <div class="brand-name">${esc(boot.team_name)}</div>
              <div class="brand-sub">Team finance</div>
            </div>
          </div>
          <h1 style="font-size:2.1rem;max-width:15ch;margin-top:26px">Every Robux and dollar, in one place.</h1>
          <p class="dim" style="margin-top:14px;max-width:42ch">Earnings, expenses, percentage splits and member payouts — month by month, for the whole team.</p>
        </div>
        <div class="stack" style="position:relative;gap:18px">
          ${FEATURES.map(([t, d]) => `
            <div class="feature"><span class="pill accent" style="margin-top:2px">✦</span><span><b>${esc(t)}</b>${esc(d)}</span></div>`).join('')}
        </div>
      </section>
      <section class="auth-form-wrap">
        <div class="auth-card">
          <div data-head></div>
          <div class="auth-tabs" data-tabs ${boot.needs_setup ? 'hidden' : ''}>
            <button data-mode="login">Sign in</button>
            <button data-mode="register">Create account</button>
          </div>
          <form class="stack" data-form novalidate></form>
          <p class="hint" data-foot></p>
        </div>
      </section>
    </div>`);

  const form = wrap.querySelector('[data-form]');
  const head = wrap.querySelector('[data-head]');
  const foot = wrap.querySelector('[data-foot]');

  function paint() {
    wrap.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    head.innerHTML = boot.needs_setup
      ? `<h2 style="font-size:1.35rem">Start the team</h2><p class="dim" style="font-size:.9rem;margin-top:6px">Make the first account, then share the link and the team code with the others.</p>`
      : mode === 'login'
        ? `<h2 style="font-size:1.35rem">Welcome back</h2><p class="dim" style="font-size:.9rem;margin-top:6px">Sign in to ${esc(boot.team_name)}.</p>`
        : `<h2 style="font-size:1.35rem">Join ${esc(boot.team_name)}</h2><p class="dim" style="font-size:.9rem;margin-top:6px">Create your account and your personal room.</p>`;

    form.innerHTML = `
      ${mode === 'register' ? `
        <div class="field">
          <label for="dn">Display name</label>
          <input class="input" id="dn" name="display_name" autocomplete="name" placeholder="Ansel" maxlength="40">
        </div>` : ''}
      <div class="field">
        <label for="un">Username</label>
        <input class="input" id="un" name="username" autocomplete="username" placeholder="ansel" required>
      </div>
      <div class="field">
        <label for="pw">Password</label>
        <input class="input" id="pw" name="password" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" placeholder="${mode === 'login' ? 'Your password' : 'At least 8 characters'}" required>
      </div>
      ${mode === 'register' ? `
        <div class="field">
          <label for="pw2">Confirm password</label>
          <input class="input" id="pw2" name="password2" type="password" autocomplete="new-password" required>
        </div>` : ''}
      ${mode === 'register' && !boot.needs_setup ? `
        <div class="field">
          <label for="ic">Team code</label>
          <input class="input" id="ic" name="join_code" placeholder="Ask someone on the team" required>
          <span class="hint">It is in Settings on anyone's screen.</span>
        </div>` : ''}
      <button class="btn primary block" type="submit" style="margin-top:4px">
        ${boot.needs_setup ? 'Create the team' : mode === 'login' ? 'Sign in' : 'Create my account'}
      </button>`;

    foot.textContent = mode === 'login'
      ? 'Passwords are stored as bcrypt hashes — never in plain text.'
      : 'Everyone here is a normal member. There is no boss account.';
  }

  wrap.querySelectorAll('[data-mode]').forEach((b) => {
    b.addEventListener('click', () => { mode = b.dataset.mode; paint(); });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);
    const btn = form.querySelector('button[type=submit]');
    const body = Object.fromEntries(new FormData(form).entries());
    if (mode === 'register' && body.password !== body.password2) {
      return fieldError(form, 'password2', 'Those two passwords do not match.');
    }
    setBusy(btn, true, mode === 'login' ? 'Signing in…' : 'Creating…');
    try {
      const res = await api.post(mode === 'login' ? '/auth/login' : '/auth/register', body);
      if (res.join_code) {
        // First account: the team code is shown once, right here.
        const m = modal({
          title: 'Your team code',
          subtitle: 'The others need this to make their accounts. It is always in Settings too.',
          body: `<div class="panel panel-pad mono" style="font-size:1.2rem;text-align:center;letter-spacing:.2em">${esc(res.join_code)}</div>`,
          footer: '<button class="btn primary" data-go>Got it</button>'
        });
        m.footer.querySelector('[data-go]').onclick = () => { m.close(); onDone(); };
        return;
      }
      ok(mode === 'login' ? 'Signed in' : 'Account made', mode === 'login' ? '' : 'Your room is ready.');
      onDone();
    } catch (err) {
      setBusy(btn, false);
      if (err.field) fieldError(form, err.field, err.message);
      else {
        form.querySelectorAll('.err').forEach((x) => x.remove());
        form.insertBefore(node(`<div class="err">⚠ ${esc(err.message)}</div>`), form.firstChild);
      }
    }
  });

  paint();
  return wrap;
}

export default { render };
