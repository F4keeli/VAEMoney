import { api } from '../api.js';
import { esc, node, confirmDialog, ok, fail, debounce } from '../ui.js';
import { state, saving } from '../store.js';
import { roomHtml } from './roomRender.js';

const BACKGROUNDS = [['aurora', 'Aurora'], ['grid', 'Grid'], ['noise', 'Rays'], ['rings', 'Rings'], ['plain', 'Plain']];
const LAYOUTS = [['stack', 'Stacked'], ['split', 'Two columns'], ['grid', 'Grid']];
const FONTS = [['sans', 'Clean'], ['mono', 'Mono'], ['display', 'Serif']];
const GLYPHS = ['★', '✦', '♛', '⚡', '◆', '✿', '🔥', '🎮', '🎨', '💎', '🛠', '🚀', '🧊', '🌙', '👾', '🐾', '🏆', '📦', '🎧', '🧪', '✨', '🍀'];
const PRESETS = [
  { name: 'Violet', accent: '#7c5cff', accent2: '#4cc2ff', surface: '#0e0e12' },
  { name: 'Mint', accent: '#3ddc97', accent2: '#2fd4c4', surface: '#0b120f' },
  { name: 'Ember', accent: '#ff8a5c', accent2: '#ffd166', surface: '#140d0b' },
  { name: 'Rose', accent: '#ff5c8a', accent2: '#9b8cff', surface: '#130b10' },
  { name: 'Ice', accent: '#4cc2ff', accent2: '#9b8cff', surface: '#090f16' },
  { name: 'Bone', accent: '#d8d3c8', accent2: '#8b8b98', surface: '#111113' }
];

