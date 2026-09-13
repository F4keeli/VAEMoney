import { api } from '../api.js';
import { esc, node, emptyState } from '../ui.js';
import { relTime, dateTimeLabel, monthLabel } from '../format.js';

const MARK = { created: '+', edited: '✎', deleted: '−' };

async function render() {
  const { activity } = await api.get('/activity?limit=200');

  const el = node(`
    <div class="panel">
      <div class="panel-head"><h2>Everything that has happened</h2><div class="spacer"></div>
        <span class="pill">${activity.length} record${activity.length === 1 ? '' : 's'}</span></div>
      <div class="panel-body" data-body></div>
    </div>`);

  el.querySelector('[data-body]').innerHTML = activity.length
    ? `<div class="timeline">${activity.map((a) => `
        <div class="tl-item">
          <div class="tl-dot" style="color:${a.action === 'created' ? 'var(--pos)' : a.action === 'deleted' ? 'var(--neg)' : 'var(--text-dim)'}">${MARK[a.action] || '·'}</div>
          <div class="tl-body">
            <div class="tl-sum">${esc(a.summary)}</div>
            <div class="tl-meta">
              <span style="color:${esc(a.accent || 'var(--text-faint)')}">${esc(a.user_name || 'Someone')}</span>
              · ${esc(relTime(a.created_at))} · ${esc(dateTimeLabel(a.created_at))}
              ${a.month_key ? ` · <a href="#/history/${esc(a.month_key)}" class="faint">${esc(monthLabel(a.month_key))}</a>` : ''}
            </div>
          </div>
        </div>`).join('')}</div>`
    : emptyState({ title: 'Nothing logged yet', text: 'Every add, edit and delete of a financial record shows up here with who did it.' });

  return {
    title: 'Activity log',
    subtitle: 'Who created, edited or deleted each financial record',
    el
  };
}

export default { render };
