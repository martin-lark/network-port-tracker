# Port Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Build a self-hosted web app for Lark Digital Studio to track ports, services, domains, and Cloudflare tunnels across home lab hosts.

**Architecture:** Express API with SQLite (better-sqlite3) serving a React SPA. Single Docker container with multi-stage build. Sidebar navigation layout — host list on the left, port table/details on the right.

**Tech Stack:** Node.js, Express, better-sqlite3, React (plain JS), Vite, vitest, supertest, Docker

**Spec:** `docs/superpowers/specs/2026-03-27-port-tracker-design.md`

---

## File Structure

```
port-tracker/
├── package.json              — Server deps, scripts, test config
├── .gitignore
├── server/
│   ├── index.js              — Express app factory + server start
│   ├── db.js                 — SQLite connection + schema migration
│   └── routes/
│       ├── hosts.js          — Host CRUD endpoints
│       ├── ports.js          — Port CRUD endpoints (with conflict detection)
│       ├── notes.js          — Note CRUD endpoints
│       ├── search.js         — Global search endpoint
│       └── export.js         — Multi-format export endpoint
├── client/
│   ├── package.json          — React + Vite deps
│   ├── index.html            — Vite entry HTML
│   ├── vite.config.js        — Vite config with API proxy
│   └── src/
│       ├── main.jsx          — React DOM render
│       ├── App.jsx           — Root layout: sidebar + main area
│       ├── App.css           — All styles (dark theme)
│       ├── api.js            — Fetch wrappers for all API endpoints
│       └── components/
│           ├── Sidebar.jsx       — Host list, search bar, notes link
│           ├── HostDetail.jsx    — Selected host header + port table + notes
│           ├── PortTable.jsx     — Sortable port table with inline actions
│           ├── HostForm.jsx      — Add/edit host modal
│           ├── PortForm.jsx      — Add/edit port modal (conflict error)
│           ├── NotesList.jsx     — Notes list view (global + host-linked)
│           ├── NoteForm.jsx      — Add/edit note modal
│           ├── ExportPanel.jsx   — Format picker, scope, preview, copy button
│           ├── SearchResults.jsx — Search results grouped by type
│           └── Modal.jsx         — Reusable modal wrapper
├── test/
│   ├── setup.js              — Test helper: creates fresh DB per test
│   ├── hosts.test.js
│   ├── ports.test.js
│   ├── notes.test.js
│   ├── search.test.js
│   └── export.test.js
├── Dockerfile                — Multi-stage: build client, run server
└── docker-compose.yml        — Single service + volume for SQLite
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `client/package.json`
- Create: `client/index.html`
- Create: `client/vite.config.js`
- Create: `client/src/main.jsx`

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "port-tracker",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node server/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "client:dev": "cd client && npm run dev",
    "client:build": "cd client && npm run build",
    "start": "NODE_ENV=production node server/index.js"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "cors": "^2.8.5",
    "express": "^4.21.0"
  },
  "devDependencies": {
    "supertest": "^7.0.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create .gitignore**

```
node_modules/
dist/
data/
.superpowers/
*.db
.env
```

- [ ] **Step 3: Create client/package.json**

```json
{
  "name": "port-tracker-client",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 4: Create client/vite.config.js**

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000'
    }
  },
  build: {
    outDir: 'dist'
  }
});
```

- [ ] **Step 5: Create client/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Port Tracker - Lark Digital Studio</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
```

- [ ] **Step 6: Create client/src/main.jsx (placeholder)**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <div>Port Tracker loading...</div>
  </React.StrictMode>
);
```

- [ ] **Step 7: Install dependencies**

```bash
npm install
cd client && npm install
```

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .gitignore client/
git commit -m "scaffold: project structure with Express + Vite + React"
```

---

### Task 2: Database Schema

**Files:**
- Create: `server/db.js`
- Create: `test/setup.js`

- [ ] **Step 1: Create server/db.js**

```js
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
```

- [ ] **Step 2: Create test/setup.js**

This creates an in-memory DB and a fresh Express app for each test:

```js
import express from 'express';
import { createDb } from '../server/db.js';
import { hostsRouter } from '../server/routes/hosts.js';
import { portsRouter } from '../server/routes/ports.js';
import { notesRouter } from '../server/routes/notes.js';
import { searchRouter } from '../server/routes/search.js';
import { exportRouter } from '../server/routes/export.js';

export function createTestApp() {
  const db = createDb(':memory:');
  const app = express();
  app.use(express.json());

  app.use((req, res, next) => {
    req.db = db;
    next();
  });

  app.use('/api/hosts', hostsRouter);
  app.use('/api', portsRouter);
  app.use('/api/notes', notesRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/export', exportRouter);

  return { app, db };
}
```

Note: We create the route files as stubs in Task 3 before this can work. The test setup imports all routers so they must all exist.

- [ ] **Step 3: Commit**

```bash
git add server/db.js test/setup.js
git commit -m "feat: database schema with hosts, ports, notes tables"
```

---

### Task 3: Hosts API (TDD)

**Files:**
- Create: `server/routes/hosts.js`
- Create: `server/routes/ports.js` (stub)
- Create: `server/routes/notes.js` (stub)
- Create: `server/routes/search.js` (stub)
- Create: `server/routes/export.js` (stub)
- Create: `test/hosts.test.js`

- [ ] **Step 1: Create stub route files so test setup can import them**

Create `server/routes/ports.js`:
```js
import { Router } from 'express';
export const portsRouter = Router();
```

Create `server/routes/notes.js`:
```js
import { Router } from 'express';
export const notesRouter = Router();
```

Create `server/routes/search.js`:
```js
import { Router } from 'express';
export const searchRouter = Router();
```

Create `server/routes/export.js`:
```js
import { Router } from 'express';
export const exportRouter = Router();
```

- [ ] **Step 2: Write failing tests for hosts API**

Create `test/hosts.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './setup.js';

describe('Hosts API', () => {
  let app;

  beforeEach(() => {
    ({ app } = createTestApp());
  });

  describe('POST /api/hosts', () => {
    it('creates a host', async () => {
      const res = await request(app)
        .post('/api/hosts')
        .send({ name: 'proxmox-01', ip_address: '192.168.1.10', os: 'Proxmox', type: 'physical' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id: 1,
        name: 'proxmox-01',
        ip_address: '192.168.1.10',
        os: 'Proxmox',
        type: 'physical'
      });
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/hosts')
        .send({ ip_address: '192.168.1.10' });

      expect(res.status).toBe(400);
    });

    it('returns 409 when name is duplicate', async () => {
      await request(app)
        .post('/api/hosts')
        .send({ name: 'proxmox-01', ip_address: '192.168.1.10' });

      const res = await request(app)
        .post('/api/hosts')
        .send({ name: 'proxmox-01', ip_address: '192.168.1.11' });

      expect(res.status).toBe(409);
    });
  });

  describe('GET /api/hosts', () => {
    it('returns empty list initially', async () => {
      const res = await request(app).get('/api/hosts');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns hosts with port counts', async () => {
      const { app, db } = createTestApp();
      db.prepare('INSERT INTO hosts (name, ip_address) VALUES (?, ?)').run('host-1', '10.0.0.1');
      db.prepare('INSERT INTO ports (host_id, port_number, service_name) VALUES (?, ?, ?)').run(1, 80, 'Nginx');
      db.prepare('INSERT INTO ports (host_id, port_number, service_name) VALUES (?, ?, ?)').run(1, 443, 'HTTPS');

      const res = await request(app).get('/api/hosts');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].port_count).toBe(2);
    });
  });

  describe('GET /api/hosts/:id', () => {
    it('returns host with ports and notes', async () => {
      const { app, db } = createTestApp();
      db.prepare('INSERT INTO hosts (name, ip_address) VALUES (?, ?)').run('host-1', '10.0.0.1');
      db.prepare('INSERT INTO ports (host_id, port_number, service_name) VALUES (?, ?, ?)').run(1, 80, 'Nginx');
      db.prepare('INSERT INTO notes (host_id, title, content) VALUES (?, ?, ?)').run(1, 'Setup', 'Initial setup notes');

      const res = await request(app).get('/api/hosts/1');
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('host-1');
      expect(res.body.ports).toHaveLength(1);
      expect(res.body.notes).toHaveLength(1);
    });

    it('returns 404 for missing host', async () => {
      const res = await request(app).get('/api/hosts/999');
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/hosts/:id', () => {
    it('updates a host', async () => {
      const { app, db } = createTestApp();
      db.prepare('INSERT INTO hosts (name, ip_address) VALUES (?, ?)').run('host-1', '10.0.0.1');

      const res = await request(app)
        .put('/api/hosts/1')
        .send({ name: 'host-1-updated', ip_address: '10.0.0.2', os: 'Ubuntu' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('host-1-updated');
      expect(res.body.os).toBe('Ubuntu');
    });
  });

  describe('DELETE /api/hosts/:id', () => {
    it('deletes a host and cascades', async () => {
      const { app, db } = createTestApp();
      db.prepare('INSERT INTO hosts (name, ip_address) VALUES (?, ?)').run('host-1', '10.0.0.1');
      db.prepare('INSERT INTO ports (host_id, port_number, service_name) VALUES (?, ?, ?)').run(1, 80, 'Nginx');

      const res = await request(app).delete('/api/hosts/1');
      expect(res.status).toBe(204);

      const check = await request(app).get('/api/hosts/1');
      expect(check.status).toBe(404);
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- test/hosts.test.js`
Expected: FAIL — hosts router has no routes defined yet.

