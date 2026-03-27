# Network Topology Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the network map into a topology tool with infrastructure devices, device-to-device connections, drag-to-connect, and visual edge styles.

**Architecture:** New `connections` table with CRUD API. React Flow edges rendered from connections with per-type visual styles. Manual "Add Device" button for infrastructure. ConnectionPopover for edge editing. ConnectionForm for drag-to-connect flow.

**Tech Stack:** Node.js, Express, better-sqlite3, React, React Flow (@xyflow/react), vitest, supertest

**Spec:** `docs/superpowers/specs/2026-03-28-network-topology-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `server/db.js` | Modify | Add `connections` table, expand device category CHECK |
| `server/routes/connections.js` | Create | Connections CRUD API |
| `server/index.js` | Modify | Mount connections router |
| `test/setup.js` | Modify | Mount connections router in test app |
| `test/connections.test.js` | Create | Connection API tests |
| `client/src/api.js` | Modify | Add connection API functions |
| `client/src/components/DeviceNode.jsx` | Modify | Show handles, add infrastructure colors |
| `client/src/components/DevicePopover.jsx` | Modify | Expand category list |
| `client/src/components/NetworkMap.jsx` | Modify | Connections state, edges, onConnect, edge click, add device button |
| `client/src/components/ConnectionPopover.jsx` | Create | Edge click popover for editing connection metadata |
| `client/src/components/ConnectionForm.jsx` | Create | Inline form after drag-to-connect |
| `client/src/components/AddDeviceForm.jsx` | Create | Toolbar form for manually adding devices |
| `client/src/App.css` | Modify | Styles for new components, handle visibility, edge styles |

---

## Summary (7 Tasks)

1. **Database Schema** — Add connections table, expand device category CHECK
2. **Connections API (TDD)** — CRUD with duplicate/self-connection prevention, cascade delete
3. **Client API + Categories Update** — API functions, expand category constants
4. **Add Device Form** — Toolbar button + form for manual infrastructure device creation
5. **Connection Rendering + Drag-to-Connect** — React Flow edges from connections, onConnect with ConnectionForm
6. **Connection Popover** — Click edge to view/edit/delete connection metadata
7. **DeviceNode Handles + Styles** — Visible handles, infrastructure category colors, CSS

---

### Task 1: Database Schema

**Files:**
- Modify: `server/db.js`

- [ ] **Step 1: Add connections table to migrate function**

In `server/db.js`, add the following table creation inside the `db.exec()` template literal, after the `port_categories` table:

```sql
CREATE TABLE IF NOT EXISTS connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  target_device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  connection_type TEXT DEFAULT 'ethernet' CHECK(connection_type IN ('ethernet', 'wifi', 'tunnel', 'fiber', 'usb')),
  label TEXT,
  speed TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(source_device_id, target_device_id)
);
```

- [ ] **Step 2: Expand device category CHECK constraint**

The existing `devices` table has a CHECK constraint limiting categories to `('server', 'desktop', 'mobile', 'iot', 'network', 'other')`. SQLite doesn't support `ALTER TABLE ... ALTER COLUMN`, so we need a conditional migration.

Add after the existing `port_categories` migration block in `server/db.js`:

```javascript
// Expand device categories if the CHECK constraint doesn't include infrastructure types
// SQLite can't ALTER CHECK constraints, so we check if the new categories are accepted
try {
  db.prepare("INSERT INTO devices (ip_address, category) VALUES ('__check__', 'router')").run();
  db.prepare("DELETE FROM devices WHERE ip_address = '__check__'").run();
} catch {
  // CHECK constraint rejected 'router' — need to recreate the table
  db.exec(`
    CREATE TABLE devices_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip_address TEXT NOT NULL UNIQUE,
      mac_address TEXT,
      hostname TEXT,
      host_id INTEGER REFERENCES hosts(id) ON DELETE SET NULL,
      category TEXT DEFAULT 'other' CHECK(category IN ('server', 'desktop', 'mobile', 'iot', 'network', 'other', 'router', 'switch', 'access_point', 'firewall')),
      is_known INTEGER DEFAULT 0,
      last_seen TEXT,
      x_position REAL,
      y_position REAL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO devices_new SELECT * FROM devices;
    DROP TABLE devices;
    ALTER TABLE devices_new RENAME TO devices;
  `);
}
```

- [ ] **Step 3: Verify migration works**

Run: `node -e "import('./server/db.js').then(m => { const db = m.createDb(':memory:'); console.log(db.prepare(\"SELECT sql FROM sqlite_master WHERE name = 'connections'\").get()?.sql); console.log(db.prepare(\"SELECT sql FROM sqlite_master WHERE name = 'devices'\").get()?.sql); })"`

Expected: Both table schemas printed with the new columns/constraints.

- [ ] **Step 4: Run existing tests to confirm no regressions**

Run: `npx vitest run`

Expected: All existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/db.js
git commit -m "feat: add connections table and expand device categories"
```

