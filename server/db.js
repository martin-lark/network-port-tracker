import Database from 'better-sqlite3';
import path from 'path';
import { mkdirSync } from 'fs';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

export function createDb(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS hosts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      ip_address TEXT NOT NULL,
      os TEXT,
      type TEXT DEFAULT 'other' CHECK(type IN ('physical', 'vm', 'container', 'other')),
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      host_id INTEGER NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
      port_number INTEGER NOT NULL CHECK(port_number BETWEEN 1 AND 65535),
      port_end INTEGER CHECK(port_end IS NULL OR (port_end BETWEEN 1 AND 65535 AND port_end > port_number)),
      service_name TEXT NOT NULL,
      protocol TEXT DEFAULT 'TCP' CHECK(protocol IN ('TCP', 'UDP')),
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      tags TEXT DEFAULT '[]',
      notes TEXT,
      client TEXT,
      domain TEXT,
      tunnel TEXT,
      tunnel_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(host_id, port_number, protocol)
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      host_id INTEGER REFERENCES hosts(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

let _db;
export function getDb() {
  if (!_db) {
    mkdirSync(DATA_DIR, { recursive: true });
    _db = createDb(path.join(DATA_DIR, 'port-tracker.db'));
  }
  return _db;
}