- [ ] **Step 4: Implement hosts router**

Update `server/routes/hosts.js`:

```js
import { Router } from 'express';

export const hostsRouter = Router();

hostsRouter.get('/', (req, res) => {
  const hosts = req.db.prepare(`
    SELECT h.*, COUNT(p.id) as port_count
    FROM hosts h
    LEFT JOIN ports p ON p.host_id = h.id
    GROUP BY h.id
    ORDER BY h.name
  `).all();
  res.json(hosts);
});

hostsRouter.post('/', (req, res) => {
  const { name, ip_address, os, type, description } = req.body;
  if (!name || !ip_address) {
    return res.status(400).json({ error: 'name and ip_address are required' });
  }

  try {
    const result = req.db.prepare(
      'INSERT INTO hosts (name, ip_address, os, type, description) VALUES (?, ?, ?, ?, ?)'
    ).run(name, ip_address, os || null, type || 'other', description || null);

    const host = req.db.prepare('SELECT * FROM hosts WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(host);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: `Host "${name}" already exists` });
    }
    throw err;
  }
});

hostsRouter.get('/:id', (req, res) => {
  const host = req.db.prepare('SELECT * FROM hosts WHERE id = ?').get(req.params.id);
  if (!host) return res.status(404).json({ error: 'Host not found' });

  host.ports = req.db.prepare('SELECT * FROM ports WHERE host_id = ? ORDER BY port_number').all(req.params.id);
  host.notes = req.db.prepare('SELECT * FROM notes WHERE host_id = ? ORDER BY updated_at DESC').all(req.params.id);
  res.json(host);
});

hostsRouter.put('/:id', (req, res) => {
  const existing = req.db.prepare('SELECT * FROM hosts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Host not found' });

  const { name, ip_address, os, type, description } = req.body;
  req.db.prepare(`
    UPDATE hosts SET name = ?, ip_address = ?, os = ?, type = ?, description = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    name || existing.name,
    ip_address || existing.ip_address,
    os !== undefined ? os : existing.os,
    type || existing.type,
    description !== undefined ? description : existing.description,
    req.params.id
  );

  const host = req.db.prepare('SELECT * FROM hosts WHERE id = ?').get(req.params.id);
  res.json(host);
});

hostsRouter.delete('/:id', (req, res) => {
  const result = req.db.prepare('DELETE FROM hosts WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Host not found' });
  res.status(204).end();
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- test/hosts.test.js`
Expected: All 7 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add server/routes/ test/
git commit -m "feat: hosts CRUD API with tests"
```

---

### Task 4: Ports API (TDD)

**Files:**
- Modify: `server/routes/ports.js`
- Create: `test/ports.test.js`

- [ ] **Step 1: Write failing tests for ports API**

Create `test/ports.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './setup.js';

describe('Ports API', () => {
  let app, db;

  beforeEach(() => {
    ({ app, db } = createTestApp());
    db.prepare('INSERT INTO hosts (name, ip_address) VALUES (?, ?)').run('host-1', '10.0.0.1');
  });

  describe('GET /api/hosts/:id/ports', () => {
    it('returns ports for a host', async () => {
      db.prepare('INSERT INTO ports (host_id, port_number, service_name) VALUES (?, ?, ?)').run(1, 80, 'Nginx');
      db.prepare('INSERT INTO ports (host_id, port_number, service_name, status) VALUES (?, ?, ?, ?)').run(1, 443, 'HTTPS', 'inactive');

      const res = await request(app).get('/api/hosts/1/ports');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    it('filters by status', async () => {
      db.prepare('INSERT INTO ports (host_id, port_number, service_name) VALUES (?, ?, ?)').run(1, 80, 'Nginx');
      db.prepare('INSERT INTO ports (host_id, port_number, service_name, status) VALUES (?, ?, ?, ?)').run(1, 443, 'HTTPS', 'inactive');

      const res = await request(app).get('/api/hosts/1/ports?status=active');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].port_number).toBe(80);
    });

    it('filters by client', async () => {
      db.prepare("INSERT INTO ports (host_id, port_number, service_name, client) VALUES (?, ?, ?, ?)").run(1, 3000, 'App', 'Acme Corp');
      db.prepare("INSERT INTO ports (host_id, port_number, service_name, client) VALUES (?, ?, ?, ?)").run(1, 3001, 'App2', 'Other Co');

      const res = await request(app).get('/api/hosts/1/ports?client=Acme%20Corp');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe('POST /api/hosts/:id/ports', () => {
    it('creates a port', async () => {
      const res = await request(app)
        .post('/api/hosts/1/ports')
        .send({
          port_number: 8006,
          service_name: 'Proxmox UI',
          protocol: 'TCP',
          client: 'Internal',
          domain: 'proxmox.lark.dev',
          tunnel: 'cloudflare',
          tunnel_id: 'abc-123',
          tags: ['management', 'web']
        });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        port_number: 8006,
        service_name: 'Proxmox UI',
        client: 'Internal',
        domain: 'proxmox.lark.dev',
        tunnel: 'cloudflare',
        tunnel_id: 'abc-123'
      });
      expect(JSON.parse(res.body.tags)).toEqual(['management', 'web']);
    });

    it('creates a port range', async () => {
      const res = await request(app)
        .post('/api/hosts/1/ports')
        .send({ port_number: 8000, port_end: 8010, service_name: 'App Range' });

      expect(res.status).toBe(201);
      expect(res.body.port_end).toBe(8010);
    });

    it('returns 400 when port_number is missing', async () => {
      const res = await request(app)
        .post('/api/hosts/1/ports')
        .send({ service_name: 'Test' });
      expect(res.status).toBe(400);
    });

    it('returns 409 on port conflict', async () => {
      await request(app)
        .post('/api/hosts/1/ports')
        .send({ port_number: 80, service_name: 'Nginx' });

      const res = await request(app)
        .post('/api/hosts/1/ports')
        .send({ port_number: 80, service_name: 'Apache' });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Nginx');
    });

    it('allows same port on different protocols', async () => {
      await request(app)
        .post('/api/hosts/1/ports')
        .send({ port_number: 53, service_name: 'DNS TCP', protocol: 'TCP' });

      const res = await request(app)
        .post('/api/hosts/1/ports')
        .send({ port_number: 53, service_name: 'DNS UDP', protocol: 'UDP' });

      expect(res.status).toBe(201);
    });
  });

  describe('PUT /api/ports/:id', () => {
    it('updates a port', async () => {
      db.prepare("INSERT INTO ports (host_id, port_number, service_name) VALUES (?, ?, ?)").run(1, 80, 'Nginx');

      const res = await request(app)
        .put('/api/ports/1')
        .send({ status: 'inactive', notes: 'Shutting down for maintenance' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('inactive');
      expect(res.body.notes).toBe('Shutting down for maintenance');
    });
  });

  describe('DELETE /api/ports/:id', () => {
    it('deletes a port', async () => {
      db.prepare("INSERT INTO ports (host_id, port_number, service_name) VALUES (?, ?, ?)").run(1, 80, 'Nginx');

      const res = await request(app).delete('/api/ports/1');
      expect(res.status).toBe(204);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- test/ports.test.js`
Expected: FAIL — ports router has no routes.

- [ ] **Step 3: Implement ports router**

Update `server/routes/ports.js`:

```js
import { Router } from 'express';

export const portsRouter = Router();

portsRouter.get('/hosts/:id/ports', (req, res) => {
  const { status, client, protocol } = req.query;
  let sql = 'SELECT * FROM ports WHERE host_id = ?';
  const params = [req.params.id];

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (client) {
    sql += ' AND client = ?';
    params.push(client);
  }
  if (protocol) {
    sql += ' AND protocol = ?';
    params.push(protocol);
  }

  sql += ' ORDER BY port_number';
  res.json(req.db.prepare(sql).all(...params));
});

portsRouter.post('/hosts/:id/ports', (req, res) => {
  const host = req.db.prepare('SELECT id FROM hosts WHERE id = ?').get(req.params.id);
  if (!host) return res.status(404).json({ error: 'Host not found' });

  const { port_number, port_end, service_name, protocol, status, tags, notes, client, domain, tunnel, tunnel_id } = req.body;
  if (!port_number || !service_name) {
    return res.status(400).json({ error: 'port_number and service_name are required' });
  }

  try {
    const result = req.db.prepare(`
      INSERT INTO ports (host_id, port_number, port_end, service_name, protocol, status, tags, notes, client, domain, tunnel, tunnel_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.params.id,
      port_number,
      port_end || null,
      service_name,
      protocol || 'TCP',
      status || 'active',
      JSON.stringify(tags || []),
      notes || null,
      client || null,
      domain || null,
      tunnel || null,
      tunnel_id || null
    );

    const port = req.db.prepare('SELECT * FROM ports WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(port);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      const existing = req.db.prepare(
        'SELECT service_name FROM ports WHERE host_id = ? AND port_number = ? AND protocol = ?'
      ).get(req.params.id, port_number, protocol || 'TCP');
      return res.status(409).json({
        error: `Port ${port_number}/${protocol || 'TCP'} is already used by "${existing?.service_name}" on this host`
      });
    }
    throw err;
  }
});

