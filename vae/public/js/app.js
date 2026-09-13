import { state, loadSession, subscribe, clearSession } from './store.js';
import { api } from './api.js';
import { esc, node, toast, fail } from './ui.js';
import { icons } from './icons.js';
import { clockLabel } from './format.js';

import authView from './views/auth.js';
import dashboardView from './views/dashboard.js';
import entriesView from './views/entries.js';
import entryFormView from './views/entryForm.js';
import splitView from './views/split.js';
import historyView from './views/history.js';
import monthView from './views/month.js';
import membersView from './views/members.js';
import roomView from './views/room.js';
import roomEditorView from './views/roomEditor.js';
import settingsView from './views/settings.js';
import activityView from './views/activity.js';

const routes = [
  { path: /^\/?$/, view: dashboardView },
  { path: /^\/entries$/, view: entriesView },
  { path: /^\/entry\/new$/, view: entryFormView },
  { path: /^\/entry\/(\d+)$/, view: entryFormView },
  { path: /^\/split$/, view: splitView },
  { path: /^\/history$/, view: historyView },
  { path: /^\/history\/(\d{4}-\d{2})$/, view: monthView },
  { path: /^\/team$/, view: membersView },
  { path: /^\/activity$/, view: activityView },
  { path: /^\/room\/([a-z0-9_.-]+)\/edit$/, view: roomEditorView },
  { path: /^\/room\/([a-z0-9_.-]+)$/, view: roomView },
  { path: /^\/settings$/, view: settingsView }
];

const NAV = [
  { href: '#/', label: 'Dashboard', icon: 'dashboard' },
  { href: '#/entries', label: 'Payments', icon: 'entries' },
  { href: '#/split', label: 'Split by percent', short: 'Split', icon: 'percent' },
  { href: '#/history', label: 'Months', icon: 'history' },
  { href: '#/team', label: 'The team', short: 'Team', icon: 'team' },
  { href: '#/room/me', label: 'My room', icon: 'room' },
  { href: '#/settings', label: 'Settings', icon: 'settings' }
];

const app = document.getElementById('app');
let shell = null;
let currentToken = 0;

function buildShell() {
  const s = node(`
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">V</div>
          <div>
            <div class="brand-name" data-team></div>
            <div class="brand-sub">Team finance</div>
          </div>
        </div>
        <nav data-nav></nav>
        <div class="nav-spacer"></div>
        <a class="side-user" href="#/settings" data-user></a>
      </aside>
      <div class="main">
        <header class="mobile-head">
          <div class="brand-mark" style="width:30px;height:30px;border-radius:9px;font-size:.85rem">V</div>
          <div class="brand-name" data-team-m></div>
          <a class="btn sm ghost" href="#/settings" style="margin-left:auto">Settings</a>
        </header>
        <header class="topbar">
          <div>
            <h1 data-title>—</h1>
            <div class="topbar-sub" data-subtitle></div>
          </div>
          <div class="topbar-actions">
            <div data-actions class="row"></div>
            <div class="saved-chip" data-saved><span class="saved-dot"></span><span data-saved-text>Saved</span></div>
          </div>
        </header>
        <main class="content" data-content></main>
      </div>
      <nav class="tabbar" data-tabs></nav>
    </div>`);

  const nav = s.querySelector('[data-nav]');
  for (const item of NAV) {
    nav.appendChild(node(`<a class="nav-item" href="${item.href}">${icons[item.icon]}<span>${esc(item.label)}</span></a>`));
  }

  const tabs = s.querySelector('[data-tabs]');
  for (const item of NAV.slice(0, 5)) {
    tabs.appendChild(node(`<a href="${item.href}">${icons[item.icon]}<span>${esc(item.short || item.label)}</span></a>`));
  }
  return s;
}

