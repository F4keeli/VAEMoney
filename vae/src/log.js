const { db } = require('./db');
const { nowIso } = require('./time');

function logActivity({ userId, action, entityType, entityId, summary, monthKey }) {
  db.prepare(`INSERT INTO activity (user_id, action, entity_type, entity_id, summary, month_key, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(userId || null, action, entityType, entityId || null, summary, monthKey || null, nowIso());
}

// Field-level diff kept beside every edit so a corrected history entry still
// shows what it used to say.
function recordRevision({ entityType, entityId, userId, before, after, fields }) {
  const changes = [];
  for (const f of fields) {
    const from = before ? before[f.key] : undefined;
    const to = after ? after[f.key] : undefined;
    if (String(from ?? '') !== String(to ?? '')) {
      changes.push({ field: f.key, label: f.label, from: from ?? null, to: to ?? null, type: f.type || 'text', currency: f.currency });
    }
  }
  if (!changes.length) return [];
  db.prepare(`INSERT INTO revisions (entity_type, entity_id, user_id, changes, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(entityType, entityId, userId || null, JSON.stringify(changes), nowIso());
  return changes;
}

function listRevisions(entityType, entityId) {
  return db.prepare(`
    SELECT r.*, u.display_name AS user_name, u.username
    FROM revisions r LEFT JOIN users u ON u.id = r.user_id
    WHERE r.entity_type = ? AND r.entity_id = ? ORDER BY r.created_at DESC, r.id DESC
  `).all(entityType, entityId).map((r) => ({
    id: r.id, user_id: r.user_id, user_name: r.user_name, username: r.username,
    created_at: r.created_at, changes: JSON.parse(r.changes)
  }));
}

function listActivity({ limit = 60, month, userId } = {}) {
  const where = [];
  const params = [];
  if (month) { where.push('a.month_key = ?'); params.push(month); }
  if (userId) { where.push('a.user_id = ?'); params.push(userId); }
  const sql = `
    SELECT a.*, u.display_name AS user_name, u.username, u.accent
    FROM activity a LEFT JOIN users u ON u.id = a.user_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY a.created_at DESC, a.id DESC LIMIT ?`;
  return db.prepare(sql).all(...params, Math.min(Number(limit) || 60, 300));
}

module.exports = { logActivity, recordRevision, listRevisions, listActivity };
