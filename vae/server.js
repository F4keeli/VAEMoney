const path = require('path');
const express = require('express');
const { db, getSettings, backend } = require('./src/db');
const auth = require('./src/auth');
const { ValidationError } = require('./src/money');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(express.json({ limit: '256kb' }));
app.use(auth.attachUser);
app.use('/api', auth.requireAppHeader);

// Small in-memory throttle so a stolen username cannot be brute forced quickly.
const attempts = new Map();
app.use('/api/auth/login', (req, res, next) => {
  const key = req.ip + '|' + String(req.body && req.body.username || '');
  const now = Date.now();
  const rec = attempts.get(key) || { count: 0, until: 0 };
  if (rec.until > now) {
    return res.status(429).json({ error: 'Too many attempts. Try again in a moment.' });
  }
  res.on('finish', () => {
    if (res.statusCode === 401) {
      rec.count += 1;
      if (rec.count >= 8) { rec.until = now + 60000; rec.count = 0; }
      attempts.set(key, rec);
    } else attempts.delete(key);
  });
  next();
});

app.get('/api/health', (req, res) => {
  const s = getSettings();
  res.json({ ok: true, team: s.team_name, timezone: s.timezone, users: db.prepare('SELECT COUNT(*) n FROM users').get().n });
});

app.use('/api/auth', require('./src/routes/auth'));
app.use('/api', require('./src/routes/finance'));
app.use('/api', require('./src/routes/team'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown endpoint.' }));

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', etag: true }));

// Single-page app: any other GET returns the shell and the router takes it from there.
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err instanceof ValidationError || err.status === 400) {
    return res.status(400).json({ error: err.message, field: err.field || null });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'That request was not valid JSON.' });
  }
  console.error('[vae]', err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '0.0.0.0';

setInterval(() => { try { auth.purgeExpiredSessions(); } catch (_) {} }, 6 * 3600 * 1000).unref();

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    const s = getSettings();
    console.log(`VAE running on http://localhost:${PORT}`);
    console.log(`  team: ${s.team_name} · timezone: ${s.timezone} · database: ${backend}`);
  });
}

module.exports = app;