---

### Task 2: Connections API (TDD)

**Files:**
- Create: `server/routes/connections.js`
- Create: `test/connections.test.js`
- Modify: `server/index.js`
- Modify: `test/setup.js`

- [ ] **Step 1: Write failing tests**

Create `test/connections.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './setup.js';

describe('Connections API', () => {
  let app, db;

  beforeEach(() => {
    ({ app, db } = createTestApp());
    // Create two devices to connect
    db.prepare("INSERT INTO devices (ip_address, hostname, category, is_known) VALUES (?, ?, ?, 1)").run('192.168.1.1', 'Router', 'router');
    db.prepare("INSERT INTO devices (ip_address, hostname, category, is_known) VALUES (?, ?, ?, 1)").run('192.168.1.2', 'Switch', 'switch');
    db.prepare("INSERT INTO devices (ip_address, hostname, category, is_known) VALUES (?, ?, ?, 1)").run('192.168.1.3', 'Desktop', 'desktop');
  });

  describe('POST /api/connections', () => {
    it('creates a connection between two devices', async () => {
      const res = await request(app).post('/api/connections').send({
        source_device_id: 1,
        target_device_id: 2,
        connection_type: 'ethernet',
        label: 'Port 1 → Port 3',
      });
      expect(res.status).toBe(201);
      expect(res.body.source_device_id).toBe(1);
      expect(res.body.target_device_id).toBe(2);
      expect(res.body.connection_type).toBe('ethernet');
      expect(res.body.label).toBe('Port 1 → Port 3');
    });

    it('defaults connection_type to ethernet', async () => {
      const res = await request(app).post('/api/connections').send({
        source_device_id: 1,
        target_device_id: 2,
      });
      expect(res.status).toBe(201);
      expect(res.body.connection_type).toBe('ethernet');
    });

    it('rejects self-connections', async () => {
      const res = await request(app).post('/api/connections').send({
        source_device_id: 1,
        target_device_id: 1,
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/self/i);
    });

    it('rejects duplicate connections (same direction)', async () => {
      await request(app).post('/api/connections').send({ source_device_id: 1, target_device_id: 2 });
      const res = await request(app).post('/api/connections').send({ source_device_id: 1, target_device_id: 2 });
      expect(res.status).toBe(409);
    });

    it('rejects duplicate connections (reverse direction)', async () => {
      await request(app).post('/api/connections').send({ source_device_id: 1, target_device_id: 2 });
      const res = await request(app).post('/api/connections').send({ source_device_id: 2, target_device_id: 1 });
      expect(res.status).toBe(409);
    });

    it('rejects non-existent device IDs', async () => {
      const res = await request(app).post('/api/connections').send({
        source_device_id: 1,
        target_device_id: 999,
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not found/i);
    });
  });

  describe('GET /api/connections', () => {
    it('lists all connections with device info', async () => {
      await request(app).post('/api/connections').send({ source_device_id: 1, target_device_id: 2, connection_type: 'ethernet' });
      await request(app).post('/api/connections').send({ source_device_id: 2, target_device_id: 3, connection_type: 'wifi' });
      const res = await request(app).get('/api/connections');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].source_name).toBe('Router');
      expect(res.body[0].source_ip).toBe('192.168.1.1');
      expect(res.body[0].target_name).toBe('Switch');
      expect(res.body[0].target_ip).toBe('192.168.1.2');
    });
  });

  describe('PUT /api/connections/:id', () => {
    it('updates connection metadata', async () => {
      const create = await request(app).post('/api/connections').send({ source_device_id: 1, target_device_id: 2 });
      const res = await request(app).put(`/api/connections/${create.body.id}`).send({
        connection_type: 'fiber',
        label: 'Uplink',
        speed: '10Gbps',
        notes: 'Main trunk',
      });
      expect(res.status).toBe(200);
      expect(res.body.connection_type).toBe('fiber');
      expect(res.body.label).toBe('Uplink');
      expect(res.body.speed).toBe('10Gbps');
      expect(res.body.notes).toBe('Main trunk');
    });

    it('returns 404 for non-existent connection', async () => {
      const res = await request(app).put('/api/connections/999').send({ label: 'test' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/connections/:id', () => {
    it('deletes a connection', async () => {
      const create = await request(app).post('/api/connections').send({ source_device_id: 1, target_device_id: 2 });
      const res = await request(app).delete(`/api/connections/${create.body.id}`);
      expect(res.status).toBe(204);
      const list = await request(app).get('/api/connections');
      expect(list.body).toHaveLength(0);
    });

    it('returns 404 for non-existent connection', async () => {
      const res = await request(app).delete('/api/connections/999');
      expect(res.status).toBe(404);
    });
  });

  describe('CASCADE delete', () => {
    it('deletes connections when a device is removed', async () => {
      await request(app).post('/api/connections').send({ source_device_id: 1, target_device_id: 2 });
      await request(app).post('/api/connections').send({ source_device_id: 2, target_device_id: 3 });
      // Delete device 2 (switch) — should cascade both connections
      await request(app).delete('/api/devices/2');
      const res = await request(app).get('/api/connections');
      expect(res.body).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/connections.test.js`