portsRouter.put('/ports/:id', (req, res) => {
  const existing = req.db.prepare('SELECT * FROM ports WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Port not found' });

  const { port_number, port_end, service_name, protocol, status, tags, notes, client, domain, tunnel, tunnel_id } = req.body;

  req.db.prepare(`
    UPDATE ports SET
      port_number = ?, port_end = ?, service_name = ?, protocol = ?, status = ?,
      tags = ?, notes = ?, client = ?, domain = ?, tunnel = ?, tunnel_id = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    port_number ?? existing.port_number,
    port_end !== undefined ? port_end : existing.port_end,
    service_name || existing.service_name,
    protocol || existing.protocol,
    status || existing.status,
    tags ? JSON.stringify(tags) : existing.tags,
    notes !== undefined ? notes : existing.notes,
    client !== undefined ? client : existing.client,
    domain !== undefined ? domain : existing.domain,
    tunnel !== undefined ? tunnel : existing.tunnel,
    tunnel_id !== undefined ? tunnel_id : existing.tunnel_id,
    req.params.id
  );

  const port = req.db.prepare('SELECT * FROM ports WHERE id = ?').get(req.params.id);
  res.json(port);
});

portsRouter.delete('/ports/:id', (req, res) => {
  const result = req.db.prepare('DELETE FROM ports WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Port not found' });
  res.status(204).end();
});
```

Note: The ports router uses mixed paths (`/hosts/:id/ports` and `/ports/:id`). It is mounted at `/api` in both `test/setup.js` and `server/index.js`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- test/ports.test.js`
Expected: All 9 tests PASS.

- [ ] **Step 5: Run all tests to confirm nothing broke**

Run: `npm test`
Expected: All tests PASS (hosts + ports).

- [ ] **Step 6: Commit**

```bash
git add server/routes/ports.js test/ports.test.js test/setup.js
git commit -m "feat: ports CRUD API with conflict detection and tests"
```

---

### Task 5: Notes API (TDD)

**Files:**
- Modify: `server/routes/notes.js`
- Create: `test/notes.test.js`

- [ ] **Step 1: Write failing tests**

Create `test/notes.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './setup.js';

describe('Notes API', () => {
  let app, db;

  beforeEach(() => {
    ({ app, db } = createTestApp());
    db.prepare('INSERT INTO hosts (name, ip_address) VALUES (?, ?)').run('host-1', '10.0.0.1');
  });

  describe('GET /api/notes', () => {
    it('returns all notes', async () => {
      db.prepare("INSERT INTO notes (title, content) VALUES (?, ?)").run('Global Note', 'Some content');
      db.prepare("INSERT INTO notes (host_id, title, content) VALUES (?, ?, ?)").run(1, 'Host Note', 'Linked content');

      const res = await request(app).get('/api/notes');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    it('filters by host_id', async () => {
      db.prepare("INSERT INTO notes (title, content) VALUES (?, ?)").run('Global', 'Content');
      db.prepare("INSERT INTO notes (host_id, title, content) VALUES (?, ?, ?)").run(1, 'Host', 'Content');

      const res = await request(app).get('/api/notes?host_id=1');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].title).toBe('Host');
    });
  });

  describe('POST /api/notes', () => {
    it('creates a global note', async () => {
      const res = await request(app)
        .post('/api/notes')
        .send({ title: 'Reminder', content: 'Renew SSL certs' });

      expect(res.status).toBe(201);
      expect(res.body.host_id).toBeNull();
      expect(res.body.title).toBe('Reminder');
    });

    it('creates a host-linked note', async () => {
      const res = await request(app)
        .post('/api/notes')
        .send({ title: 'Setup', content: 'Initial config', host_id: 1 });

      expect(res.status).toBe(201);
      expect(res.body.host_id).toBe(1);
    });

    it('returns 400 when title is missing', async () => {
      const res = await request(app)
        .post('/api/notes')
        .send({ content: 'No title' });
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/notes/:id', () => {
    it('updates a note', async () => {
      db.prepare("INSERT INTO notes (title, content) VALUES (?, ?)").run('Old', 'Old content');

      const res = await request(app)
        .put('/api/notes/1')
        .send({ title: 'Updated', content: 'New content' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated');
    });
  });

  describe('DELETE /api/notes/:id', () => {
    it('deletes a note', async () => {
      db.prepare("INSERT INTO notes (title, content) VALUES (?, ?)").run('Delete me', 'Content');

      const res = await request(app).delete('/api/notes/1');
      expect(res.status).toBe(204);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- test/notes.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement notes router**

Update `server/routes/notes.js`:

```js
import { Router } from 'express';

export const notesRouter = Router();

notesRouter.get('/', (req, res) => {
  const { host_id } = req.query;
  if (host_id) {
    res.json(req.db.prepare('SELECT * FROM notes WHERE host_id = ? ORDER BY updated_at DESC').all(host_id));
  } else {
    res.json(req.db.prepare('SELECT * FROM notes ORDER BY updated_at DESC').all());
  }
});

notesRouter.post('/', (req, res) => {
  const { title, content, host_id } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: 'title and content are required' });
  }

  const result = req.db.prepare(
    'INSERT INTO notes (host_id, title, content) VALUES (?, ?, ?)'
  ).run(host_id || null, title, content);

  const note = req.db.prepare('SELECT * FROM notes WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(note);
});

notesRouter.put('/:id', (req, res) => {
  const existing = req.db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Note not found' });

  const { title, content, host_id } = req.body;
  req.db.prepare(`
    UPDATE notes SET title = ?, content = ?, host_id = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    title || existing.title,
    content || existing.content,
    host_id !== undefined ? host_id : existing.host_id,
    req.params.id
  );

  const note = req.db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  res.json(note);
});

notesRouter.delete('/:id', (req, res) => {
  const result = req.db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Note not found' });
  res.status(204).end();
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- test/notes.test.js`
Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes/notes.js test/notes.test.js
git commit -m "feat: notes CRUD API with tests"
```

---

### Task 6: Search API (TDD)

**Files:**
- Modify: `server/routes/search.js`
- Create: `test/search.test.js`

- [ ] **Step 1: Write failing tests**

Create `test/search.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './setup.js';

describe('Search API', () => {
  let app, db;

  beforeEach(() => {
    ({ app, db } = createTestApp());
    db.prepare('INSERT INTO hosts (name, ip_address) VALUES (?, ?)').run('proxmox-01', '192.168.1.10');
    db.prepare('INSERT INTO hosts (name, ip_address) VALUES (?, ?)').run('docker-host', '192.168.1.20');
    db.prepare("INSERT INTO ports (host_id, port_number, service_name, client, domain) VALUES (?, ?, ?, ?, ?)").run(1, 8006, 'Proxmox UI', 'Internal', 'proxmox.lark.dev');
    db.prepare("INSERT INTO ports (host_id, port_number, service_name, client) VALUES (?, ?, ?, ?)").run(2, 3000, 'Client App', 'Acme Corp');
    db.prepare("INSERT INTO notes (title, content) VALUES (?, ?)").run('SSL Reminder', 'Renew certs for acme');
  });

  it('searches hosts by name', async () => {
    const res = await request(app).get('/api/search?q=proxmox');
    expect(res.status).toBe(200);
    expect(res.body.hosts).toHaveLength(1);
    expect(res.body.hosts[0].name).toBe('proxmox-01');
  });

  it('searches ports by service name', async () => {
    const res = await request(app).get('/api/search?q=Client%20App');
    expect(res.status).toBe(200);
    expect(res.body.ports).toHaveLength(1);
  });

  it('searches ports by domain', async () => {
    const res = await request(app).get('/api/search?q=lark.dev');
    expect(res.status).toBe(200);
    expect(res.body.ports).toHaveLength(1);
  });

  it('searches ports by client name', async () => {
    const res = await request(app).get('/api/search?q=Acme');
    expect(res.status).toBe(200);
    expect(res.body.ports).toHaveLength(1);
    expect(res.body.notes).toHaveLength(1);
  });

  it('searches notes by title and content', async () => {
    const res = await request(app).get('/api/search?q=SSL');
    expect(res.status).toBe(200);
    expect(res.body.notes).toHaveLength(1);
  });

  it('returns 400 without query', async () => {
    const res = await request(app).get('/api/search');
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- test/search.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement search router**

Update `server/routes/search.js`:

```js
import { Router } from 'express';

export const searchRouter = Router();

searchRouter.get('/', (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q parameter is required' });

  const pattern = `%${q}%`;

  const hosts = req.db.prepare(`
    SELECT * FROM hosts
    WHERE name LIKE ? OR ip_address LIKE ? OR os LIKE ? OR description LIKE ?
  `).all(pattern, pattern, pattern, pattern);

  const ports = req.db.prepare(`
    SELECT p.*, h.name as host_name, h.ip_address as host_ip
    FROM ports p
    JOIN hosts h ON h.id = p.host_id
    WHERE p.service_name LIKE ? OR p.notes LIKE ? OR p.client LIKE ?
      OR p.domain LIKE ? OR p.tunnel_id LIKE ? OR CAST(p.port_number AS TEXT) LIKE ?
  `).all(pattern, pattern, pattern, pattern, pattern, pattern);

  const notes = req.db.prepare(`
    SELECT * FROM notes
    WHERE title LIKE ? OR content LIKE ?
  `).all(pattern, pattern);

  res.json({ hosts, ports, notes });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- test/search.test.js`
Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes/search.js test/search.test.js
git commit -m "feat: global search API across hosts, ports, and notes"
```

---

### Task 7: Export API (TDD)

**Files:**
- Modify: `server/routes/export.js`
- Create: `test/export.test.js`

- [ ] **Step 1: Write failing tests**

Create `test/export.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './setup.js';

describe('Export API', () => {
  let app, db;

  beforeEach(() => {
    ({ app, db } = createTestApp());
    db.prepare('INSERT INTO hosts (name, ip_address) VALUES (?, ?)').run('proxmox-01', '192.168.1.10');
    db.prepare("INSERT INTO ports (host_id, port_number, service_name, protocol, status, client, domain, tunnel) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(1, 8006, 'Proxmox UI', 'TCP', 'active', 'Internal', 'proxmox.lark.dev', 'cloudflare');
    db.prepare("INSERT INTO ports (host_id, port_number, service_name) VALUES (?, ?, ?)").run(1, 22, 'SSH');
    db.prepare("INSERT INTO notes (host_id, title, content) VALUES (?, ?, ?)").run(1, 'Setup', 'Initial config');
  });

  describe('Markdown export', () => {
    it('exports all hosts as markdown', async () => {
      const res = await request(app).get('/api/export?format=markdown');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/markdown');
      expect(res.text).toContain('## proxmox-01');
      expect(res.text).toContain('8006');
      expect(res.text).toContain('Proxmox UI');
    });

    it('exports single host as markdown', async () => {
      const res = await request(app).get('/api/export?format=markdown&host_id=1');
      expect(res.status).toBe(200);
      expect(res.text).toContain('proxmox-01');
    });
  });

  describe('CSV export', () => {
    it('exports as CSV', async () => {
      const res = await request(app).get('/api/export?format=csv');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('Host,IP,Port,Service,Protocol,Status,Client,Domain,Tunnel');
      expect(res.text).toContain('proxmox-01,192.168.1.10,8006');
    });
  });

  describe('Text export', () => {
    it('exports as plain text', async () => {
      const res = await request(app).get('/api/export?format=text');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.text).toContain('proxmox-01 (192.168.1.10)');
      expect(res.text).toContain(':8006');
    });
  });

  it('filters by client', async () => {
    const res = await request(app).get('/api/export?format=csv&client=Internal');
    expect(res.status).toBe(200);
    const lines = res.text.trim().split('\n');
    expect(lines).toHaveLength(2);
  });

  it('returns 400 for invalid format', async () => {
    const res = await request(app).get('/api/export?format=xml');
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- test/export.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement export router**

Update `server/routes/export.js`:

```js
import { Router } from 'express';

export const exportRouter = Router();

function getExportData(db, { host_id, client }) {
  let hostSql = 'SELECT * FROM hosts';
  const hostParams = [];
  if (host_id) {
    hostSql += ' WHERE id = ?';
    hostParams.push(host_id);
  }
  hostSql += ' ORDER BY name';
  const hosts = db.prepare(hostSql).all(...hostParams);

  return hosts.map(host => {
    let portSql = 'SELECT * FROM ports WHERE host_id = ?';
    const portParams = [host.id];
    if (client) {
      portSql += ' AND client = ?';
      portParams.push(client);
    }
    portSql += ' ORDER BY port_number';
    const ports = db.prepare(portSql).all(...portParams);

    const notes = db.prepare(
      'SELECT * FROM notes WHERE host_id = ? ORDER BY updated_at DESC'
    ).all(host.id);

    return { ...host, ports, notes };
  }).filter(h => !client || h.ports.length > 0);
}

function formatPortNum(port) {
  if (port.port_end) return `${port.port_number}-${port.port_end}`;
  return String(port.port_number);
}

function toMarkdown(data) {
  let out = '# Port Tracker Export\n\n';

  for (const host of data) {
    out += `## ${host.name} (${host.ip_address})\n`;
    if (host.os) out += `**OS:** ${host.os}  \n`;
    if (host.type && host.type !== 'other') out += `**Type:** ${host.type}  \n`;
    if (host.description) out += `${host.description}  \n`;
    out += '\n';

    if (host.ports.length > 0) {
      out += '| Port | Service | Protocol | Status | Client | Domain | Tunnel |\n';
      out += '|------|---------|----------|--------|--------|--------|--------|\n';
      for (const p of host.ports) {
        const dash = '\u2014';
        out += `| ${formatPortNum(p)} | ${p.service_name} | ${p.protocol} | ${p.status} | ${p.client || dash} | ${p.domain || dash} | ${p.tunnel || dash} |\n`;
      }
      out += '\n';
    }

    if (host.notes.length > 0) {
      out += '### Notes\n';
      for (const n of host.notes) {
        out += `- **${n.title}:** ${n.content}\n`;
      }
      out += '\n';
    }
  }

  return out;
}

function toCsv(data) {
  let out = 'Host,IP,Port,Service,Protocol,Status,Client,Domain,Tunnel,Notes\n';

  for (const host of data) {
    for (const p of host.ports) {
      const esc = (s) => s && s.includes(',') ? `"${s}"` : (s || '');
      out += `${host.name},${host.ip_address},${formatPortNum(p)},${esc(p.service_name)},${p.protocol},${p.status},${esc(p.client)},${esc(p.domain)},${esc(p.tunnel)},${esc(p.notes)}\n`;
    }
  }

  return out;
}

function toText(data) {
  let out = '';

  for (const host of data) {
    out += `${host.name} (${host.ip_address})`;
    if (host.os) out += ` [${host.os}]`;
    out += '\n';

    for (const p of host.ports) {
      const portStr = `:${formatPortNum(p)}`.padEnd(12);
      const svc = p.service_name.padEnd(20);
      const proto = p.protocol.padEnd(5);
      const status = p.status.padEnd(10);
      let extras = '';
      if (p.client) extras += `client=${p.client} `;
      if (p.domain) extras += `domain=${p.domain} `;
      if (p.tunnel) extras += `tunnel=${p.tunnel}`;
      out += `  ${portStr}${svc}${proto}${status}${extras}\n`;
    }

    if (host.notes.length > 0) {
      out += '  Notes:\n';
      for (const n of host.notes) {
        out += `    - ${n.title}: ${n.content}\n`;
      }
    }
    out += '\n';
  }

  return out;
}

exportRouter.get('/', (req, res) => {
  const { format, host_id, client } = req.query;

  if (!['markdown', 'csv', 'text'].includes(format)) {
    return res.status(400).json({ error: 'format must be markdown, csv, or text' });
  }

  const data = getExportData(req.db, { host_id, client });

  const formatters = { markdown: toMarkdown, csv: toCsv, text: toText };
  const contentTypes = {
    markdown: 'text/markdown; charset=utf-8',
    csv: 'text/csv; charset=utf-8',
    text: 'text/plain; charset=utf-8'
  };

  res.set('Content-Type', contentTypes[format]);
  res.send(formatters[format](data));
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- test/export.test.js`
Expected: All 5 tests PASS.

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All tests PASS (hosts + ports + notes + search + export).

- [ ] **Step 6: Commit**

```bash
git add server/routes/export.js test/export.test.js
git commit -m "feat: multi-format export API (markdown, CSV, plain text)"
```

---

### Task 8: Express Server Entry Point

**Files:**
- Create: `server/index.js`

- [ ] **Step 1: Create server/index.js**

```js
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from './db.js';
import { hostsRouter } from './routes/hosts.js';
import { portsRouter } from './routes/ports.js';
import { notesRouter } from './routes/notes.js';
import { searchRouter } from './routes/search.js';
import { exportRouter } from './routes/export.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const db = getDb();
app.use((req, res, next) => {
  req.db = db;
  next();
});

app.use('/api/hosts', hostsRouter);
app.use('/api', portsRouter);
app.use('/api/notes', notesRouter);
app.use('/api/search', searchRouter);
app.use('/api/export', exportRouter);

if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Port Tracker running at http://localhost:${PORT}`);
});

export default app;
```

- [ ] **Step 2: Verify server starts**

```bash
node server/index.js &
curl http://localhost:3000/api/hosts
# Expected: []
kill %1
```

- [ ] **Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat: Express server entry point with API routes and static serving"
```

---

### Task 9: React App Shell + API Client + Styles

**Files:**
- Create: `client/src/App.jsx`
- Create: `client/src/App.css`
- Create: `client/src/api.js`
- Modify: `client/src/main.jsx`

- [ ] **Step 1: Create client/src/api.js**

```js
const API = '/api';

async function request(url, options = {}) {
  const res = await fetch(API + url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  });
  if (res.status === 204) return null;
  const data = res.headers.get('content-type')?.includes('json')
    ? await res.json()
    : await res.text();
  if (!res.ok) {
    const err = typeof data === 'object' ? data : { error: data };
    err.status = res.status;
    throw err;
  }
  return data;
}

export const getHosts = () => request('/hosts');
export const getHost = (id) => request(`/hosts/${id}`);
export const createHost = (data) => request('/hosts', { method: 'POST', body: JSON.stringify(data) });
export const updateHost = (id, data) => request(`/hosts/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteHost = (id) => request(`/hosts/${id}`, { method: 'DELETE' });

export const getPorts = (hostId, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/hosts/${hostId}/ports${qs ? '?' + qs : ''}`);
};
export const createPort = (hostId, data) => request(`/hosts/${hostId}/ports`, { method: 'POST', body: JSON.stringify(data) });
export const updatePort = (id, data) => request(`/ports/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deletePort = (id) => request(`/ports/${id}`, { method: 'DELETE' });

export const getNotes = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/notes${qs ? '?' + qs : ''}`);
};
export const createNote = (data) => request('/notes', { method: 'POST', body: JSON.stringify(data) });
export const updateNote = (id, data) => request(`/notes/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteNote = (id) => request(`/notes/${id}`, { method: 'DELETE' });

export const search = (q) => request(`/search?q=${encodeURIComponent(q)}`);

export const exportData = (format, params = {}) => {
  const qs = new URLSearchParams({ format, ...params }).toString();
  return request(`/export?${qs}`);
};
```

- [ ] **Step 2: Create client/src/App.css**

Full CSS file with dark theme. See the complete CSS in the spec mockup styles:

```css
* { margin: 0; padding: 0; box-sizing: border-box; }

:root {
  --bg-primary: #0f0f1a;
  --bg-secondary: #16213e;
  --bg-tertiary: #1a1a2e;
  --bg-hover: #1e2a4a;
  --text-primary: #e0e0e0;
  --text-secondary: #a0a0b0;
  --text-muted: #666680;
  --accent: #e94560;
  --accent-hover: #ff5675;
  --blue: #0f3460;
  --blue-light: #1a4a80;
  --green: #0a4d2e;
  --yellow: #4d3a0a;
  --border: #2a2a3e;
  --radius: 6px;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  height: 100vh;
  overflow: hidden;
}

#root { height: 100vh; }
.app { display: flex; height: 100vh; }

/* Sidebar */
.sidebar {
  width: 260px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.sidebar-header { padding: 16px; border-bottom: 1px solid var(--border); }
.sidebar-title { font-size: 18px; font-weight: 700; color: var(--accent); margin-bottom: 12px; }
.search-input {
  width: 100%; padding: 8px 12px; background: var(--bg-primary);
  border: 1px solid var(--border); border-radius: var(--radius);
  color: var(--text-primary); font-size: 13px; outline: none;
}
.search-input:focus { border-color: var(--accent); }
.host-list { flex: 1; overflow-y: auto; padding: 8px; }
.host-item {
  padding: 10px 12px; border-radius: var(--radius); cursor: pointer;
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;
}
.host-item:hover { background: var(--bg-hover); }
.host-item.active { background: var(--blue); }
.host-item-name { font-size: 14px; font-weight: 500; }
.host-item-ip { font-size: 11px; color: var(--text-muted); }
.host-item-count {
  background: var(--bg-tertiary); padding: 2px 8px; border-radius: 10px;
  font-size: 11px; color: var(--text-secondary);
}
.sidebar-footer { padding: 12px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 6px; }
.sidebar-nav-item {
  padding: 8px 12px; border-radius: var(--radius); cursor: pointer;
  font-size: 14px; color: var(--text-secondary);
}
.sidebar-nav-item:hover { background: var(--bg-hover); color: var(--text-primary); }
.sidebar-nav-item.active { background: var(--blue); color: var(--text-primary); }

/* Buttons */
.btn {
  padding: 8px 16px; border: none; border-radius: var(--radius);
  cursor: pointer; font-size: 13px; font-weight: 500; transition: background 0.15s;
}
.btn-primary { background: var(--accent); color: white; }
.btn-primary:hover { background: var(--accent-hover); }
.btn-secondary { background: var(--blue); color: var(--text-primary); }
.btn-secondary:hover { background: var(--blue-light); }
.btn-danger { background: transparent; color: var(--accent); padding: 4px 8px; }
.btn-danger:hover { background: rgba(233, 69, 96, 0.1); }
.btn-sm { padding: 4px 10px; font-size: 12px; }
.btn-full { width: 100%; }

/* Main Content */
.main { flex: 1; overflow-y: auto; padding: 24px; }
.main-header {
  display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;
}
.main-header h2 { font-size: 22px; font-weight: 600; }
.main-header .host-meta { color: var(--text-secondary); font-size: 13px; margin-top: 4px; }
.main-actions { display: flex; gap: 8px; }

/* Table */
.port-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.port-table th {
  text-align: left; padding: 10px 12px; color: var(--text-muted);
  font-weight: 500; font-size: 11px; text-transform: uppercase;
  border-bottom: 1px solid var(--border); cursor: pointer; user-select: none;
}
.port-table th:hover { color: var(--text-secondary); }
.port-table td { padding: 10px 12px; border-bottom: 1px solid var(--border); }
.port-table tr:hover td { background: var(--bg-tertiary); }
.port-number { color: var(--accent); font-weight: 600; font-family: monospace; }
.status-badge { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; cursor: pointer; }
.status-active { background: var(--green); color: #4ade80; }
.status-inactive { background: var(--yellow); color: #fbbf24; }
.tag {
  display: inline-block; background: var(--bg-primary); padding: 2px 8px;
  border-radius: 4px; font-size: 11px; color: var(--text-secondary); margin-right: 4px;
}
.tunnel-badge {
  display: inline-flex; align-items: center; gap: 4px; background: #1a1a3e;
  padding: 2px 8px; border-radius: 4px; font-size: 11px; color: #f48120;
}
.cell-actions { display: flex; gap: 4px; opacity: 0; }
.port-table tr:hover .cell-actions { opacity: 1; }

/* Modal */
.modal-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.7); display: flex;
  align-items: center; justify-content: center; z-index: 100;
}
.modal {
  background: var(--bg-secondary); border: 1px solid var(--border);
  border-radius: 8px; width: 480px; max-height: 80vh; overflow-y: auto; padding: 24px;
}
.modal h3 { margin-bottom: 16px; font-size: 18px; }
.form-group { margin-bottom: 14px; }
.form-group label {
  display: block; font-size: 12px; color: var(--text-secondary);
  margin-bottom: 4px; text-transform: uppercase;
}
.form-group input, .form-group select, .form-group textarea {
  width: 100%; padding: 8px 12px; background: var(--bg-primary);
  border: 1px solid var(--border); border-radius: var(--radius);
  color: var(--text-primary); font-size: 14px; font-family: inherit; outline: none;
}
.form-group input:focus, .form-group select:focus, .form-group textarea:focus {
  border-color: var(--accent);
}
.form-group textarea { min-height: 80px; resize: vertical; }
.form-row { display: flex; gap: 12px; }
.form-row .form-group { flex: 1; }
.form-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
.form-error {
  color: var(--accent); font-size: 13px; margin-top: 8px; padding: 8px;
  background: rgba(233, 69, 96, 0.1); border-radius: var(--radius);
}

/* Export Panel */
.export-panel {
  background: var(--bg-tertiary); border: 1px solid var(--border);
  border-radius: 8px; padding: 20px; margin-top: 20px;
}
.export-options { display: flex; gap: 8px; margin-bottom: 16px; }
.export-option {
  padding: 6px 14px; border-radius: var(--radius); border: 1px solid var(--border);
  background: transparent; color: var(--text-secondary); cursor: pointer; font-size: 13px;
}
.export-option.active { background: var(--blue); border-color: var(--blue); color: var(--text-primary); }
.export-preview {
  background: var(--bg-primary); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 16px; font-family: monospace; font-size: 12px; white-space: pre-wrap;
  max-height: 300px; overflow-y: auto; margin-bottom: 12px;
}
.copy-success { color: #4ade80; font-size: 13px; }

/* Notes */
.notes-section { margin-top: 24px; }
.notes-section h3 { font-size: 16px; margin-bottom: 12px; color: var(--text-secondary); }
.note-card {
  background: var(--bg-tertiary); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 14px; margin-bottom: 8px;
}
.note-card-header {
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;
}
.note-card-title { font-weight: 600; font-size: 14px; }
.note-card-content { font-size: 13px; color: var(--text-secondary); line-height: 1.5; }
.note-card-meta { font-size: 11px; color: var(--text-muted); margin-top: 8px; }

/* Search Results */
.search-results-section { margin-bottom: 24px; }
.search-results-section h3 {
  font-size: 14px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px;
}
.search-result-item {
  padding: 10px 14px; background: var(--bg-tertiary); border: 1px solid var(--border);
  border-radius: var(--radius); margin-bottom: 6px; cursor: pointer;
}
.search-result-item:hover { border-color: var(--accent); }

/* Empty State */
.empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 60vh; color: var(--text-muted); text-align: center;
}
.empty-state h2 { font-size: 20px; margin-bottom: 8px; color: var(--text-secondary); }
.empty-state p { font-size: 14px; margin-bottom: 16px; }
```

- [ ] **Step 3: Create client/src/App.jsx**

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import * as api from './api.js';
import { Sidebar } from './components/Sidebar.jsx';
import { HostDetail } from './components/HostDetail.jsx';
import { NotesList } from './components/NotesList.jsx';
import { SearchResults } from './components/SearchResults.jsx';

export default function App() {
  const [hosts, setHosts] = useState([]);
  const [selectedHostId, setSelectedHostId] = useState(null);
  const [view, setView] = useState('host');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);

  const refreshHosts = useCallback(async () => {
    const data = await api.getHosts();
    setHosts(data);
  }, []);

  useEffect(() => { refreshHosts(); }, [refreshHosts]);

  const handleSelectHost = (id) => {
    setSelectedHostId(id);
    setView('host');
    setSearchQuery('');
    setSearchResults(null);
  };

  const handleShowNotes = () => {
    setSelectedHostId(null);
    setView('notes');
    setSearchQuery('');
    setSearchResults(null);
  };

  const handleSearch = async (q) => {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults(null);
      if (!selectedHostId) setView('host');
      return;
    }
    setView('search');
    const results = await api.search(q);
    setSearchResults(results);
  };

  return (
    <div className="app">
      <Sidebar
        hosts={hosts}
        selectedHostId={selectedHostId}
        onSelectHost={handleSelectHost}
        onShowNotes={handleShowNotes}
        onSearch={handleSearch}
        searchQuery={searchQuery}
        view={view}
        onHostCreated={refreshHosts}
      />
      <div className="main">
        {view === 'search' && searchResults && (
          <SearchResults results={searchResults} query={searchQuery} onSelectHost={handleSelectHost} />
        )}
        {view === 'host' && selectedHostId && (
          <HostDetail
            hostId={selectedHostId}
            onHostUpdated={refreshHosts}
            onHostDeleted={async () => { setSelectedHostId(null); await refreshHosts(); }}
            hosts={hosts}
          />
        )}
        {view === 'host' && !selectedHostId && (
          <div className="empty-state">
            <h2>Port Tracker</h2>
            <p>Select a host from the sidebar or add a new one to get started.</p>
          </div>
        )}
        {view === 'notes' && <NotesList hosts={hosts} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update client/src/main.jsx**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 5: Commit**

```bash
git add client/src/
git commit -m "feat: React app shell with API client, styles, and layout"
```

---

### Task 10: Sidebar + Modal + Host Form Components

**Files:**
- Create: `client/src/components/Sidebar.jsx`
- Create: `client/src/components/Modal.jsx`
- Create: `client/src/components/HostForm.jsx`

- [ ] **Step 1: Create client/src/components/Modal.jsx**

```jsx
import React, { useEffect } from 'react';

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create client/src/components/HostForm.jsx**

```jsx
import React, { useState } from 'react';
import { Modal } from './Modal.jsx';
import * as api from '../api.js';

export function HostForm({ host, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: host?.name || '',
    ip_address: host?.ip_address || '',
    os: host?.os || '',
    type: host?.type || 'other',
    description: host?.description || ''
  });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (host) {
        await api.updateHost(host.id, form);
      } else {
        await api.createHost(form);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err.error || 'Failed to save host');
    }
  };

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  return (
    <Modal title={host ? 'Edit Host' : 'Add Host'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label>Name</label>
            <input value={form.name} onChange={set('name')} placeholder="proxmox-01" required />
          </div>
          <div className="form-group">
            <label>IP Address</label>
            <input value={form.ip_address} onChange={set('ip_address')} placeholder="192.168.1.10" required />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>OS</label>
            <input value={form.os} onChange={set('os')} placeholder="Ubuntu 22.04" />
          </div>
          <div className="form-group">
            <label>Type</label>
            <select value={form.type} onChange={set('type')}>
              <option value="physical">Physical</option>
              <option value="vm">VM</option>
              <option value="container">Container</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>Description</label>
          <textarea value={form.description} onChange={set('description')} placeholder="Optional description..." />
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">{host ? 'Save' : 'Add Host'}</button>
        </div>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 3: Create client/src/components/Sidebar.jsx**

```jsx
import React, { useState } from 'react';
import { HostForm } from './HostForm.jsx';

export function Sidebar({ hosts, selectedHostId, onSelectHost, onShowNotes, onSearch, searchQuery, view, onHostCreated }) {
  const [showHostForm, setShowHostForm] = useState(false);

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title">Port Tracker</div>
        <input
          className="search-input"
          placeholder="Search hosts, ports, domains..."
          value={searchQuery}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
      <div className="host-list">
        {hosts.map((host) => (
          <div
            key={host.id}
            className={`host-item ${selectedHostId === host.id && view === 'host' ? 'active' : ''}`}
            onClick={() => onSelectHost(host.id)}
          >
            <div>
              <div className="host-item-name">{host.name}</div>
              <div className="host-item-ip">{host.ip_address}</div>
            </div>
            <span className="host-item-count">{host.port_count}</span>
          </div>
        ))}
      </div>
      <div className="sidebar-footer">
        <div
          className={`sidebar-nav-item ${view === 'notes' ? 'active' : ''}`}
          onClick={onShowNotes}
        >
          Notes
        </div>
        <button className="btn btn-primary btn-full" onClick={() => setShowHostForm(true)}>
          + Add Host
        </button>
      </div>
      {showHostForm && (
        <HostForm onClose={() => setShowHostForm(false)} onSaved={onHostCreated} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add client/src/components/Sidebar.jsx client/src/components/Modal.jsx client/src/components/HostForm.jsx
git commit -m "feat: sidebar with host list, search, and host form modal"
```

---

### Task 11: Host Detail + Port Table + Port Form

**Files:**
- Create: `client/src/components/HostDetail.jsx`
- Create: `client/src/components/PortTable.jsx`
- Create: `client/src/components/PortForm.jsx`
- Create: `client/src/components/NoteForm.jsx` (stub)
- Create: `client/src/components/ExportPanel.jsx` (stub)
- Create: `client/src/components/NotesList.jsx` (stub)
- Create: `client/src/components/SearchResults.jsx` (stub)

- [ ] **Step 1: Create stub components**

Create `client/src/components/NoteForm.jsx`:
```jsx
import React from 'react';
export function NoteForm() { return null; }
```

Create `client/src/components/ExportPanel.jsx`:
```jsx
import React from 'react';
export function ExportPanel() { return null; }
```

Create `client/src/components/NotesList.jsx`:
```jsx
import React from 'react';
export function NotesList() {
  return <div className="empty-state"><h2>Notes</h2><p>Coming soon...</p></div>;
}
```

Create `client/src/components/SearchResults.jsx`:
```jsx
import React from 'react';
export function SearchResults() { return null; }
```

- [ ] **Step 2: Create client/src/components/PortTable.jsx**

```jsx
import React, { useState } from 'react';
import * as api from '../api.js';

export function PortTable({ ports, onPortUpdated, onEditPort }) {
  const [sortField, setSortField] = useState('port_number');
  const [sortDir, setSortDir] = useState('asc');

  const handleSort = (field) => {
    if (sortField === field) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const sorted = [...ports].sort((a, b) => {
    const aVal = a[sortField] ?? '';
    const bVal = b[sortField] ?? '';
    const cmp = typeof aVal === 'number' ? aVal - bVal : String(aVal).localeCompare(String(bVal));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const toggleStatus = async (port) => {
    await api.updatePort(port.id, { status: port.status === 'active' ? 'inactive' : 'active' });
    onPortUpdated();
  };

  const handleDelete = async (port) => {
    if (!confirm(`Delete port ${port.port_number} (${port.service_name})?`)) return;
    await api.deletePort(port.id);
    onPortUpdated();
  };

  const formatPort = (p) => p.port_end ? `${p.port_number}-${p.port_end}` : p.port_number;

  const renderTags = (tagsStr) => {
    try {
      return JSON.parse(tagsStr || '[]').map((t, i) => <span key={i} className="tag">{t}</span>);
    } catch { return null; }
  };

  const columns = [
    { key: 'port_number', label: 'Port' },
    { key: 'service_name', label: 'Service' },
    { key: 'protocol', label: 'Protocol' },
    { key: 'status', label: 'Status' },
    { key: 'client', label: 'Client' },
    { key: 'domain', label: 'Domain' },
    { key: 'tunnel', label: 'Tunnel' },
    { key: 'tags', label: 'Tags' },
    { key: 'notes', label: 'Notes' },
  ];

  return (
    <table className="port-table">
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key} onClick={() => handleSort(col.key)}>
              {col.label} {sortField === col.key ? (sortDir === 'asc' ? '\u2191' : '\u2193') : ''}
            </th>
          ))}
          <th></th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((port) => (
          <tr key={port.id}>
            <td><span className="port-number">{formatPort(port)}</span></td>
            <td>{port.service_name}</td>
            <td style={{ color: 'var(--text-muted)' }}>{port.protocol}</td>
            <td>
              <span
                className={`status-badge ${port.status === 'active' ? 'status-active' : 'status-inactive'}`}
                onClick={() => toggleStatus(port)}
              >{port.status}</span>
            </td>
            <td>{port.client || ''}</td>
            <td>{port.domain || ''}</td>
            <td>{port.tunnel ? <span className="tunnel-badge">{port.tunnel}</span> : ''}</td>
            <td>{renderTags(port.tags)}</td>
            <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{port.notes || ''}</td>
            <td>
              <div className="cell-actions">
                {onEditPort && <button className="btn btn-secondary btn-sm" onClick={() => onEditPort(port)}>Edit</button>}
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(port)}>Delete</button>
              </div>
            </td>
          </tr>
        ))}
        {sorted.length === 0 && (
          <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
            No ports yet. Click "Add Port" to get started.
          </td></tr>
        )}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 3: Create client/src/components/PortForm.jsx**

```jsx
import React, { useState } from 'react';
import { Modal } from './Modal.jsx';
import * as api from '../api.js';

export function PortForm({ hostId, port, onClose, onSaved }) {
  const [form, setForm] = useState({
    port_number: port?.port_number || '',
    port_end: port?.port_end || '',
    service_name: port?.service_name || '',
    protocol: port?.protocol || 'TCP',
    status: port?.status || 'active',
    tags: port ? (JSON.parse(port.tags || '[]')).join(', ') : '',
    notes: port?.notes || '',
    client: port?.client || '',
    domain: port?.domain || '',
    tunnel: port?.tunnel || '',
    tunnel_id: port?.tunnel_id || ''
  });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const data = {
      port_number: Number(form.port_number),
      port_end: form.port_end ? Number(form.port_end) : null,
      service_name: form.service_name,
      protocol: form.protocol,
      status: form.status,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      notes: form.notes || null,
      client: form.client || null,
      domain: form.domain || null,
      tunnel: form.tunnel || null,
      tunnel_id: form.tunnel_id || null
    };
    try {
      if (port) await api.updatePort(port.id, data);
      else await api.createPort(hostId, data);
      onSaved();
      onClose();
    } catch (err) {
      setError(err.error || 'Failed to save port');
    }
  };

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  return (
    <Modal title={port ? 'Edit Port' : 'Add Port'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label>Port Number</label>
            <input type="number" value={form.port_number} onChange={set('port_number')} min="1" max="65535" required />
          </div>
          <div className="form-group">
            <label>Port End (range)</label>
            <input type="number" value={form.port_end} onChange={set('port_end')} min="1" max="65535" placeholder="Optional" />
          </div>
        </div>
        <div className="form-group">
          <label>Service Name</label>
          <input value={form.service_name} onChange={set('service_name')} placeholder="Nginx, Portainer, SSH..." required />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Protocol</label>
            <select value={form.protocol} onChange={set('protocol')}>
              <option value="TCP">TCP</option>
              <option value="UDP">UDP</option>
            </select>
          </div>
          <div className="form-group">
            <label>Status</label>
            <select value={form.status} onChange={set('status')}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Client / Project</label>
            <input value={form.client} onChange={set('client')} placeholder="Acme Corp" />
          </div>
          <div className="form-group">
            <label>Domain</label>
            <input value={form.domain} onChange={set('domain')} placeholder="app.example.com" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Tunnel Type</label>
            <select value={form.tunnel} onChange={set('tunnel')}>
              <option value="">None</option>
              <option value="cloudflare">Cloudflare</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="form-group">
            <label>Tunnel ID</label>
            <input value={form.tunnel_id} onChange={set('tunnel_id')} placeholder="tunnel-abc-123" />
          </div>
        </div>
        <div className="form-group">
          <label>Tags (comma-separated)</label>
          <input value={form.tags} onChange={set('tags')} placeholder="web, proxy, monitoring" />
        </div>
        <div className="form-group">
          <label>Notes</label>
          <textarea value={form.notes} onChange={set('notes')} placeholder="Optional notes..." />
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">{port ? 'Save' : 'Add Port'}</button>
        </div>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 4: Create client/src/components/HostDetail.jsx**

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import * as api from '../api.js';
import { PortTable } from './PortTable.jsx';
import { PortForm } from './PortForm.jsx';
import { HostForm } from './HostForm.jsx';
import { NoteForm } from './NoteForm.jsx';
import { ExportPanel } from './ExportPanel.jsx';

export function HostDetail({ hostId, onHostUpdated, onHostDeleted, hosts }) {
  const [host, setHost] = useState(null);
  const [showPortForm, setShowPortForm] = useState(false);
  const [editPort, setEditPort] = useState(null);
  const [showHostEdit, setShowHostEdit] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);

  const refresh = useCallback(async () => {
    const data = await api.getHost(hostId);
    setHost(data);
  }, [hostId]);

  useEffect(() => { refresh(); }, [refresh]);

  if (!host) return null;

  const handleDelete = async () => {
    if (!confirm(`Delete host "${host.name}" and all its ports?`)) return;
    await api.deleteHost(host.id);
    onHostDeleted();
  };

  const typeLabel = { physical: 'Physical', vm: 'VM', container: 'Container', other: '' };

  return (
    <div>
      <div className="main-header">
        <div>
          <h2>
            {host.name}
            <span style={{ color: 'var(--text-muted)', fontSize: '14px', marginLeft: '12px', fontWeight: 400 }}>
              {host.ip_address}
            </span>
          </h2>
          <div className="host-meta">
            {host.os && <span>{host.os}</span>}
            {host.os && host.type !== 'other' && <span> &middot; </span>}
            {host.type !== 'other' && <span>{typeLabel[host.type]}</span>}
            {host.description && <span> &middot; {host.description}</span>}
          </div>
        </div>
        <div className="main-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => setShowExport(!showExport)}>Export</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowHostEdit(true)}>Edit</button>
          <button className="btn btn-danger btn-sm" onClick={handleDelete}>Delete</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setEditPort(null); setShowPortForm(true); }}>+ Add Port</button>
        </div>
      </div>

      {showExport && <ExportPanel hostId={host.id} hosts={hosts} />}

      <PortTable
        ports={host.ports || []}
        onPortUpdated={async () => { await refresh(); onHostUpdated(); }}
        onEditPort={(port) => { setEditPort(port); setShowPortForm(true); }}
      />

      <div className="notes-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3>Notes</h3>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowNoteForm(true)}>+ Add Note</button>
        </div>
        {(host.notes || []).map((note) => (
          <div key={note.id} className="note-card">
            <div className="note-card-header">
              <span className="note-card-title">{note.title}</span>
              <button className="btn btn-danger btn-sm" onClick={async () => { await api.deleteNote(note.id); refresh(); }}>Delete</button>
            </div>
            <div className="note-card-content">{note.content}</div>
          </div>
        ))}
      </div>

      {showPortForm && (
        <PortForm
          hostId={host.id} port={editPort}
          onClose={() => { setShowPortForm(false); setEditPort(null); }}
          onSaved={async () => { await refresh(); onHostUpdated(); }}
        />
      )}
      {showHostEdit && (
        <HostForm host={host} onClose={() => setShowHostEdit(false)} onSaved={async () => { await refresh(); onHostUpdated(); }} />
      )}
      {showNoteForm && (
        <NoteForm hostId={host.id} onClose={() => setShowNoteForm(false)} onSaved={refresh} />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify host detail view works**

Start both servers (Express + Vite dev), add a host, click it, verify port table renders, add a port, verify it appears.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/
git commit -m "feat: host detail view with port table, port form, and inline actions"
```

---

### Task 12: Notes Components

**Files:**
- Modify: `client/src/components/NoteForm.jsx`
- Modify: `client/src/components/NotesList.jsx`

- [ ] **Step 1: Implement NoteForm**

Replace `client/src/components/NoteForm.jsx`:

```jsx
import React, { useState } from 'react';
import { Modal } from './Modal.jsx';
import * as api from '../api.js';

export function NoteForm({ note, hostId, hosts, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: note?.title || '',
    content: note?.content || '',
    host_id: note?.host_id ?? hostId ?? ''
  });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const data = {
      title: form.title,
      content: form.content,
      host_id: form.host_id ? Number(form.host_id) : null
    };
    try {
      if (note) await api.updateNote(note.id, data);
      else await api.createNote(data);
      onSaved();
      onClose();
    } catch (err) {
      setError(err.error || 'Failed to save note');
    }
  };

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  return (
    <Modal title={note ? 'Edit Note' : 'Add Note'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Title</label>
          <input value={form.title} onChange={set('title')} placeholder="Note title" required />
        </div>
        <div className="form-group">
          <label>Content</label>
          <textarea value={form.content} onChange={set('content')} placeholder="Write your note..." required />
        </div>
        {hosts && (
          <div className="form-group">
            <label>Link to Host (optional)</label>
            <select value={form.host_id} onChange={set('host_id')}>
              <option value="">Global (no host)</option>
              {hosts.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </div>
        )}
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">{note ? 'Save' : 'Add Note'}</button>
        </div>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 2: Implement NotesList**

Replace `client/src/components/NotesList.jsx`:

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import * as api from '../api.js';
import { NoteForm } from './NoteForm.jsx';

export function NotesList({ hosts }) {
  const [notes, setNotes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editNote, setEditNote] = useState(null);

  const refresh = useCallback(async () => {
    setNotes(await api.getNotes());
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleDelete = async (note) => {
    if (!confirm(`Delete note "${note.title}"?`)) return;
    await api.deleteNote(note.id);
    refresh();
  };

  const hostName = (hostId) => hosts.find(h => h.id === hostId)?.name;

  return (
    <div>
      <div className="main-header">
        <h2>Notes</h2>
        <button className="btn btn-primary btn-sm" onClick={() => { setEditNote(null); setShowForm(true); }}>
          + Add Note
        </button>
      </div>
      {notes.map((note) => (
        <div key={note.id} className="note-card">
          <div className="note-card-header">
            <span className="note-card-title">{note.title}</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => { setEditNote(note); setShowForm(true); }}>Edit</button>
              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(note)}>Delete</button>
            </div>
          </div>
          <div className="note-card-content">{note.content}</div>
          <div className="note-card-meta">
            {note.host_id ? `Linked to ${hostName(note.host_id)}` : 'Global note'}
            {' \u00b7 '}
            {new Date(note.updated_at).toLocaleDateString()}
          </div>
        </div>
      ))}
      {notes.length === 0 && (
        <div className="empty-state"><p>No notes yet. Click "Add Note" to create one.</p></div>
      )}
      {showForm && (
        <NoteForm
          note={editNote} hosts={hosts}
          onClose={() => { setShowForm(false); setEditNote(null); }}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/NoteForm.jsx client/src/components/NotesList.jsx
git commit -m "feat: notes list and note form with global/host-linked support"
```

---

### Task 13: Search Results Component

**Files:**
- Modify: `client/src/components/SearchResults.jsx`

- [ ] **Step 1: Implement SearchResults**

Replace `client/src/components/SearchResults.jsx`:

```jsx
import React from 'react';

export function SearchResults({ results, query, onSelectHost }) {
  if (!results) return null;
  const { hosts, ports, notes } = results;
  const total = hosts.length + ports.length + notes.length;

  return (
    <div>
      <div className="main-header">
        <h2>Search: "{query}"</h2>
        <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>{total} result{total !== 1 ? 's' : ''}</span>
      </div>
      {hosts.length > 0 && (
        <div className="search-results-section">
          <h3>Hosts ({hosts.length})</h3>
          {hosts.map((host) => (
            <div key={host.id} className="search-result-item" onClick={() => onSelectHost(host.id)}>
              <strong>{host.name}</strong>
              <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>{host.ip_address}</span>
              {host.os && <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>[{host.os}]</span>}
            </div>
          ))}
        </div>
      )}
      {ports.length > 0 && (
        <div className="search-results-section">
          <h3>Ports ({ports.length})</h3>
          {ports.map((port) => (
            <div key={port.id} className="search-result-item" onClick={() => onSelectHost(port.host_id)}>
              <span className="port-number">:{port.port_number}</span>
              <span style={{ marginLeft: '8px' }}>{port.service_name}</span>
              <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>on {port.host_name} ({port.host_ip})</span>
              {port.client && <span style={{ marginLeft: '8px' }}><span className="tag">{port.client}</span></span>}
              {port.domain && <span style={{ color: 'var(--text-secondary)', marginLeft: '8px' }}>{port.domain}</span>}
            </div>
          ))}
        </div>
      )}
      {notes.length > 0 && (
        <div className="search-results-section">
          <h3>Notes ({notes.length})</h3>
          {notes.map((note) => (
            <div key={note.id} className="search-result-item">
              <strong>{note.title}</strong>
              <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>
                {note.content.length > 100 ? note.content.slice(0, 100) + '...' : note.content}
              </div>
            </div>
          ))}
        </div>
      )}
      {total === 0 && <div className="empty-state"><p>No results found for "{query}"</p></div>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/SearchResults.jsx
git commit -m "feat: search results view with hosts, ports, and notes grouping"
```

---

### Task 14: Export Panel Component

**Files:**
- Modify: `client/src/components/ExportPanel.jsx`

- [ ] **Step 1: Implement ExportPanel**

Replace `client/src/components/ExportPanel.jsx`:

```jsx
import React, { useState, useEffect } from 'react';
import * as api from '../api.js';

export function ExportPanel({ hostId, hosts }) {
  const [format, setFormat] = useState('markdown');
  const [scope, setScope] = useState(hostId ? 'host' : 'all');
  const [clientFilter, setClientFilter] = useState('');
  const [preview, setPreview] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const params = {};
    if (scope === 'host' && hostId) params.host_id = hostId;
    if (scope === 'client' && clientFilter) params.client = clientFilter;
    api.exportData(format, params).then(setPreview).catch(() => setPreview('Export failed'));
  }, [format, scope, hostId, clientFilter]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(preview);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="export-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <strong>Export</strong>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {copied && <span className="copy-success">Copied!</span>}
          <button className="btn btn-primary btn-sm" onClick={handleCopy}>Copy to Clipboard</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>Format</div>
          <div className="export-options">
            {['markdown', 'csv', 'text'].map((f) => (
              <button key={f} className={`export-option ${format === f ? 'active' : ''}`} onClick={() => setFormat(f)}>
                {f === 'markdown' ? 'Markdown' : f === 'csv' ? 'CSV' : 'Plain Text'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>Scope</div>
          <div className="export-options">
            {hostId && <button className={`export-option ${scope === 'host' ? 'active' : ''}`} onClick={() => setScope('host')}>This Host</button>}
            <button className={`export-option ${scope === 'all' ? 'active' : ''}`} onClick={() => setScope('all')}>All Hosts</button>
            <button className={`export-option ${scope === 'client' ? 'active' : ''}`} onClick={() => setScope('client')}>By Client</button>
          </div>
        </div>
        {scope === 'client' && (
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>Client</div>
            <input className="search-input" style={{ width: '200px' }} value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} placeholder="Client name..." />
          </div>
        )}
      </div>
      <div className="export-preview">{preview}</div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/ExportPanel.jsx
git commit -m "feat: export panel with format picker, scope selection, and copy to clipboard"
```

---

### Task 15: Docker Deployment

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`

- [ ] **Step 1: Create .dockerignore**

```
node_modules
client/node_modules
client/dist
data
.superpowers
.git
test
docs
*.md
```

- [ ] **Step 2: Create Dockerfile**

```dockerfile
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server/ ./server/
COPY --from=client-build /app/client/dist ./client/dist
ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server/index.js"]
```

- [ ] **Step 3: Create docker-compose.yml**

```yaml
services:
  port-tracker:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - port-tracker-data:/app/data
    restart: unless-stopped

volumes:
  port-tracker-data:
```

- [ ] **Step 4: Build and test**

```bash
docker compose up --build -d
curl http://localhost:3000/api/hosts
# Expected: []
# Open http://localhost:3000 in browser - verify app loads
docker compose down
```

- [ ] **Step 5: Commit**

```bash
git add Dockerfile docker-compose.yml .dockerignore
git commit -m "feat: Docker deployment with multi-stage build"
```

---

### Task 16: End-to-End Verification

Verify the full application against the spec's verification plan.

- [ ] **Step 1: Start the app via Docker**

```bash
docker compose up --build -d
```
Open http://localhost:3000

- [ ] **Step 2: Add a host, verify it appears in sidebar**

- [ ] **Step 3: Add ports with client/domain/tunnel fields, verify table renders**

- [ ] **Step 4: Try adding a conflicting port, verify 409 error message**

- [ ] **Step 5: Test global search across hosts, ports, and domains**

- [ ] **Step 6: Create global and host-linked notes, verify both views**

- [ ] **Step 7: Test export in all 3 formats, verify copy-to-clipboard**

- [ ] **Step 8: Delete a host, verify cascade removes ports and notes**

- [ ] **Step 9: Stop container**

```bash
docker compose down
```

- [ ] **Step 10: Commit any fixes from verification**

```bash
git add -A
git commit -m "fix: adjustments from end-to-end verification"
```
