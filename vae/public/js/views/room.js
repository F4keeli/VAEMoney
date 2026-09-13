import { api, ApiError } from '../api.js';
import { esc, node, emptyState } from '../ui.js';
import { state } from '../store.js';
import { roomHtml } from './roomRender.js';

async function render({ params }) {
  let username = params[0];
  if (username === 'me') username = state.me.username;

  let room;
  try {
    ({ room } = await api.get(`/rooms/${username}?month=${state.viewMonth || state.currentMonth}`));
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      return {
        title: 'Private room',
        subtitle: `@${username}`,
        el: node(`<div class="panel">${emptyState({
          icon: '🔒',
          title: 'This room is private',
          text: 'Only its owner can open it. The server never sends a private room to anyone else — there is nothing hidden in the page to peek at.',
          action: '<a class="btn ghost" href="#/team">Back to the team</a>'
        })}</div>`)
      };
    }
    throw err;
  }

  const el = node(`<div class="stack" style="gap:18px">${roomHtml(room)}</div>`);

  const actions = room.can_edit
    ? `<a class="btn primary sm" href="#/room/${esc(room.username)}/edit">Customize</a>`
    : '<span class="pill">view only</span>';

  return {
    title: room.room_name,
    subtitle: `${room.display_name}’s room · ${room.visibility === 'private' ? 'private' : 'visible to the team'}`,
    actions,
    el
  };
}

export default { render };
