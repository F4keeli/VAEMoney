# VAE — team finance

One private website for a small team to keep track of the money: what came in,
what went out, what is left, who earned what — month by month. Everyone signs in
at the same link and sees the same numbers.

Everything is here: the pages, the server, the database, the sign-in, the monthly
rollover. No build step, no outside services, no CDN.

**To put it online for your team, read [DEPLOY.md](DEPLOY.md).**

---

## Running it

Needs **Node 22.5 or newer** — nothing else. No build step and no compiler:
the database is Node's own built-in SQLite, and the only runtime dependencies are
Express and bcryptjs, both pure JavaScript.

```bash
npm install
npm start          # http://localhost:4173
```

(`better-sqlite3` is listed as an *optional* dependency. If it installs, the app uses
it; if your machine has no C++ toolchain and the install skips it, the app falls back
to Node's built-in SQLite and works exactly the same. The startup line tells you which
one is in use.)

The first account you create starts the team and is shown a **team code** — the
others need it to make their own accounts. Everyone is a normal member; there is
no owner and no admin. Everything is stored in `data/vae.db` (SQLite, made
automatically).

```bash
npm run dev        # same thing, restarts on file changes
npm test           # 30 API tests covering the maths, the rules and the rollover
```

### Settings you can change with environment variables

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `4173` | Port to listen on |
| `HOST` | `0.0.0.0` | Interface to bind |
| `VAE_DATA_DIR` | `./data` | Where the SQLite file lives |
| `VAE_SECURE_COOKIES` | auto | Only needed to force secure cookies; HTTPS is detected on its own |

### Putting it online

See [DEPLOY.md](DEPLOY.md) — Fly.io, Railway/Koyeb, Render, or your own server.
The one rule: `VAE_DATA_DIR` must point at a disk that survives a restart,
because that folder holds the whole database.

---

## How it is put together

```
server.js              Express app, route wiring, error handling
src/
  sqlite.js            thin database layer — built-in SQLite or better-sqlite3
  db.js                SQLite schema, settings store
  auth.js              bcrypt hashing, sessions, guards
  money.js             USD+Robux pairs, decimal-safe parsing, percentage maths
  time.js              timezone-aware months and dates
  finance.js           every total and breakdown
  rooms.js             room defaults, theme sanitizing, view/edit rules
  log.js               activity log and field-level revisions
  seed.js              example data (loaded and removed from Settings)
  routes/              auth.js · finance.js · team.js
public/
  index.html           app shell
  css/styles.css       the whole design system
  js/                  api · store · router · charts · ui, and one file per screen
test/api.test.js       the test suite
```

**Frontend** — plain ES modules, no framework and no bundler. Hash routing,
one module per screen, charts drawn as SVG by `js/charts.js`.

**Backend** — Express 5 over SQLite (synchronous, transactional, one file on disk).
`npm audit` reports zero vulnerabilities.

---

## The parts worth knowing

### Everyone is just a member
There is no owner and no admin. Anyone on the team can add payments, fix them,
change the settings, add someone new, or reset a password. Every change is
recorded with the name of whoever made it, which is what a small team actually
needs instead of permissions.

### A payment can be USD, Robux, or both
One payment carries two amounts. If a client paid part in dollars and part in
Robux, that is still one payment, and both amounts stay on their own line
everywhere. The optional "combined" figure is only ever an estimate, at the
rate in Settings (Roblox pays out at $0.0035 per Robux).

### Money on a member counts twice, on purpose
A payment put on one of you counts as **their** money **and** in the team
totals. It is never moved away from the team. A payment with nobody on it shows
up as "not put on anyone" and belongs to the team as a whole.

### Money never drifts
Amounts are stored as whole numbers — USD as cents, Robux as whole Robux —
parsed with BigInt string maths, so `49.995` becomes `5000` cents and nothing
rounds sideways. Percentages are stored as basis points (`12.5%` → `1250`).

### Splitting by percent
Put in the total, give each person a percent. Each share is saved as that
person's own payment, so it lands in their money and in the team total. What is
left over stays with the team, so the numbers always add up. A split can be
undone in one go.

### Months look after themselves
No scheduled job. A payment's month comes from its date, and "this month" is
whatever the calendar says in the team's timezone. On the 1st the dashboard is
simply empty and last month is under Months, untouched. Old months stay open for
corrections, and each correction is written to the payment's own history.

### Rooms
Everyone gets a personal page they can decorate. Each person decides whether the
others can see it at all, and whether they may edit it — checked on the server,
so a private room is never sent to anyone else.

### Security
- Passwords: bcrypt, cost 12. Never stored, logged or sent back in plain text.
- Sessions: a 256-bit random id in an httpOnly, SameSite=Lax cookie, kept
  server-side and revocable; changing a password signs out every other device.
- The sign-in cookie is marked secure automatically when the site is on HTTPS.
- New accounts need the team code, so a stranger who finds the URL cannot join.
- Cross-site posts are blocked by an `x-vae-app` header a foreign form cannot set.
- Repeated wrong passwords for the same name and IP are slowed down.

---

## The screens

| Screen | Route |
| --- | --- |
| Sign in / start the team | `#/` when signed out |
| Dashboard | `#/` |
| Payments | `#/entries` |
| Add / edit a payment | `#/entry/new`, `#/entry/:id` |
| Split by percent | `#/split` |
| Months | `#/history` |
| One month in detail | `#/history/:month` |
| The team | `#/team` |
| A personal room | `#/room/:username` |
| Room editor | `#/room/:username/edit` |
| Settings | `#/settings` |
| Everything that happened | `#/activity` |

## Example data

Settings → **Load example data** adds three months of made-up payments, including
one split by percent, so you can see how everything adds up. It creates no
accounts. **Remove the example data** deletes exactly those rows and nothing you
added yourself.
