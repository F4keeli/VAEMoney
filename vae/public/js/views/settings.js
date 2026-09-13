import { api } from '../api.js';
import { esc, node, confirmDialog, setBusy, ok, fail, fieldError, clearErrors, debounce, modal } from '../ui.js';
import { state, saving, loadSession } from '../store.js';
import { signOut } from '../app.js';

function timezones(current) {
  let list = [];
  try { list = Intl.supportedValuesOf('timeZone'); } catch (_) {
    list = ['UTC', 'Europe/Berlin', 'Europe/London', 'Europe/Paris', 'America/New_York',
      'America/Chicago', 'America/Los_Angeles', 'Africa/Casablanca', 'Asia/Dubai', 'Asia/Tokyo'];
  }
  if (!list.includes(current)) list.unshift(current);
  return list;
}

async function render({ reload }) {
  const data = await api.get('/settings');
  const s = data.settings;

  const el = node(`
    <div class="grid g-main" style="align-items:start">
      <div class="stack" style="gap:18px">
        <section class="panel">
          <div class="panel-head"><h2>The team</h2><div class="spacer"></div><span class="pill" data-state>Saved</span></div>
          <div class="panel-body stack" style="gap:16px">
            <div class="field">
              <label for="team_name">Team name</label>
              <input class="input" id="team_name" value="${esc(s.team_name)}" maxlength="40">
            </div>
            <div class="field">
              <label for="timezone">Timezone</label>
              <select class="input" id="timezone">
                ${timezones(s.timezone).map((z) => `<option ${z === s.timezone ? 'selected' : ''}>${esc(z)}</option>`).join('')}
              </select>
              <span class="hint">A new month starts at midnight on the 1st here. Right now it is <b>${esc(data.today)}</b>.</span>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Robux to USD</h2></div>
          <div class="panel-body stack" style="gap:16px">
            <label class="switch">
              <input type="checkbox" id="conversion_enabled" ${s.conversion_enabled ? 'checked' : ''}>
              <span class="switch-track"></span>
              <span class="switch-text"><b>Also show one combined number</b>
                <span class="hint">USD and Robux always stay on their own lines. This just adds a rough "all together" figure.</span></span>
            </label>
            <div class="field">
              <label for="robux_rate">USD for 1 Robux</label>
              <input class="input num" id="robux_rate" value="${esc(s.robux_rate)}" inputmode="decimal">
              <span class="hint" data-rate-hint></span>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Team code</h2></div>
          <div class="panel-body stack" style="gap:14px">
            <p class="dim" style="font-size:.88rem">Anyone who opens the link needs this code to make an account. Send it to the team, and change it whenever you want.</p>
            <div class="row" style="gap:12px">
              <span class="code-chip">${esc(s.join_code || 'none')}</span>
              <button class="btn ghost" data-copy>Copy</button>
              <button class="btn ghost" data-newcode>New code</button>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Example data</h2></div>
          <div class="panel-body stack" style="gap:12px">
            <p class="dim" style="font-size:.88rem">${data.sample_loaded
              ? 'Example payments are loaded. Removing them leaves anything you added alone.'
              : 'Three months of made-up payments so you can see how it all works. Delete them whenever.'}</p>
            <div class="row">
              ${data.sample_loaded
                ? '<button class="btn danger" data-sample-clear>Remove the example data</button>'
                : '<button class="btn" data-sample-load>Load example data</button>'}
            </div>
          </div>
        </section>
      </div>

      <div class="stack" style="gap:18px">
        <section class="panel">
          <div class="panel-head"><h2>You</h2></div>
          <div class="panel-body stack" style="gap:14px">
            <div class="row" style="gap:12px">
              <div class="avatar lg" style="background:${esc(state.me.accent)}">${esc(state.me.display_name.slice(0, 1).toUpperCase())}</div>
              <div>
                <div style="font-weight:580">${esc(state.me.display_name)}</div>
                <div class="faint" style="font-size:.8rem">signs in as ${esc(state.me.username)}</div>
              </div>
            </div>
            <button class="btn ghost" data-password>Change my password</button>
            <a class="btn ghost" href="#/room/me">My room</a>
            <button class="btn ghost" data-signout>Sign out</button>
          </div>
        </section>
        <section class="panel">
          <div class="panel-head"><h2>How the months work</h2></div>
          <div class="panel-body stack-sm" style="font-size:.85rem;color:var(--text-dim)">
            <p>· A month runs from the 1st to the last day.</p>
            <p>· On the 1st the dashboard starts fresh and last month moves to Months.</p>
            <p>· Nothing is deleted — you can still open and fix any old month.</p>
            <p>· Every add, change and delete says who did it.</p>
          </div>
        </section>
      </div>
    </div>`);

  const stateChip = el.querySelector('[data-state]');
  const rateHint = el.querySelector('[data-rate-hint]');
  const paintRate = () => {
    const rate = parseFloat(el.querySelector('#robux_rate').value) || 0;
    rateHint.innerHTML = `R$100,000 would be about <b>$${(100000 * rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>. Roblox pays out at $0.0035.`;
  };
  paintRate();

  const push = debounce(async (patch) => {
    stateChip.textContent = 'Saving…';
    try {
      await saving(() => api.put('/settings', patch));
      await loadSession();
      stateChip.textContent = 'Saved';
      paintRate();
    } catch (err) {
      stateChip.textContent = 'Not saved';
      fail('Could not save', err.message);
    }
  }, 600);

  el.querySelector('#team_name').addEventListener('input', (e) => push({ team_name: e.target.value }));
  el.querySelector('#timezone').addEventListener('change', (e) => push({ timezone: e.target.value }));
  el.querySelector('#robux_rate').addEventListener('input', (e) => { paintRate(); push({ robux_rate: e.target.value }); });
  el.querySelector('#conversion_enabled').addEventListener('change', (e) => push({ conversion_enabled: e.target.checked }));

  el.querySelector('[data-copy]').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(s.join_code); ok('Code copied'); }
    catch (_) { fail('Could not copy', 'Select it and copy by hand.'); }
  });
  el.querySelector('[data-newcode]').addEventListener('click', async () => {
    const yes = await confirmDialog({
      title: 'Make a new team code?',
      message: 'The old code stops working. Anyone already signed in stays signed in.',
      confirmLabel: 'Make a new one', danger: false
    });
    if (!yes) return;
    await saving(() => api.post('/settings/new-code'));
    ok('New code made');
    reload();
  });

  const load = el.querySelector('[data-sample-load]');
  if (load) load.addEventListener('click', async () => {
    setBusy(load, true, 'Loading…');
    try {
      const res = await saving(() => api.post('/sample'));
      ok('Example data added', `${res.loaded.entries} payments across 3 months.`);
      reload();
    } catch (err) { setBusy(load, false); fail('Could not load it', err.message); }
  });
  const clear = el.querySelector('[data-sample-clear]');
  if (clear) clear.addEventListener('click', async () => {
    const yes = await confirmDialog({
      title: 'Remove the example data?',
      message: 'Only the example payments go. Everything you added stays.',
      confirmLabel: 'Remove them'
    });
    if (!yes) return;
    const res = await saving(() => api.del('/sample'));
    ok('Example data removed', `${res.removed.entries} payments deleted.`);
    reload();
  });

  el.querySelector('[data-signout]').addEventListener('click', signOut);
  el.querySelector('[data-password]').addEventListener('click', () => {
    const m = modal({
      title: 'Change your password',
      body: `<form class="stack" data-f novalidate>
        <div class="field"><label for="cp">Password now</label><input class="input" id="cp" name="current_password" type="password" autocomplete="current-password"></div>
        <div class="field"><label for="np">New password</label><input class="input" id="np" name="new_password" type="password" autocomplete="new-password" placeholder="At least 8 characters"></div>
        <div class="field"><label for="np2">New password again</label><input class="input" id="np2" name="confirm" type="password" autocomplete="new-password"></div>
      </form>`,
      footer: '<button class="btn ghost" data-x>Cancel</button><button class="btn primary" data-save>Change it</button>'
    });
    m.footer.querySelector('[data-x]').onclick = m.close;
    m.footer.querySelector('[data-save]').onclick = async (e) => {
      const form = m.body.querySelector('[data-f]');
      clearErrors(form);
      if (form.new_password.value !== form.confirm.value) return fieldError(form, 'confirm', 'Those two do not match.');
      setBusy(e.target, true);
      try {
        await api.post('/auth/password', { current_password: form.current_password.value, new_password: form.new_password.value });
        m.close();
        ok('Password changed', 'Other devices were signed out.');
      } catch (err) {
        setBusy(e.target, false);
        err.field ? fieldError(form, err.field, err.message) : fail('Could not change it', err.message);
      }
    };
  });

  return { title: 'Settings', subtitle: 'Anyone on the team can change these', el };
}

export default { render };
