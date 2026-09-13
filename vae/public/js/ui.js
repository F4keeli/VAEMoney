export const esc = (v) => String(v === null || v === undefined ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function node(html) {
  const t = document.createElement('template');
  t.innerHTML = String(html).trim();
  return t.content.firstElementChild;
}

export function nodes(html) {
  const t = document.createElement('template');
  t.innerHTML = String(html).trim();
  return [...t.content.children];
}

export function el(tag, attrs = {}, html = '') {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'style') n.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v);
  }
  if (html) n.innerHTML = html;
  return n;
}

/* ------------------------------------------------------------- toasts */
const TOAST_ICONS = { ok: '✓', err: '!', info: 'i' };
export function toast(type, title, message = '', ms = 4200) {
  const root = document.getElementById('toasts');
  const t = node(`
    <div class="toast ${esc(type)}">
      <span class="t-ico ${type === 'ok' ? 'pos' : type === 'err' ? 'neg' : 'dim'}">${TOAST_ICONS[type] || 'i'}</span>
      <div class="t-body">
        <div class="t-title">${esc(title)}</div>
        ${message ? `<div class="t-msg">${esc(message)}</div>` : ''}
      </div>
      <button aria-label="Dismiss">×</button>
    </div>`);
  const close = () => {
    t.style.transition = 'opacity .18s, transform .18s';
    t.style.opacity = '0';
    t.style.transform = 'translateY(6px)';
    setTimeout(() => t.remove(), 200);
  };
  t.querySelector('button').addEventListener('click', close);
  root.appendChild(t);
  setTimeout(close, ms);
  return close;
}
export const ok = (title, msg) => toast('ok', title, msg);
export const fail = (title, msg) => toast('err', title, msg, 6000);

/* ------------------------------------------------------------- modals */
export function modal({ title, subtitle = '', body, footer = '', width }) {
  const root = document.getElementById('modal-root');
  const overlay = node(`
    <div class="overlay" role="dialog" aria-modal="true">
      <div class="modal" ${width ? `style="width:min(${width}px,100%)"` : ''}>
        <div class="modal-head">
          <h2>${esc(title)}</h2>
          ${subtitle ? `<p class="dim" style="font-size:.86rem">${esc(subtitle)}</p>` : ''}
        </div>
        <div class="modal-body"></div>
        <div class="modal-foot"></div>
      </div>
    </div>`);
  const bodyEl = overlay.querySelector('.modal-body');
  const footEl = overlay.querySelector('.modal-foot');
  if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
  if (typeof footer === 'string') footEl.innerHTML = footer; else if (footer) footEl.appendChild(footer);
  const close = () => { document.removeEventListener('keydown', onKey); overlay.remove(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);
  root.appendChild(overlay);
  const focusable = overlay.querySelector('input,select,textarea,button');
  if (focusable) setTimeout(() => focusable.focus(), 40);
  return { overlay, body: bodyEl, footer: footEl, close };
}

export function confirmDialog({ title, message, confirmLabel = 'Delete', danger = true, detail = '' }) {
  return new Promise((resolve) => {
    const m = modal({
      title,
      body: `<p class="dim" style="font-size:.92rem">${esc(message)}</p>
             ${detail ? `<div class="panel panel-pad" style="margin-top:14px;font-size:.86rem">${detail}</div>` : ''}`,
      footer: `<button class="btn ghost" data-x="no">Cancel</button>
               <button class="btn ${danger ? 'danger' : 'primary'}" data-x="yes">${esc(confirmLabel)}</button>`
    });
    m.footer.querySelector('[data-x=no]').onclick = () => { m.close(); resolve(false); };
    m.footer.querySelector('[data-x=yes]').onclick = () => { m.close(); resolve(true); };
  });
}

/* ------------------------------------------------- states and fragments */
export const emptyState = ({ icon = '◎', title, text = '', action = '' }) => `
  <div class="empty">
    <div class="empty-ico">${icon}</div>
    <h3>${esc(title)}</h3>
    ${text ? `<p>${esc(text)}</p>` : ''}
    ${action || ''}
  </div>`;

export const skeletonPage = () => `
  <div class="stack">
    <div class="grid g-4">
      ${'<div class="skel" style="height:120px"></div>'.repeat(4)}
    </div>
    <div class="grid g-main">
      <div class="skel" style="height:300px"></div>
      <div class="skel" style="height:300px"></div>
    </div>
  </div>`;

export const avatar = (user, size = '') => `
  <div class="avatar ${size}" style="background:${esc(user.accent || '#7c5cff')}">${esc((user.display_name || '?').slice(0, 1).toUpperCase())}</div>`;

export function setBusy(btn, busy, labelWhenBusy = 'Saving…') {
  if (!btn) return;
  if (busy) {
    btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = esc(labelWhenBusy);
  } else {
    btn.disabled = false;
    if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
  }
}

export function fieldError(form, field, message) {
  form.querySelectorAll('.err').forEach((e) => e.remove());
  form.querySelectorAll('.input.bad').forEach((e) => e.classList.remove('bad'));
  if (!field) return;
  const input = form.querySelector(`[name="${field}"]`);
  if (!input) return;
  input.classList.add('bad');
  const wrap = input.closest('.field') || input.parentElement;
  wrap.appendChild(node(`<div class="err">⚠ ${esc(message)}</div>`));
  input.focus();
}

export function clearErrors(form) {
  form.querySelectorAll('.err').forEach((e) => e.remove());
  form.querySelectorAll('.input.bad').forEach((e) => e.classList.remove('bad'));
}

export function debounce(fn, ms = 550) {
  let t;
  const wrapped = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  wrapped.flush = (...args) => { clearTimeout(t); fn(...args); };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}
