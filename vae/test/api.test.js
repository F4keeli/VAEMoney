/* Run with: npm test */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp');
fs.rmSync(TMP, { recursive: true, force: true });
process.env.VAE_DATA_DIR = TMP;

const app = require('../server');
const { db } = require('../src/db');
const { currentMonthKey, shiftMonth } = require('../src/time');

let base;
const server = app.listen(0);
test.before(() => { base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { server.close(); fs.rmSync(TMP, { recursive: true, force: true }); });

function client() {
  let cookie = '';
  return async function call(method, url, body) {
    const res = await fetch(base + url, {
      method,
      headers: { 'content-type': 'application/json', 'x-vae-app': '1', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    let data = null;
    try { data = await res.json(); } catch (_) {}
    return { status: res.status, data };
  };
}

const one = client();   // first member
const two = client();   // second member
const month = currentMonthKey('Europe/Berlin');
const lastMonth = shiftMonth(month, -1);
let teamCode = '';
let idOne;
let idTwo;

test('the first account starts the team and gets a team code', async () => {
  const res = await one('POST', '/api/auth/register', { username: 'ansel', display_name: 'Ansel', password: 'supersecret1' });
  assert.equal(res.status, 201);
  assert.match(res.data.join_code, /^[0-9A-F]{8}$/);
  teamCode = res.data.join_code;
  idOne = res.data.user.id;
  assert.equal(res.data.user.role, undefined, 'there are no roles');
});

test('a second account needs the team code', async () => {
  const nope = await two('POST', '/api/auth/register', { username: 'vex', display_name: 'VexMex', password: 'supersecret1' });
  assert.equal(nope.status, 400);
  assert.equal(nope.data.field, 'join_code');
  const yes = await two('POST', '/api/auth/register', { username: 'vex', display_name: 'VexMex', password: 'supersecret1', join_code: teamCode });
  assert.equal(yes.status, 201);
  idTwo = yes.data.user.id;
});

test('nobody is an owner — any member can change the team settings', async () => {
  const res = await two('PUT', '/api/settings', { team_name: 'VAE' });
  assert.equal(res.status, 200);
  assert.equal(res.data.settings.team_name, 'VAE');
});

test('any member can add someone else', async () => {
  const res = await two('POST', '/api/members', { username: 'eli', display_name: 'Eli' });
  assert.equal(res.status, 201);
  assert.ok(res.data.temporary_password.length >= 8);
});

test('passwords are never stored in plain text', () => {
  const row = db.prepare('SELECT password_hash FROM users WHERE username = ?').get('ansel');
  assert.ok(row.password_hash.startsWith('$2'));
  assert.ok(!row.password_hash.includes('supersecret1'));
});

test('money needs a session', async () => {
  const anon = client();
  assert.equal((await anon('GET', '/api/summary')).status, 401);
});

test('one payment can be USD and Robux at the same time', async () => {
  const res = await one('POST', '/api/entries', {
    kind: 'in', title: 'Weapon set', usd: '250.00', robux: '40000',
    category: 'Commission', occurred_on: `${month}-09`, member_id: idOne
  });
  assert.equal(res.status, 201);
  assert.equal(res.data.entry.amount.usd_cents, 25000);
  assert.equal(res.data.entry.amount.robux, 40000);
});

test('a payment can be USD only or Robux only', async () => {
  const usdOnly = await one('POST', '/api/entries', {
    kind: 'in', title: 'USD only', usd: '100', robux: '', occurred_on: `${month}-10`, member_id: idTwo
  });
  assert.equal(usdOnly.data.entry.amount.robux, 0);
  const robuxOnly = await one('POST', '/api/entries', {
    kind: 'in', title: 'Robux only', usd: '', robux: '5000', occurred_on: `${month}-11`, member_id: 'team'
  });
  assert.equal(robuxOnly.data.entry.amount.usd_cents, 0);
});

test('a payment with no amount at all is refused', async () => {
  const res = await one('POST', '/api/entries', { kind: 'in', title: 'Nothing', usd: '', robux: '', occurred_on: `${month}-11` });
  assert.equal(res.status, 400);
  assert.equal(res.data.field, 'usd');
});

test('cents survive exactly', async () => {
  const res = await one('POST', '/api/entries', {
    kind: 'out', title: 'Odd cents', usd: '49.995', robux: '', occurred_on: `${month}-02`, member_id: 'team'
  });
  assert.equal(res.data.entry.amount.usd_cents, 5000); // rounded half up
});

test("a member's payment counts as theirs AND in the team total", async () => {
  const { data } = await one('GET', `/api/summary?month=${month}`);
  const s = data.summary;
  const ansel = s.members.find((m) => m.display_name === 'Ansel');
  const vex = s.members.find((m) => m.display_name === 'VexMex');

  assert.equal(ansel.earned.usd_cents, 25000);
  assert.equal(ansel.earned.robux, 40000);
  assert.equal(vex.earned.usd_cents, 10000);

  // The team total holds everything, member payments included.
  assert.equal(s.totals.earned.usd_cents, 25000 + 10000);
  assert.equal(s.totals.earned.robux, 40000 + 5000);
  assert.equal(s.totals.spent.usd_cents, 5000);
  assert.equal(s.totals.net.usd_cents, 35000 - 5000);

  // Only the payment with no member on it sits in "not put on anyone".
  assert.equal(s.unassigned.earned.robux, 5000);
  assert.equal(s.unassigned.earned.usd_cents, 0);
});

test('splitting by percent creates one payment per member', async () => {
  const res = await one('POST', '/api/splits', {
    title: 'Group game revenue', usd: '', robux: '240000', occurred_on: `${month}-20`,
    shares: [{ member_id: idOne, percent: '25' }, { member_id: idTwo, percent: '15' }]
  });
  assert.equal(res.status, 201);
  const byMember = Object.fromEntries(res.data.entries.map((e) => [e.member_name, e.amount.robux]));
  assert.equal(byMember.Ansel, 60000);
  assert.equal(byMember.VexMex, 36000);
  assert.equal(res.data.leftover.amount.robux, 144000, 'the rest stays with the team');
  assert.equal(res.data.entries[0].percent_bp, 2500);
  assert.equal(res.data.entries[0].of_amount.robux, 240000);
});

test('a split carries both currencies when the payment does', async () => {
  const res = await one('POST', '/api/splits', {
    title: 'Mixed payout', usd: '1000.00', robux: '20000', occurred_on: `${month}-21`,
    shares: [{ member_id: idOne, percent: '50' }]
  });
  assert.equal(res.data.entries[0].amount.usd_cents, 50000);
  assert.equal(res.data.entries[0].amount.robux, 10000);
});

test('percentages over 100 are refused', async () => {
  const res = await one('POST', '/api/splits', {
    title: 'Too much', usd: '100', robux: '', occurred_on: `${month}-22`,
    shares: [{ member_id: idOne, percent: '70' }, { member_id: idTwo, percent: '40' }]
  });
  assert.equal(res.status, 400);
  assert.equal(res.data.field, 'shares');
});

test('a split with nobody in it is refused', async () => {
  const res = await one('POST', '/api/splits', { title: 'Nobody', usd: '100', robux: '', occurred_on: `${month}-22`, shares: [] });
  assert.equal(res.status, 400);
});

test('a split can be undone in one go', async () => {
  const made = await one('POST', '/api/splits', {
    title: 'Undo me', usd: '', robux: '1000', occurred_on: `${month}-23`,
    shares: [{ member_id: idOne, percent: '10' }]
  });
  const before = (await one('GET', `/api/entries?month=${month}`)).data.entries.length;
  const res = await one('DELETE', `/api/splits/${made.data.split_id}`);
  assert.equal(res.status, 200);
  const after = (await one('GET', `/api/entries?month=${month}`)).data.entries.length;
  assert.equal(after, before - 1);
});

test('a payment dated last month lands in last month', async () => {
  await one('POST', '/api/entries', {
    kind: 'in', title: 'Old invoice', usd: '500', robux: '', occurred_on: `${lastMonth}-14`, member_id: 'team'
  });
  const now = await one('GET', `/api/summary?month=${month}`);
  const then = await one('GET', `/api/summary?month=${lastMonth}`);
  assert.equal(then.data.summary.totals.earned.usd_cents, 50000);
  assert.notEqual(now.data.summary.totals.earned.usd_cents, then.data.summary.totals.earned.usd_cents);
});

test('both months are kept in the history', async () => {
  const { data } = await one('GET', '/api/months');
  const keys = data.months.map((m) => m.month);
  assert.ok(keys.includes(month) && keys.includes(lastMonth));
});

test('editing a payment records what changed and who did it', async () => {
  const list = await one('GET', `/api/entries?month=${month}`);
  const target = list.data.entries.find((e) => e.title === 'Weapon set');
  const res = await two('PUT', `/api/entries/${target.id}`, {
    kind: 'in', title: 'Weapon set (fixed)', usd: '300.00', robux: '40000',
    category: 'Commission', occurred_on: target.occurred_on, member_id: idOne
  });
  assert.equal(res.status, 200);
  const labels = res.data.changes.map((c) => c.label);
  assert.ok(labels.includes('Title') && labels.includes('USD amount'));
  const log = await one('GET', '/api/activity?limit=50');
  assert.ok(log.data.activity.some((a) => a.action === 'edited' && a.user_name === 'VexMex'));
});

test('deleting a payment is written down', async () => {
  const list = await one('GET', `/api/entries?month=${month}`);
  const target = list.data.entries.find((e) => e.title === 'Robux only');
  assert.equal((await one('DELETE', `/api/entries/${target.id}`)).status, 200);
  const log = await one('GET', '/api/activity?limit=50');
  assert.ok(log.data.activity.some((a) => a.action === 'deleted' && a.summary.includes('Robux only')));
});

test('a private room is refused to the rest of the team', async () => {
  await two('PUT', '/api/rooms/vex', { room_name: 'Vex Lab', visibility: 'private', theme: { accent: '#4cc2ff' } });
  const res = await one('GET', '/api/rooms/vex');
  assert.equal(res.status, 403);
  assert.ok(!JSON.stringify(res.data).includes('Vex Lab'));
});

test('a look-only room cannot be edited by someone else', async () => {
  await two('PUT', '/api/rooms/vex', { visibility: 'team', edit_access: 'owner', theme: { accent: '#4cc2ff' } });
  const res = await one('PUT', '/api/rooms/vex', { room_name: 'hacked', theme: {} });
  assert.equal(res.status, 403);
});

test('a room opened for the team can be edited by anyone', async () => {
  await two('PUT', '/api/rooms/vex', { visibility: 'team', edit_access: 'team', theme: { accent: '#4cc2ff' } });
  const res = await one('PUT', '/api/rooms/vex', { room_name: 'Vex Lab v2', theme: { accent: '#ff5c8a' } });
  assert.equal(res.status, 200);
  assert.equal(res.data.room.room_name, 'Vex Lab v2');
});

test('only the room owner can change its privacy', async () => {
  const res = await one('PUT', '/api/rooms/vex', { visibility: 'private', theme: { accent: '#ff5c8a' } });
  assert.equal(res.data.room.visibility, 'team');
});

test('a hand-made theme payload is cleaned up', async () => {
  const res = await two('PUT', '/api/rooms/vex', {
    theme: { accent: 'javascript:alert(1)', corner: 9999, glow: -50, layout: 'evil', trinkets: [{ glyph: '<img onerror=x>', size: 9999 }] }
  });
  const t = res.data.room.theme;
  assert.match(t.accent, /^#[0-9a-f]{6}$/i);
  assert.equal(t.corner, 36);
  assert.equal(t.glow, 0);
  assert.equal(t.layout, 'stack');
  assert.equal(t.trinkets[0].size, 120);
});

test('the combined number uses the rate', async () => {
  await one('PUT', '/api/settings', { robux_rate: '0.0035' });
  const { data } = await one('GET', `/api/summary?month=${month}`);
  const { earned } = data.summary.totals;
  assert.equal(data.summary.combined.earned_cents, earned.usd_cents + Math.round(earned.robux * 0.0035 * 100));
});

test('a silly conversion rate is refused', async () => {
  assert.equal((await one('PUT', '/api/settings', { robux_rate: '5' })).status, 400);
});

test('example data loads and clears without touching real payments', async () => {
  const realBefore = db.prepare('SELECT COUNT(*) n FROM entries WHERE is_sample = 0').get().n;
  assert.equal((await one('POST', '/api/sample')).status, 200);
  assert.ok(db.prepare('SELECT COUNT(*) n FROM entries WHERE is_sample = 1').get().n > 0);
  assert.equal((await one('DELETE', '/api/sample')).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM entries WHERE is_sample = 1').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM entries WHERE is_sample = 0').get().n, realBefore);
});

test('the example data never mentions a real game', async () => {
  await one('POST', '/api/sample');
  const titles = db.prepare('SELECT title, note FROM entries WHERE is_sample = 1').all()
    .map((r) => `${r.title} ${r.note}`.toLowerCase()).join(' ');
  for (const word of ['laplace', 'hunty', 'sorcerer', 'anime', 'shinobi', 'ghoul', 'weak games']) {
    assert.ok(!titles.includes(word), `example data should not mention "${word}"`);
  }
  await one('DELETE', '/api/sample');
});

test('signing out ends the session', async () => {
  const temp = client();
  await temp('POST', '/api/auth/login', { username: 'ansel', password: 'supersecret1' });
  assert.equal((await temp('GET', '/api/auth/me')).status, 200);
  await temp('POST', '/api/auth/logout');
  assert.equal((await temp('GET', '/api/auth/me')).status, 401);
});
