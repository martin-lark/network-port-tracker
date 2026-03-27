import Database from 'better-sqlite3';
import path from 'path';
import { mkdirSync } from 'fs';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

// Create and initialize a SQLite database at the given path.
// Used directly in tests with :memory: databases.
export function createDb(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');   // Write-Ahead Logging for better concurrent read performance
  db.pragma('foreign_keys = ON');    // Enforce FK constraints (off by default in SQLite)
  migrate(db);
  return db;
}

// Create tables if they don't already exist.
// Ports have a unique constraint on (host_id, port_number, protocol) for conflict detection.
// Notes with a null host_id are global; otherwise they're linked to a host.
// Deleting a host cascades to its ports and linked notes.
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

    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip_address TEXT NOT NULL UNIQUE,
      mac_address TEXT,
      hostname TEXT,
      host_id INTEGER REFERENCES hosts(id) ON DELETE SET NULL,
      category TEXT DEFAULT 'other' CHECK(category IN ('server', 'desktop', 'mobile', 'iot', 'network', 'other')),
      is_known INTEGER DEFAULT 0,
      last_seen TEXT,
      x_position REAL,
      y_position REAL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS port_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Add category_id to ports if it doesn't exist yet
  const hasCategory = db.prepare("SELECT COUNT(*) as cnt FROM pragma_table_info('ports') WHERE name = 'category_id'").get();
  if (!hasCategory.cnt) {
    db.exec("ALTER TABLE ports ADD COLUMN category_id INTEGER REFERENCES port_categories(id) ON DELETE SET NULL");
  }

  // Seed default port categories
  const categoryCount = db.prepare('SELECT COUNT(*) as cnt FROM port_categories').get();
  if (categoryCount.cnt === 0) {
    const insert = db.prepare('INSERT INTO port_categories (name) VALUES (?)');
    for (const name of ['Web', 'Database', 'Media', 'Monitoring', 'Infrastructure', 'Other']) {
      insert.run(name);
    }
  }
}

// Singleton database instance for the application.
// Creates the data directory if it doesn't exist.
let _db;
export function getDb() {
  if (!_db) {
    mkdirSync(DATA_DIR, { recursive: true });
    _db = createDb(path.join(DATA_DIR, 'port-tracker.db'));
  }
  return _db;
}