function paintChrome() {
  if (!shell || !state.me) return;
  const team = state.settings ? state.settings.team_name : 'VAE';
  shell.querySelector('[data-team]').textContent = team;
  shell.querySelector('[data-team-m]').textContent = team;
  shell.querySelector('[data-user]').innerHTML = `
    <div class="avatar" style="background:${esc(state.me.accent)}">${esc(state.me.display_name.slice(0, 1).toUpperCase())}</div>
    <div style="min-width:0">
      <div style="font-weight:560;font-size:.88rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(state.me.display_name)}</div>
      <div class="faint" style="font-size:.74rem">Settings</div>
    </div>`;
  const chip = shell.querySelector('[data-saved]');
  const text = shell.querySelector('[data-saved-text]');
  chip.classList.toggle('saving', state.saving);
  text.textContent = state.saving ? 'Saving…' : state.lastSaved ? `Saved ${clockLabel(state.lastSaved)}` : 'All changes saved';
  const hash = location.hash.slice(1) || '/';
  shell.querySelectorAll('.nav-item, .tabbar a').forEach((a) => {
    const href = a.getAttribute('href').slice(1);
    const active = href === '/' ? hash === '/' : hash.startsWith(href);
    a.classList.toggle('active', active);
  });
}

async function render() {
  const token = ++currentToken;
  const hash = location.hash.slice(1) || '/';

  if (!state.me) {
    try { await loadSession(); }
    catch (err) {
      if (token !== currentToken) return;
      shell = null;
      app.className = '';
      app.innerHTML = '';
      app.appendChild(await authView.render({ onDone: () => { location.hash = '#/'; render(); } }));
      return;
    }
  }

  if (!shell) {
    app.className = '';
    app.innerHTML = '';
    shell = buildShell();
    app.appendChild(shell);
  }
  paintChrome();

  const content = shell.querySelector('[data-content]');
  const match = routes.map((r) => ({ r, m: hash.match(r.path) })).find((x) => x.m);
  if (!match) {
    content.innerHTML = `<div class="panel"><div class="empty"><div class="empty-ico">?</div><h3>Page not found</h3><p>That link does not lead anywhere.</p><a class="btn primary" href="#/">Back to dashboard</a></div></div>`;
    shell.querySelector('[data-title]').textContent = 'Not found';
    shell.querySelector('[data-subtitle]').textContent = '';
    shell.querySelector('[data-actions]').innerHTML = '';
    return;
  }

  content.innerHTML = '<div class="skel" style="height:64vh"></div>';
  try {
    const result = await match.r.view.render({ params: match.m.slice(1), reload: render });
    if (token !== currentToken) return;
    shell.querySelector('[data-title]').textContent = result.title || '';
    shell.querySelector('[data-subtitle]').textContent = result.subtitle || '';
    const actions = shell.querySelector('[data-actions]');
    actions.innerHTML = '';
    if (result.actions) {
      if (typeof result.actions === 'string') actions.innerHTML = result.actions;
      else actions.appendChild(result.actions);
    }
    content.innerHTML = '';
    content.appendChild(result.el);
    content.scrollIntoView({ block: 'start' });
    window.scrollTo({ top: 0 });
  } catch (err) {
    if (token !== currentToken) return;
    if (err.status === 401) { clearSession(); shell = null; return render(); }
    content.innerHTML = `<div class="panel"><div class="empty"><div class="empty-ico neg">!</div><h3>Could not load this page</h3><p>${esc(err.message)}</p><button class="btn" onclick="location.reload()">Try again</button></div></div>`;
  }
}

export async function signOut() {
  try { await api.post('/auth/logout'); } catch (_) {}
  clearSession();
  shell = null;
  location.hash = '#/';
  toast('ok', 'Signed out');
  render();
}

subscribe(paintChrome);
window.addEventListener('hashchange', render);
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason && e.reason.status === 401) { clearSession(); shell = null; render(); }
  else if (e.reason && e.reason.message) fail('Something went wrong', e.reason.message);
});
render();