Expected: FAIL — cannot find `connections` routes.

- [ ] **Step 3: Create connections router**

Create `server/routes/connections.js`:

```javascript
import { Router } from 'express';

export const connectionsRouter = Router();

// GET / — list all connections with source/target device info
connectionsRouter.get('/', (req, res) => {
  const connections = req.db.prepare(`
    SELECT c.*,
      COALESCE(sd.hostname, sd.ip_address) AS source_name, sd.ip_address AS source_ip,
      COALESCE(td.hostname, td.ip_address) AS target_name, td.ip_address AS target_ip
    FROM connections c
    JOIN devices sd ON sd.id = c.source_device_id
    JOIN devices td ON td.id = c.target_device_id
    ORDER BY c.id
  `).all();
  res.json(connections);
});

// POST / — create a connection between two devices
connectionsRouter.post('/', (req, res) => {
  const { source_device_id, target_device_id, connection_type, label, speed, notes } = req.body;

  // Reject self-connections
  if (source_device_id === target_device_id) {
    return res.status(400).json({ error: 'Cannot create a self-connection' });
  }

  // Verify both devices exist
  const source = req.db.prepare('SELECT id FROM devices WHERE id = ?').get(source_device_id);
  const target = req.db.prepare('SELECT id FROM devices WHERE id = ?').get(target_device_id);
  if (!source || !target) {
    return res.status(400).json({ error: 'Device not found' });
  }

  // Check for duplicates in either direction
  const existing = req.db.prepare(
    'SELECT id FROM connections WHERE (source_device_id = ? AND target_device_id = ?) OR (source_device_id = ? AND target_device_id = ?)'
  ).get(source_device_id, target_device_id, target_device_id, source_device_id);
  if (existing) {
    return res.status(409).json({ error: 'Connection already exists between these devices' });
  }

  const result = req.db.prepare(
    'INSERT INTO connections (source_device_id, target_device_id, connection_type, label, speed, notes) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(source_device_id, target_device_id, connection_type || 'ethernet', label || null, speed || null, notes || null);

  const connection = req.db.prepare('SELECT * FROM connections WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(connection);
});

// PUT /:id — update connection metadata
connectionsRouter.put('/:id', (req, res) => {
  const existing = req.db.prepare('SELECT * FROM connections WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Connection not found' });
  }

  const { connection_type, label, speed, notes } = { ...existing, ...req.body };
  req.db.prepare(`
    UPDATE connections SET connection_type = ?, label = ?, speed = ?, notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(connection_type, label, speed, notes, req.params.id);

  const connection = req.db.prepare('SELECT * FROM connections WHERE id = ?').get(req.params.id);
  res.json(connection);
});

