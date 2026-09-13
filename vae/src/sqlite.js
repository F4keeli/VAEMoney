/*
 * One small database interface with two backends.
 *
 * better-sqlite3 is used when it is installed. When it is not — a machine with no
 * C++ toolchain, say — Node's own built-in SQLite is used instead, so `npm install`
 * never has to compile anything. Both are wrapped to the same shape:
 *   db.exec(sql) · db.pragma(text) · db.prepare(sql).get/all/run · db.transaction(fn)
 */

let backend = null;
let Driver = null;
try {
  Driver = require('better-sqlite3');
  backend = 'better-sqlite3';
} catch (_) {
  // Node's built-in SQLite is still flagged experimental; that warning is expected here.
  const emit = process.emitWarning;
  process.emitWarning = (warning, ...rest) => {
    if (String(warning).includes('SQLite is an experimental feature')) return;
    return emit.call(process, warning, ...rest);
  };
  try {
    ({ DatabaseSync: Driver } = require('node:sqlite'));
    backend = 'node:sqlite';
  } catch (_) {
    throw new Error(
      'No SQLite driver available. Use Node 22.5 or newer, or run: npm install better-sqlite3'
    );
  }
}

// node:sqlite refuses named parameters the statement does not use, and refuses
// booleans and undefined. better-sqlite3 is more forgiving; this makes both agree.
const namedIn = (sql) => new Set((sql.match(/@[A-Za-z_][A-Za-z0-9_]*/g) || []).map((s) => s.slice(1)));
const cast = (v) => {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
};

class Statement {
  constructor(stmt, names) {
    this.stmt = stmt;
    this.names = names;
  }
  args(args) {
    if (args.length === 1 && args[0] !== null && typeof args[0] === 'object' && !Array.isArray(args[0])) {
      const out = {};
      for (const key of this.names) out[key] = cast(args[0][key]);
      return [out];
    }
    return args.map(cast);
  }
  get(...a) { return this.stmt.get(...this.args(a)); }
  all(...a) { return this.stmt.all(...this.args(a)); }
  run(...a) {
    const r = this.stmt.run(...this.args(a));
    return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
  }
}

function open(file) {
  if (backend === 'better-sqlite3') {
    const db = new Driver(file);
    return {
      backend,
      raw: db,
      exec: (sql) => db.exec(sql),
      pragma: (text) => db.pragma(text),
      prepare: (sql) => db.prepare(sql),
      transaction: (fn) => db.transaction(fn)
    };
  }

  const db = new Driver(file);
  return {
    backend,
    raw: db,
    exec: (sql) => db.exec(sql),
    pragma: (text) => db.exec(`PRAGMA ${text}`),
    prepare: (sql) => new Statement(db.prepare(sql), namedIn(sql)),
    transaction: (fn) => (...args) => {
      db.exec('BEGIN');
      try {
        const result = fn(...args);
        db.exec('COMMIT');
        return result;
      } catch (err) {
        try { db.exec('ROLLBACK'); } catch (_) {}
        throw err;
      }
    }
  };
}

module.exports = { open, backend };