async function render({ params, reload }) {
  let username = params[0];
  if (username === 'me') username = state.me.username;
  const { room } = await api.get(`/rooms/${username}`);
  if (!room.can_edit) {
    return {
      title: 'Room editor',
      subtitle: 'You do not have edit access to this room',
      el: node(`<div class="panel panel-pad">You can view this room but not change it. <a href="#/room/${esc(username)}">Go back</a>.</div>`)
    };
  }

  const draft = {
    room_name: room.room_name,
    visibility: room.visibility,
    edit_access: room.edit_access,
    theme: JSON.parse(JSON.stringify(room.theme))
  };

  const el = node(`
    <div class="editor">
      <div class="panel editor-panel">
        <div class="panel-head"><h2>Room editor</h2><div class="spacer"></div><span class="pill" data-state>Saved</span></div>
        <div class="panel-body stack" style="gap:18px" data-controls></div>
      </div>
      <div class="stack" style="gap:14px">
        <div data-preview></div>
        <p class="hint">Changes save on their own a moment after you stop editing.</p>
      </div>
    </div>`);

  const controls = el.querySelector('[data-controls]');
  const previewBox = el.querySelector('[data-preview]');
  const stateChip = el.querySelector('[data-state]');

  const paintPreview = () => {
    previewBox.innerHTML = roomHtml({ ...room, ...draft, theme: draft.theme }, { preview: true });
  };

  const save = debounce(async () => {
    stateChip.textContent = 'Saving…';
    try {
      const res = await saving(() => api.put(`/rooms/${username}`, draft));
      Object.assign(room, res.room);
      stateChip.textContent = 'Saved';
    } catch (err) {
      stateChip.textContent = 'Not saved';
      fail('Could not save the room', err.message);
    }
  }, 650);

  const touch = () => { stateChip.textContent = 'Unsaved…'; paintPreview(); save(); };

  function paintControls() {
    const t = draft.theme;
    controls.innerHTML = `
      <div class="field">
        <label for="rn">Room name</label>
        <input class="input" id="rn" maxlength="48" value="${esc(draft.room_name)}">
      </div>
      <div class="field">
        <label for="tag">Tagline</label>
        <input class="input" id="tag" maxlength="140" value="${esc(t.tagline)}">
      </div>
      <div class="field">
        <label for="ban">Badge text <span class="faint">(optional)</span></label>
        <input class="input" id="ban" maxlength="60" placeholder="e.g. Modeling bay" value="${esc(t.banner)}">
      </div>

      <div class="field">
        <span class="lbl">Colour presets</span>
        <div class="swatches">
          ${PRESETS.map((p) => `<button type="button" class="swatch" data-preset="${esc(p.name)}" title="${esc(p.name)}"
            style="background:linear-gradient(135deg,${p.accent},${p.accent2})"></button>`).join('')}
        </div>
      </div>
      <div class="form-grid">
        <div class="field"><label for="c1">Accent</label><div class="row"><input type="color" id="c1" value="${esc(t.accent)}"><span class="mono faint" style="font-size:.78rem">${esc(t.accent)}</span></div></div>
        <div class="field"><label for="c2">Second accent</label><div class="row"><input type="color" id="c2" value="${esc(t.accent2)}"><span class="mono faint" style="font-size:.78rem">${esc(t.accent2)}</span></div></div>
        <div class="field"><label for="c3">Background</label><div class="row"><input type="color" id="c3" value="${esc(t.surface)}"><span class="mono faint" style="font-size:.78rem">${esc(t.surface)}</span></div></div>
        <div class="field"><label for="c4">Text</label><div class="row"><input type="color" id="c4" value="${esc(t.text)}"><span class="mono faint" style="font-size:.78rem">${esc(t.text)}</span></div></div>
      </div>

      <div class="field">
        <span class="lbl">Background style</span>
        <div class="seg" style="grid-auto-flow:row;grid-template-columns:repeat(3,1fr)" data-bg>
          ${BACKGROUNDS.map(([v, l]) => `<button type="button" data-v="${v}" class="${t.background === v ? 'on' : ''}">${l}</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <span class="lbl">Layout</span>
        <div class="seg" data-layout>
          ${LAYOUTS.map(([v, l]) => `<button type="button" data-v="${v}" class="${t.layout === v ? 'on' : ''}">${l}</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <span class="lbl">Type style</span>
        <div class="seg" data-font>
          ${FONTS.map(([v, l]) => `<button type="button" data-v="${v}" class="${t.font === v ? 'on' : ''}">${l}</button>`).join('')}
        </div>
      </div>
      <div class="form-grid">
        <div class="field"><label for="corner">Corner rounding <span class="faint" data-corner-v>${t.corner}px</span></label>
          <input type="range" id="corner" min="0" max="36" value="${t.corner}"></div>
        <div class="field"><label for="glow">Glow <span class="faint" data-glow-v>${t.glow}%</span></label>
          <input type="range" id="glow" min="0" max="100" value="${t.glow}"></div>
      </div>

      <div class="field">
        <span class="lbl">Panels</span>
        <div class="stack-sm">
          ${[['earnings', 'My money'], ['activity', 'What I changed'], ['notes', 'Notes']].map(([k, l]) => `
            <label class="switch"><input type="checkbox" data-widget="${k}" ${t.widgets[k] ? 'checked' : ''}><span class="switch-track"></span>
              <span class="switch-text"><b>${l}</b></span></label>`).join('')}
        </div>
      </div>
      <div class="field">
        <label for="notes">Notes panel text</label>
        <textarea class="input" id="notes" maxlength="1200" style="min-height:70px">${esc(t.notes)}</textarea>
      </div>

      <div class="field">
        <span class="lbl">Trinkets <span class="faint">${t.trinkets.length}/40</span></span>
        <div class="swatches" data-glyphs>
          ${GLYPHS.map((g) => `<button type="button" class="swatch" data-g="${esc(g)}" style="background:var(--panel-3);font-size:1rem;line-height:26px">${g}</button>`).join('')}
        </div>
        <span class="hint">Tap a symbol to pin it to the room. Click one below to remove it.</span>
        <div class="swatches" data-trinkets style="margin-top:8px">
          ${t.trinkets.map((tr, i) => `<button type="button" class="swatch" data-rm="${i}" title="Remove"
            style="background:${esc(tr.color)}22;border-color:${esc(tr.color)};font-size:1rem;line-height:26px">${esc(tr.glyph)}</button>`).join('')}
        </div>
      </div>

      ${room.is_owner ? `
      <div class="field" style="border-top:1px solid var(--line);padding-top:16px">
        <span class="lbl">Privacy</span>
        <label class="switch"><input type="checkbox" data-private ${draft.visibility === 'private' ? 'checked' : ''}><span class="switch-track"></span>
          <span class="switch-text"><b>Private room</b><span class="hint">Only you can open it. Enforced on the server.</span></span></label>
        <label class="switch" style="margin-top:8px"><input type="checkbox" data-teamedit ${draft.edit_access === 'team' ? 'checked' : ''} ${draft.visibility === 'private' ? 'disabled' : ''}><span class="switch-track"></span>
          <span class="switch-text"><b>Let the team edit it</b><span class="hint">Off means they can look but not change anything.</span></span></label>
      </div>` : '<p class="hint">You are editing this room with the owner’s permission.</p>'}

      <button class="btn ghost" data-reset>Reset to the default design</button>`;

    /* wiring */
    const q = (sel) => controls.querySelector(sel);
    q('#rn').addEventListener('input', (e) => { draft.room_name = e.target.value; touch(); });
    q('#tag').addEventListener('input', (e) => { draft.theme.tagline = e.target.value; touch(); });
    q('#ban').addEventListener('input', (e) => { draft.theme.banner = e.target.value; touch(); });
    q('#notes').addEventListener('input', (e) => { draft.theme.notes = e.target.value; touch(); });
    [['#c1', 'accent'], ['#c2', 'accent2'], ['#c3', 'surface'], ['#c4', 'text']].forEach(([sel, key]) => {
      q(sel).addEventListener('input', (e) => {
        draft.theme[key] = e.target.value;
        e.target.nextElementSibling.textContent = e.target.value;
        touch();
      });
    });
    controls.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
      const p = PRESETS.find((x) => x.name === b.dataset.preset);
      Object.assign(draft.theme, { accent: p.accent, accent2: p.accent2, surface: p.surface });
      paintControls();
      touch();
    }));
    [['[data-bg]', 'background'], ['[data-layout]', 'layout'], ['[data-font]', 'font']].forEach(([sel, key]) => {
      controls.querySelectorAll(`${sel} button`).forEach((b) => b.addEventListener('click', () => {
        draft.theme[key] = b.dataset.v;
        controls.querySelectorAll(`${sel} button`).forEach((x) => x.classList.toggle('on', x === b));
        touch();
      }));
    });
    q('#corner').addEventListener('input', (e) => {
      draft.theme.corner = Number(e.target.value);
      controls.querySelector('[data-corner-v]').textContent = `${e.target.value}px`;
      touch();
    });
    q('#glow').addEventListener('input', (e) => {
      draft.theme.glow = Number(e.target.value);
      controls.querySelector('[data-glow-v]').textContent = `${e.target.value}%`;
      touch();
    });
    controls.querySelectorAll('[data-widget]').forEach((c) => c.addEventListener('change', () => {
      draft.theme.widgets[c.dataset.widget] = c.checked;
      touch();
    }));
    controls.querySelectorAll('[data-glyphs] button').forEach((b) => b.addEventListener('click', () => {
      if (draft.theme.trinkets.length >= 40) return fail('Room is full', 'Forty trinkets is the limit.');
      draft.theme.trinkets.push({
        id: Math.random().toString(36).slice(2),
        kind: 'sticker', glyph: b.dataset.g, label: '',
        color: draft.theme.accent, size: 52, rotate: Math.round(Math.random() * 16 - 8)
      });
      paintControls();
      touch();
    }));
    controls.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
      draft.theme.trinkets.splice(Number(b.dataset.rm), 1);
      paintControls();
      touch();
    }));
    const priv = q('[data-private]');
    if (priv) {
      priv.addEventListener('change', () => {
        draft.visibility = priv.checked ? 'private' : 'team';
        const te = q('[data-teamedit]');
        te.disabled = priv.checked;
        if (priv.checked) { te.checked = false; draft.edit_access = 'owner'; }
        touch();
      });
      q('[data-teamedit]').addEventListener('change', (e) => {
        draft.edit_access = e.target.checked ? 'team' : 'owner';
        touch();
      });
    }
    q('[data-reset]').addEventListener('click', async () => {
      const yes = await confirmDialog({
        title: 'Reset this room?',
        message: 'Colours, layout, trinkets and notes go back to the default. Your financial data is untouched.',
        confirmLabel: 'Reset room'
      });
      if (!yes) return;
      const res = await saving(() => api.post(`/rooms/${username}/reset`));
      Object.assign(room, res.room);
      draft.room_name = res.room.room_name;
      draft.theme = JSON.parse(JSON.stringify(res.room.theme));
      paintControls();
      paintPreview();
      ok('Room reset to default');
    });
  }

  paintControls();
  paintPreview();

  return {
    title: 'Room customization',
    subtitle: `${room.display_name}’s room · changes save automatically`,
    actions: `<a class="btn sm ghost" href="#/room/${esc(username)}">Done</a>`,
    el
  };
}

export default { render };