// DELETE /:id — delete a connection
connectionsRouter.delete('/:id', (req, res) => {
  const result = req.db.prepare('DELETE FROM connections WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Connection not found' });
  }
  res.status(204).end();
});
```

- [ ] **Step 4: Mount router in server and test setup**

In `server/index.js`, add after the categories import:

```javascript
import { connectionsRouter } from './routes/connections.js';
```

And after the categories mount line:

```javascript
app.use('/api/connections', connectionsRouter);
```

In `test/setup.js`, add after the categories import:

```javascript
import { connectionsRouter } from '../server/routes/connections.js';
```

And after the categories mount line:

```javascript
app.use('/api/connections', connectionsRouter);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/connections.test.js`

Expected: All 11 tests pass.

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`

Expected: All tests pass (existing + new).

- [ ] **Step 7: Commit**

```bash
git add server/routes/connections.js test/connections.test.js server/index.js test/setup.js
git commit -m "feat: add connections CRUD API with TDD tests"
```

---

### Task 3: Client API + Categories Update

**Files:**
- Modify: `client/src/api.js`
- Modify: `client/src/components/DevicePopover.jsx`

- [ ] **Step 1: Add connection API functions to client**

In `client/src/api.js`, add after the `cleanScanNetwork` export:

```javascript
// Connections API
export const getConnections = () => request('/connections');
export const createConnection = (data) => request('/connections', { method: 'POST', body: JSON.stringify(data) });
export const updateConnection = (id, data) => request(`/connections/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteConnection = (id) => request(`/connections/${id}`, { method: 'DELETE' });
```

- [ ] **Step 2: Expand CATEGORIES in DevicePopover**

In `client/src/components/DevicePopover.jsx`, update the CATEGORIES constant:

```javascript
const CATEGORIES = ['server', 'desktop', 'mobile', 'iot', 'network', 'router', 'switch', 'access_point', 'firewall', 'other'];
```

- [ ] **Step 3: Commit**

```bash
git add client/src/api.js client/src/components/DevicePopover.jsx
git commit -m "feat: add connection API client functions and infrastructure categories"
```

---

### Task 4: Add Device Form

**Files:**
- Create: `client/src/components/AddDeviceForm.jsx`
- Modify: `client/src/components/NetworkMap.jsx`
- Modify: `client/src/App.css`

- [ ] **Step 1: Create AddDeviceForm component**

Create `client/src/components/AddDeviceForm.jsx`:

```jsx
import React, { useState } from 'react';
import * as api from '../api.js';

const CATEGORIES = ['server', 'desktop', 'mobile', 'iot', 'network', 'router', 'switch', 'access_point', 'firewall', 'other'];

