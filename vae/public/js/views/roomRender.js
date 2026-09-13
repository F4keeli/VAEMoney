import { esc } from '../ui.js';
import { money, pair, pct, relTime } from '../format.js';

const FONTS = {
  sans: 'var(--font)',
  mono: 'var(--mono)',
  display: 'Georgia, "Times New Roman", serif'
};

export function roomBackground(theme) {
  const a = theme.accent;
  const b = theme.accent2;
  switch (theme.background) {
    case 'grid':
      return `background:
        linear-gradient(${theme.surface},${theme.surface}),
        repeating-linear-gradient(0deg,${a}22 0 1px,transparent 1px 34px),
        repeating-linear-gradient(90deg,${b}1c 0 1px,transparent 1px 34px);
        background-blend-mode:normal,screen,screen;`;
    case 'noise':
      return `background:
        radial-gradient(120% 90% at 50% 0%,${a}2e,transparent 60%),
        repeating-conic-gradient(from 0deg at 50% 50%, ${b}0d 0deg 3deg, transparent 3deg 6deg),
        ${theme.surface};`;
    case 'rings':
      return `background:
        repeating-radial-gradient(circle at 82% 14%, ${a}26 0 2px, transparent 2px 26px),
        radial-gradient(90% 70% at 10% 100%, ${b}22, transparent 60%),
        ${theme.surface};`;
    case 'plain':
      return `background:${theme.surface};`;
    default:
      return `background:
        radial-gradient(70% 55% at 8% -10%, ${a}4d, transparent 62%),
        radial-gradient(60% 50% at 100% 6%, ${b}3d, transparent 60%),
        radial-gradient(80% 60% at 50% 120%, ${a}26, transparent 60%),
        ${theme.surface};`;
  }
}

const trinketHtml = (t) => `
  <div class="trinket" style="width:${t.size}px;min-height:${t.size}px;padding:8px;transform:rotate(${t.rotate}deg);
       border-color:${esc(t.color)}55;box-shadow:0 0 ${Math.round(t.size / 2)}px -6px ${esc(t.color)}">
    <span class="glyph" style="font-size:${Math.round(t.size * 0.42)}px;color:${esc(t.color)}">${esc(t.glyph)}</span>
    ${t.label ? `<span class="tl">${esc(t.label)}</span>` : ''}
  </div>`;

export function roomHtml(room, { preview = false } = {}) {
  const t = room.theme;
  const stats = room.stats;
  const glow = t.glow / 100;
  const widgets = [];

  if (t.widgets.earnings) {
    widgets.push(`
      <div class="room-card" style="border-radius:${t.corner}px">
        <div class="faint" style="font-size:.72rem;letter-spacing:.08em;text-transform:uppercase">My money · ${esc(room.month_label || '')}</div>
        <div class="amount-lines" style="margin-top:10px">
          <div class="amount-line"><span class="cur">USD</span><b class="num" style="color:${esc(t.accent)}">${esc(money(stats ? stats.earned.usd_cents : 0, 'USD'))}</b></div>
          <div class="amount-line"><span class="cur">Robux</span><b class="num" style="color:${esc(t.accent)}">${esc(money(stats ? stats.earned.robux : 0, 'ROBUX'))}</b></div>
        </div>
        <div class="row" style="margin-top:12px;gap:8px">
          <span class="pill">${esc(pct(stats ? stats.share_bp : 0))} of the team's money in</span>
          <span class="pill">${stats ? stats.entry_count : 0} payment${stats && stats.entry_count === 1 ? '' : 's'}</span>
        </div>
      </div>`);
  }
  if (t.widgets.notes) {
    widgets.push(`
      <div class="room-card" style="border-radius:${t.corner}px">
        <div class="faint" style="font-size:.72rem;letter-spacing:.08em;text-transform:uppercase">Notes</div>
        <p style="margin-top:10px;white-space:pre-wrap;font-size:.9rem">${esc(t.notes || 'Nothing pinned here yet.')}</p>
      </div>`);
  }
  if (t.widgets.activity) {
    const acts = room.activity || [];
    widgets.push(`
      <div class="room-card" style="border-radius:${t.corner}px">
        <div class="faint" style="font-size:.72rem;letter-spacing:.08em;text-transform:uppercase">Recent activity</div>
        ${acts.length ? `<div class="stack-sm" style="margin-top:10px">${acts.map((a) => `
          <div style="font-size:.84rem">${esc(a.summary)}<div class="faint" style="font-size:.73rem">${esc(relTime(a.created_at))}</div></div>`).join('')}</div>`
          : '<p class="hint" style="margin-top:10px">Nothing here yet.</p>'}
      </div>`);
  }

  return `
    <div class="room" style="${roomBackground(t)}color:${esc(t.text)};font-family:${FONTS[t.font] || FONTS.sans};border-radius:${Math.max(16, t.corner + 6)}px">
      <div class="room-bg" style="box-shadow:inset 0 0 ${Math.round(glow * 260)}px ${esc(t.accent)}${glow > 0 ? '33' : '00'}"></div>
      <div class="room-inner">
        ${t.banner ? `<div class="pill" style="background:${esc(t.accent)}22;border-color:${esc(t.accent)}55;color:${esc(t.accent)};margin-bottom:14px">${esc(t.banner)}</div>` : ''}
        <div class="room-hero">
          <div class="avatar xl" style="background:${esc(t.accent)};border-radius:${t.corner}px;box-shadow:0 12px 40px -12px ${esc(t.accent)}">
            ${esc(room.display_name.slice(0, 1).toUpperCase())}</div>
          <div style="min-width:0">
            <div class="room-title">${esc(room.room_name)}</div>
            <div class="room-tag" style="color:${esc(t.text)}b0">${esc(t.tagline)}</div>
            <div class="row" style="margin-top:10px;gap:8px">
              <span class="pill" style="border-color:${esc(t.accent)}44">@${esc(room.username)}</span>
              <span class="pill" style="border-color:${esc(t.accent)}44">${room.visibility === 'private' ? 'Private' : 'Visible to the team'}</span>
              ${room.edit_access === 'team' && room.visibility !== 'private' ? '<span class="pill">Team can edit</span>' : ''}
            </div>
          </div>
        </div>
        ${t.trinkets.length ? `<div class="trinkets">${t.trinkets.map(trinketHtml).join('')}</div>` : ''}
        ${widgets.length ? `<div class="room-widgets ${esc(t.layout)}">${widgets.join('')}</div>` : ''}
        ${preview ? '' : `<p class="hint" style="margin-top:22px">Last changed ${esc(relTime(room.updated_at))}</p>`}
      </div>
    </div>`;
}
