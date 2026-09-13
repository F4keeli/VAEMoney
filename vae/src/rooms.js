const { db } = require('./db');
const { nowIso } = require('./time');

const ACCENTS = ['#7c5cff', '#3ddc97', '#ff8a5c', '#4cc2ff', '#ff5c8a', '#ffd166', '#9b8cff', '#2fd4c4'];

const LAYOUTS = ['stack', 'split', 'grid'];
const BACKGROUNDS = ['aurora', 'grid', 'noise', 'rings', 'plain'];

function defaultTheme(displayName, accent) {
  return {
    accent: accent || ACCENTS[0],
    accent2: '#4cc2ff',
    surface: '#0e0e12',
    text: '#f4f4f7',
    background: 'aurora',
    layout: 'stack',
    corner: 20,
    glow: 55,
    font: 'sans',
    tagline: `${displayName}'s corner of VAE.`,
    banner: '',
    trinkets: [],
    widgets: { earnings: true, activity: true, notes: true },
    notes: ''
  };
}

function clampNumber(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

const isHex = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

// Everything a room stores is normalized here, so a hand-edited payload can
// never put unexpected values into the page.
function sanitizeTheme(input, displayName, accent) {
  const base = defaultTheme(displayName, accent);
  const t = input && typeof input === 'object' ? input : {};
  const trinkets = Array.isArray(t.trinkets) ? t.trinkets.slice(0, 40).map((tr) => ({
    id: String(tr.id || Math.random().toString(36).slice(2)).slice(0, 40),
    kind: ['sticker', 'badge', 'icon', 'widget'].includes(tr.kind) ? tr.kind : 'sticker',
    glyph: String(tr.glyph || '*').slice(0, 8),
    label: String(tr.label || '').slice(0, 40),
    color: isHex(tr.color) ? tr.color : base.accent,
    size: clampNumber(tr.size, 24, 120, 48),
    rotate: clampNumber(tr.rotate, -40, 40, 0)
  })) : [];
  return {
    accent: isHex(t.accent) ? t.accent : base.accent,
    accent2: isHex(t.accent2) ? t.accent2 : base.accent2,
    surface: isHex(t.surface) ? t.surface : base.surface,
    text: isHex(t.text) ? t.text : base.text,
    background: BACKGROUNDS.includes(t.background) ? t.background : base.background,
    layout: LAYOUTS.includes(t.layout) ? t.layout : base.layout,
    corner: clampNumber(t.corner, 0, 36, base.corner),
    glow: clampNumber(t.glow, 0, 100, base.glow),
    font: ['sans', 'mono', 'display'].includes(t.font) ? t.font : base.font,
    tagline: String(t.tagline ?? base.tagline).slice(0, 140),
    banner: String(t.banner ?? '').slice(0, 60),
    trinkets,
    widgets: {
      earnings: t.widgets ? !!t.widgets.earnings : true,
      activity: t.widgets ? !!t.widgets.activity : true,
      notes: t.widgets ? !!t.widgets.notes : true
    },
    notes: String(t.notes ?? '').slice(0, 1200)
  };
}

function ensureRoom(user) {
  const existing = db.prepare('SELECT * FROM rooms WHERE user_id = ?').get(user.id);
  if (existing) return existing;
  const theme = sanitizeTheme(defaultTheme(user.display_name, user.accent), user.display_name, user.accent);
  db.prepare(`INSERT INTO rooms (user_id, room_name, visibility, edit_access, theme, updated_at)
              VALUES (?, ?, 'team', 'owner', ?, ?)`)
    .run(user.id, `${user.display_name}'s Room`, JSON.stringify(theme), nowIso());
  return db.prepare('SELECT * FROM rooms WHERE user_id = ?').get(user.id);
}

function shapeRoom(row, owner, viewer) {
  return {
    user_id: owner.id,
    username: owner.username,
    display_name: owner.display_name,
    room_name: row.room_name,
    visibility: row.visibility,
    edit_access: row.edit_access,
    theme: JSON.parse(row.theme),
    updated_at: row.updated_at,
    is_owner: !!viewer && viewer.id === owner.id,
    can_edit: canEdit(row, owner, viewer)
  };
}

// Server-side gate: a private room is never serialized for anyone but its owner.
function canView(room, owner, viewer) {
  if (!viewer) return false;
  if (viewer.id === owner.id) return true;
  return room.visibility === 'team';
}

function canEdit(room, owner, viewer) {
  if (!viewer) return false;
  if (viewer.id === owner.id) return true;
  if (room.visibility === 'private') return false;
  return room.edit_access === 'team';
}

module.exports = { ACCENTS, LAYOUTS, BACKGROUNDS, defaultTheme, sanitizeTheme, ensureRoom, shapeRoom, canView, canEdit };