export function AddDeviceForm({ onClose, onDeviceCreated }) {
  const [hostname, setHostname] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [category, setCategory] = useState('router');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!hostname && !ipAddress) {
      setError('Hostname or IP address is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.createDevice({
        hostname: hostname || null,
        ip_address: ipAddress || `manual-${Date.now()}`,
        category,
      });
      onDeviceCreated();
      onClose();
    } catch (err) {
      setError(err.error || 'Failed to create device');
    }
    setSaving(false);
  };

  return (
    <div className="add-device-overlay" onClick={onClose}>
      <form className="add-device-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>Add Device</h3>
        <input
          className="search-input"
          placeholder="Hostname / Name"
          value={hostname}
          onChange={(e) => setHostname(e.target.value)}
          autoFocus
        />
        <input
          className="search-input"
          placeholder="IP Address (optional)"
          value={ipAddress}
          onChange={(e) => setIpAddress(e.target.value)}
        />
        <select className="search-input" value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
        </select>
        {error && <div className="add-device-error">{error}</div>}
        <div className="add-device-actions">
          <button className="btn btn-primary btn-sm" type="submit" disabled={saving}>
            {saving ? 'Adding...' : 'Add Device'}
          </button>
          <button className="btn btn-secondary btn-sm" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Add "Add Device" button and state to NetworkMap**

In `client/src/components/NetworkMap.jsx`:

Add the import at the top:

```javascript
import { AddDeviceForm } from './AddDeviceForm.jsx';
```

Add state inside the NetworkMap component:

```javascript
const [showAddDevice, setShowAddDevice] = useState(false);
```

Add the toolbar button after the existing category select dropdown (before the `<span className="map-device-count">`):

```jsx
<button className="btn btn-primary btn-sm" onClick={() => setShowAddDevice(true)}>
  Add Device
</button>
```

Add the form render at the bottom of the component, before the closing `</div>` of the `network-map` div, after the `showHostForm` block:

```jsx
{showAddDevice && (
  <AddDeviceForm
    onClose={() => setShowAddDevice(false)}
    onDeviceCreated={fetchDevices}
  />
)}
```

Also update the CATEGORIES constant at the top of NetworkMap.jsx:

```javascript
const CATEGORIES = ['all', 'server', 'desktop', 'mobile', 'iot', 'network', 'router', 'switch', 'access_point', 'firewall', 'other'];
```

- [ ] **Step 3: Add CSS for AddDeviceForm**

Add to `client/src/App.css`:

```css
/* Add Device Form */
.add-device-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 100;
  background: var(--overlay); display: flex; align-items: center; justify-content: center;
}
.add-device-form {
  background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px;
  padding: 20px; width: 320px; display: flex; flex-direction: column; gap: 10px;
}
.add-device-form h3 { font-size: 16px; color: var(--text-primary); margin-bottom: 4px; }
.add-device-error { font-size: 12px; color: var(--accent); }
.add-device-actions { display: flex; gap: 8px; margin-top: 4px; }
```

- [ ] **Step 4: Verify in browser**

Start the app, navigate to Network Map, click "Add Device", fill in a router with name "Main Router" and IP "192.168.1.1" (or a new IP). Confirm it appears on the map.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/AddDeviceForm.jsx client/src/components/NetworkMap.jsx client/src/App.css
git commit -m "feat: add manual device creation with Add Device button"
```

---

### Task 5: Connection Rendering + Drag-to-Connect

**Files:**
- Create: `client/src/components/ConnectionForm.jsx`
- Modify: `client/src/components/NetworkMap.jsx`

- [ ] **Step 1: Define edge style constants**

In `client/src/components/NetworkMap.jsx`, add after the `nodeTypes` constant:

```javascript
const EDGE_STYLES = {
  ethernet: { stroke: 'var(--accent)', strokeWidth: 2 },
  wifi: { stroke: 'var(--text-secondary)', strokeWidth: 2, strokeDasharray: '5 5' },
  tunnel: { stroke: '#f59e0b', strokeWidth: 2, strokeDasharray: '2 4' },
  fiber: { stroke: '#10b981', strokeWidth: 3 },
  usb: { stroke: 'var(--text-tertiary)', strokeWidth: 1.5 },
};

const CONNECTION_TYPES = ['ethernet', 'wifi', 'tunnel', 'fiber', 'usb'];
```

- [ ] **Step 2: Create ConnectionForm component**

Create `client/src/components/ConnectionForm.jsx`:

```jsx
import React, { useState } from 'react';
import * as api from '../api.js';

const CONNECTION_TYPES = ['ethernet', 'wifi', 'tunnel', 'fiber', 'usb'];

export function ConnectionForm({ sourceId, targetId, onClose, onConnectionCreated }) {
  const [connectionType, setConnectionType] = useState('ethernet');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.createConnection({
        source_device_id: Number(sourceId),
        target_device_id: Number(targetId),
        connection_type: connectionType,
        label: label || null,
      });
      onConnectionCreated();
      onClose();
    } catch (err) {
      setError(err.error || 'Failed to create connection');
    }
    setSaving(false);
  };

  return (
    <div className="add-device-overlay" onClick={onClose}>
      <form className="connection-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>New Connection</h3>
        <select className="search-input" value={connectionType} onChange={(e) => setConnectionType(e.target.value)}>
          {CONNECTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input
          className="search-input"
          placeholder="Label (optional, e.g. Port 1 → Port 3)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        {error && <div className="add-device-error">{error}</div>}
        <div className="add-device-actions">
          <button className="btn btn-primary btn-sm" type="submit" disabled={saving}>
            {saving ? 'Creating...' : 'Create Connection'}
          </button>
          <button className="btn btn-secondary btn-sm" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Add connection state and edge rendering to NetworkMap**

In `client/src/components/NetworkMap.jsx`:

Replace the existing `useEdgesState` import usage. Change:

```javascript
const [edges] = useEdgesState([]);
```

To:

```javascript
const [edges, setEdges] = useEdgesState([]);
```

Add imports at top:

```javascript
import { ConnectionForm } from './ConnectionForm.jsx';
```

Add new state variables (after existing state):

```javascript
const [connections, setConnections] = useState([]);
const [showConnectionForm, setShowConnectionForm] = useState(false);
const [pendingConnection, setPendingConnection] = useState(null);
```

Add fetch function (after `fetchDevices`):

```javascript
const fetchConnections = useCallback(async () => {
  const data = await api.getConnections();
  setConnections(data);
}, []);
```

Add to the initial fetch useEffect — change:

```javascript
useEffect(() => { fetchDevices(); }, [fetchDevices]);
```

To:

```javascript
useEffect(() => { fetchDevices(); fetchConnections(); }, [fetchDevices, fetchConnections]);
```

Add a useEffect to convert connections to edges (after the nodes useEffect):

```javascript
// Update edges whenever connections change
useEffect(() => {
  const newEdges = connections.map(c => ({
    id: `conn-${c.id}`,
    source: String(c.source_device_id),
    target: String(c.target_device_id),
    type: 'default',
    style: EDGE_STYLES[c.connection_type] || EDGE_STYLES.ethernet,
    data: { connection: c },
  }));
  setEdges(newEdges);
}, [connections, setEdges]);
```

Add the onConnect handler (after `handlePaneClick`):

```javascript
const handleConnect = useCallback((params) => {
  setPendingConnection({ source: params.source, target: params.target });
  setShowConnectionForm(true);
}, []);

const handleConnectionCreated = () => {
  setShowConnectionForm(false);
  setPendingConnection(null);
  fetchConnections();
};
```

- [ ] **Step 4: Wire up onConnect in ReactFlow**

In the `<ReactFlow>` component, add the `onConnect` prop:

```jsx
onConnect={handleConnect}
```

Add the ConnectionForm render after the `showAddDevice` block:

```jsx
{showConnectionForm && pendingConnection && (
  <ConnectionForm
    sourceId={pendingConnection.source}
    targetId={pendingConnection.target}
    onClose={() => { setShowConnectionForm(false); setPendingConnection(null); }}
    onConnectionCreated={handleConnectionCreated}
  />
)}
```

- [ ] **Step 5: Verify in browser**

Start the app, ensure edges render for any existing connections. Drag from one device handle to another — ConnectionForm should appear. Create a connection and verify the line appears with correct styling.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/ConnectionForm.jsx client/src/components/NetworkMap.jsx
git commit -m "feat: render connections as edges with drag-to-connect"
```

---

### Task 6: Connection Popover

**Files:**
- Create: `client/src/components/ConnectionPopover.jsx`
- Modify: `client/src/components/NetworkMap.jsx`
- Modify: `client/src/App.css`

- [ ] **Step 1: Create ConnectionPopover component**

Create `client/src/components/ConnectionPopover.jsx`:

```jsx
import React, { useState } from 'react';
import * as api from '../api.js';

const CONNECTION_TYPES = ['ethernet', 'wifi', 'tunnel', 'fiber', 'usb'];

export function ConnectionPopover({ connection, onClose, onConnectionUpdated, onConnectionDeleted }) {
  const [connectionType, setConnectionType] = useState(connection.connection_type);
  const [label, setLabel] = useState(connection.label || '');
  const [speed, setSpeed] = useState(connection.speed || '');
  const [notes, setNotes] = useState(connection.notes || '');

  const handleSave = async (field, value) => {
    await api.updateConnection(connection.id, { [field]: value || null });
    onConnectionUpdated();
  };

  const handleDelete = async () => {
    if (!confirm('Delete this connection?')) return;
    await api.deleteConnection(connection.id);
    onConnectionDeleted();
  };

  return (
    <div className="connection-popover">
      <div className="device-popover-header">
        <strong>Connection</strong>
        <button className="btn btn-danger btn-sm" onClick={onClose}>&times;</button>
      </div>

      <div className="device-popover-details">
        <div><span className="device-popover-label">From:</span> {connection.source_name} ({connection.source_ip})</div>
        <div><span className="device-popover-label">To:</span> {connection.target_name} ({connection.target_ip})</div>
      </div>

      <div className="connection-popover-fields">
        <div className="connection-popover-field">
          <label className="device-popover-label">Type</label>
          <select className="search-input" value={connectionType}
            onChange={(e) => { setConnectionType(e.target.value); handleSave('connection_type', e.target.value); }}>
            {CONNECTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="connection-popover-field">
          <label className="device-popover-label">Label</label>
          <input className="search-input" value={label} placeholder="e.g. Port 1 → Port 3"
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => handleSave('label', label)} />
        </div>
        <div className="connection-popover-field">
          <label className="device-popover-label">Speed</label>
          <input className="search-input" value={speed} placeholder="e.g. 1Gbps"
            onChange={(e) => setSpeed(e.target.value)}
            onBlur={() => handleSave('speed', speed)} />
        </div>
        <div className="connection-popover-field">
          <label className="device-popover-label">Notes</label>
          <textarea className="search-input" value={notes} placeholder="Notes..."
            rows={2} onChange={(e) => setNotes(e.target.value)}
            onBlur={() => handleSave('notes', notes)} />
        </div>
      </div>

      <div className="device-popover-actions">
        <button className="btn btn-danger btn-sm" onClick={handleDelete}>Delete Connection</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add edge click handler and state to NetworkMap**

In `client/src/components/NetworkMap.jsx`:

Add import:

```javascript
import { ConnectionPopover } from './ConnectionPopover.jsx';
```

Add state:

```javascript
const [selectedConnection, setSelectedConnection] = useState(null);
```

Add edge click handler (after `handleNodeClick`):

```javascript
const handleEdgeClick = useCallback((event, edge) => {
  setSelectedConnection(edge.data.connection);
  setSelectedDevice(null);
}, []);
```

Update `handlePaneClick` to also clear connection selection:

```javascript
const handlePaneClick = useCallback(() => {
  setSelectedDevice(null);
  setSelectedConnection(null);
}, []);
```

Add `onEdgeClick` prop to `<ReactFlow>`:

```jsx
onEdgeClick={handleEdgeClick}
```

Add the popover render after the `DevicePopover` block (inside `map-canvas`):

```jsx
{selectedConnection && (
  <ConnectionPopover
    connection={selectedConnection}
    onClose={() => setSelectedConnection(null)}
    onConnectionUpdated={() => { setSelectedConnection(null); fetchConnections(); }}
    onConnectionDeleted={() => { setSelectedConnection(null); fetchConnections(); }}
  />
)}
```

- [ ] **Step 3: Add CSS for ConnectionPopover and ConnectionForm**

Add to `client/src/App.css`:

```css
/* Connection Popover */
.connection-popover {
  position: absolute; top: 16px; right: 16px; width: 280px; z-index: 10;
  background: var(--bg-secondary); border: 1px solid var(--border);
  border-radius: 8px; padding: 16px; box-shadow: var(--shadow);
}
.connection-popover-fields { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }
.connection-popover-field { display: flex; flex-direction: column; gap: 3px; }
.connection-popover-field label { margin-bottom: 0; }
.connection-popover-field textarea { resize: vertical; min-height: 40px; }

/* Connection Form (reuses add-device-overlay for backdrop) */
.connection-form {
  background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px;
  padding: 20px; width: 320px; display: flex; flex-direction: column; gap: 10px;
}
.connection-form h3 { font-size: 16px; color: var(--text-primary); margin-bottom: 4px; }
```

- [ ] **Step 4: Verify in browser**

Click an edge — ConnectionPopover shows with type, label, speed, notes. Change type — line style updates after refresh. Delete — line removed.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/ConnectionPopover.jsx client/src/components/NetworkMap.jsx client/src/App.css
git commit -m "feat: add connection popover for editing edge metadata"
```

---

### Task 7: DeviceNode Handles + Infrastructure Styles

**Files:**
- Modify: `client/src/components/DeviceNode.jsx`
- Modify: `client/src/App.css`

- [ ] **Step 1: Update DeviceNode category colors and show handles**

Replace the full contents of `client/src/components/DeviceNode.jsx`:

```jsx
import React from 'react';
import { Handle, Position } from '@xyflow/react';

const CATEGORY_COLORS = {
  server: 'var(--accent)',
  desktop: '#4a90d9',
  mobile: 'var(--green-text)',
  iot: 'var(--yellow-text)',
  network: '#9b59b6',
  router: '#3b82f6',
  switch: '#14b8a6',
  access_point: '#a855f7',
  firewall: '#ef4444',
  other: 'var(--text-muted)',
};

export function DeviceNode({ data }) {
  const { device } = data;
  const isLinked = !!device.host_id;
  const borderColor = CATEGORY_COLORS[device.category] || CATEGORY_COLORS.other;

  return (
    <div className={`device-node ${isLinked ? 'device-node-linked' : 'device-node-unknown'}`}
      style={{ borderColor }}>
      <Handle type="target" position={Position.Top} className="device-handle" />
      <div className="device-node-hostname">
        {isLinked ? device.host_name : (device.hostname || 'Unknown')}
      </div>
      <div className="device-node-ip">{device.ip_address}</div>
      <div className="device-node-meta">
        <span className="device-node-category" style={{ color: borderColor }}>
          {device.category?.replace('_', ' ')}
        </span>
        {isLinked && device.port_count > 0 && (
          <span className="device-node-ports">{device.port_count} port{device.port_count !== 1 ? 's' : ''}</span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="device-handle" />
    </div>
  );
}
```

- [ ] **Step 2: Add handle CSS**

Add to `client/src/App.css`:

```css
/* Device connection handles */
.device-handle {
  width: 8px; height: 8px;
  background: var(--border); border: 2px solid var(--bg-secondary);
  opacity: 0; transition: opacity 0.15s;
}
.device-node:hover .device-handle { opacity: 1; }
.device-handle:hover { background: var(--accent); }
```

- [ ] **Step 3: Verify in browser**

Hover over a device node — handles appear as small dots at top and bottom. Drag from one to another — connection form appears. Infrastructure devices show correct border colors.

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/DeviceNode.jsx client/src/App.css
git commit -m "feat: visible connection handles and infrastructure category colors"
```

---

## Self-Review Checklist

- **Spec coverage:** All 6 spec features mapped to tasks: infrastructure categories (T1+T7), manual add device (T4), connections table (T1), drag-to-connect (T5), connection popover (T6), visual line styles (T5+T7).
- **Placeholder scan:** No TBDs, TODOs, or vague instructions. All steps have complete code.
- **Type consistency:** `connection_type` field name used consistently. `EDGE_STYLES` and `CONNECTION_TYPES` defined in NetworkMap.jsx and ConnectionForm/ConnectionPopover respectively. `CATEGORY_COLORS` updated in DeviceNode. `CATEGORIES` arrays updated in NetworkMap and DevicePopover.
