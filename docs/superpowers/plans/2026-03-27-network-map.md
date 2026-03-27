# Network Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add an interactive network map view to Port Tracker that visualizes all devices on the local network, with click-through to port/service details for tracked hosts.

**Architecture:** New `devices` table linked to existing `hosts` table. Network scanning via ARP + ping sweep server-side. React Flow for the interactive map canvas. The map is a new view mode alongside the existing host detail, notes, and search views.

**Tech Stack:** Node.js, Express, better-sqlite3, React (plain JS), React Flow, Vite, vitest, supertest

**Spec:** `docs/superpowers/specs/2026-03-27-network-map-design.md`

---

## File Structure

```
port-tracker/
├── server/
│   ├── db.js                        — Modified: add devices table to migrate()
│   ├── index.js                     — Modified: mount devicesRouter
│   ├── routes/
│   │   └── devices.js               — NEW: Device CRUD + position endpoints
│   └── scanner.js                   — NEW: Network scanning logic (ARP, ping, DNS)
├── client/
│   ├── package.json                 — Modified: add @xyflow/react dependency
│   └── src/
│       ├── api.js                   — Modified: add device API functions
│       ├── App.jsx                  — Modified: add 'map' view mode
│       ├── App.css                  — Modified: add map styles
│       └── components/
│           ├── Sidebar.jsx          — Modified: add Network Map nav item
│           ├── HostForm.jsx         — Modified: accept prefill props, onCreated callback
│           ├── NetworkMap.jsx        — NEW: Main map view with toolbar and canvas
│           ├── DeviceNode.jsx        — NEW: Custom React Flow node component
│           └── DevicePopover.jsx     — NEW: Click popover with device info and actions
├── test/
│   ├── setup.js                     — Modified: mount devicesRouter
│   ├── devices.test.js              — NEW: Device CRUD API tests
│   └── scanner.test.js              — NEW: Scanner parsing/logic tests
├── docker-compose.yml               — Modified: network_mode: host
```

---

### Task 1: Database Schema — Add Devices Table

**Files:**
- Modify: `server/db.js`

- [ ] **Step 1: Add devices table to migrate()**

In `server/db.js`, add the devices table creation after the notes table inside `migrate()`:

```javascript
// After the existing notes CREATE TABLE statement, add:

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
```

The full `migrate()` function in `server/db.js` should now contain four CREATE TABLE statements: hosts, ports, notes, devices. Append the devices statement after notes.

- [ ] **Step 2: Verify existing tests still pass**

Run: `cd "/home/marty/Desktop/port tracker" && npx vitest run`
Expected: All 41 existing tests pass (the new table doesn't affect existing functionality).

- [ ] **Step 3: Commit**

```bash
git add server/db.js
git commit -m "feat: add devices table for network map"
```

---

### Task 2: Devices API — CRUD (TDD)

**Files:**
- Create: `server/routes/devices.js`
- Modify: `server/index.js`
- Modify: `test/setup.js`
- Create: `test/devices.test.js`

- [ ] **Step 1: Write device CRUD tests**

Create `test/devices.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './setup.js';

describe('Devices API', () => {
  let app, db;
  beforeEach(() => { ({ app, db } = createTestApp()); });

  describe('GET /api/devices', () => {
    it('returns empty array initially', async () => {
      const res = await request(app).get('/api/devices');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns all devices', async () => {
      db.prepare('INSERT INTO devices (ip_address, hostname, is_known) VALUES (?, ?, ?)').run('192.168.1.1', 'router', 1);
      db.prepare('INSERT INTO devices (ip_address, is_known) VALUES (?, ?)').run('192.168.1.50', 0);
      const res = await request(app).get('/api/devices');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    it('filters to known_only when param is set', async () => {
      db.prepare('INSERT INTO devices (ip_address, hostname, is_known) VALUES (?, ?, ?)').run('192.168.1.1', 'router', 1);
      db.prepare('INSERT INTO devices (ip_address, is_known) VALUES (?, ?)').run('192.168.1.50', 0);
      const res = await request(app).get('/api/devices?known_only=true');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].hostname).toBe('router');
    });

    it('includes devices with host_id in known_only filter', async () => {
      const hostResult = db.prepare('INSERT INTO hosts (name, ip_address) VALUES (?, ?)').run('server-01', '192.168.1.10');
      db.prepare('INSERT INTO devices (ip_address, host_id, is_known) VALUES (?, ?, ?)').run('192.168.1.10', hostResult.lastInsertRowid, 0);
      const res = await request(app).get('/api/devices?known_only=true');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe('POST /api/devices', () => {
    it('creates a device', async () => {
      const res = await request(app).post('/api/devices')
        .send({ ip_address: '192.168.1.100', hostname: 'nas', category: 'server' });
      expect(res.status).toBe(201);
      expect(res.body.ip_address).toBe('192.168.1.100');
      expect(res.body.hostname).toBe('nas');
      expect(res.body.category).toBe('server');
      expect(res.body.is_known).toBe(1);
    });

    it('returns 400 without ip_address', async () => {
      const res = await request(app).post('/api/devices').send({ hostname: 'test' });
      expect(res.status).toBe(400);
    });

    it('returns 409 on duplicate ip_address', async () => {
      await request(app).post('/api/devices').send({ ip_address: '192.168.1.1' });
      const res = await request(app).post('/api/devices').send({ ip_address: '192.168.1.1' });
      expect(res.status).toBe(409);
    });
  });

  describe('PUT /api/devices/:id', () => {
    it('updates a device', async () => {
      const create = await request(app).post('/api/devices').send({ ip_address: '192.168.1.1' });
      const res = await request(app).put(`/api/devices/${create.body.id}`)
        .send({ hostname: 'my-router', category: 'network' });
      expect(res.status).toBe(200);
      expect(res.body.hostname).toBe('my-router');
      expect(res.body.category).toBe('network');
      expect(res.body.is_known).toBe(1);
    });

    it('returns 404 for nonexistent device', async () => {
      const res = await request(app).put('/api/devices/999').send({ hostname: 'test' });
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/devices/:id/position', () => {
    it('saves x and y position', async () => {
      const create = await request(app).post('/api/devices').send({ ip_address: '192.168.1.1' });
      const res = await request(app).put(`/api/devices/${create.body.id}/position`)
        .send({ x: 150.5, y: 300.2 });
      expect(res.status).toBe(200);
      expect(res.body.x_position).toBeCloseTo(150.5);
      expect(res.body.y_position).toBeCloseTo(300.2);
    });
  });

  describe('DELETE /api/devices/:id', () => {
    it('deletes a device', async () => {
      const create = await request(app).post('/api/devices').send({ ip_address: '192.168.1.1' });
      const res = await request(app).delete(`/api/devices/${create.body.id}`);
      expect(res.status).toBe(204);
      const list = await request(app).get('/api/devices');
      expect(list.body).toHaveLength(0);
    });

    it('returns 404 for nonexistent device', async () => {
      const res = await request(app).delete('/api/devices/999');
      expect(res.status).toBe(404);
    });
  });

  describe('host linking', () => {
    it('links device to host via update', async () => {
      const hostResult = db.prepare('INSERT INTO hosts (name, ip_address) VALUES (?, ?)').run('server-01', '192.168.1.10');
      const create = await request(app).post('/api/devices').send({ ip_address: '192.168.1.10' });
      const res = await request(app).put(`/api/devices/${create.body.id}`)
        .send({ host_id: hostResult.lastInsertRowid });
      expect(res.status).toBe(200);
      expect(res.body.host_id).toBe(Number(hostResult.lastInsertRowid));
    });

    it('sets host_id to null when host is deleted', async () => {
      const hostResult = db.prepare('INSERT INTO hosts (name, ip_address) VALUES (?, ?)').run('server-01', '192.168.1.10');
      const create = await request(app).post('/api/devices').send({ ip_address: '192.168.1.10', host_id: hostResult.lastInsertRowid });
      db.prepare('DELETE FROM hosts WHERE id = ?').run(hostResult.lastInsertRowid);
      const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(create.body.id);
      expect(device.host_id).toBeNull();
    });
  });

  describe('GET /api/devices with host data', () => {
    it('includes host name and port count for linked devices', async () => {
      const hostResult = db.prepare('INSERT INTO hosts (name, ip_address) VALUES (?, ?)').run('server-01', '192.168.1.10');
      const hostId = Number(hostResult.lastInsertRowid);
      db.prepare('INSERT INTO ports (host_id, port_number, service_name) VALUES (?, ?, ?)').run(hostId, 80, 'Nginx');
      db.prepare('INSERT INTO ports (host_id, port_number, service_name) VALUES (?, ?, ?)').run(hostId, 443, 'HTTPS');
      db.prepare('INSERT INTO devices (ip_address, host_id, is_known) VALUES (?, ?, ?)').run('192.168.1.10', hostId, 1);
      const res = await request(app).get('/api/devices');
      expect(res.status).toBe(200);
      expect(res.body[0].host_name).toBe('server-01');
      expect(res.body[0].port_count).toBe(2);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/home/marty/Desktop/port tracker" && npx vitest run test/devices.test.js`
Expected: FAIL — devicesRouter not found in setup.js

- [ ] **Step 3: Create devices route**

Create `server/routes/devices.js`:

```javascript
import { Router } from 'express';

export const devicesRouter = Router();

// GET / — list all devices, optionally filtered to known-only.
// Includes host_name and port_count via LEFT JOIN for linked devices.
devicesRouter.get('/', (req, res) => {
  const knownOnly = req.query.known_only === 'true';
  let sql = `
    SELECT d.*, h.name AS host_name, COUNT(p.id) AS port_count
    FROM devices d
    LEFT JOIN hosts h ON h.id = d.host_id
    LEFT JOIN ports p ON p.host_id = d.host_id
  `;
  if (knownOnly) sql += ' WHERE d.is_known = 1 OR d.host_id IS NOT NULL';
  sql += ' GROUP BY d.id ORDER BY d.ip_address';
  res.json(req.db.prepare(sql).all());
});

// POST / — manually add a device (always marked as known)
devicesRouter.post('/', (req, res) => {
  const { ip_address, mac_address, hostname, host_id, category } = req.body;
  if (!ip_address) {
    return res.status(400).json({ error: 'ip_address is required' });
  }
  try {
    const result = req.db.prepare(
      'INSERT INTO devices (ip_address, mac_address, hostname, host_id, category, is_known) VALUES (?, ?, ?, ?, ?, 1)'
    ).run(ip_address, mac_address || null, hostname || null, host_id || null, category || 'other');
    const device = req.db.prepare('SELECT * FROM devices WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(device);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: `Device with IP ${ip_address} already exists` });
    }
    throw err;
  }
});

// PUT /:id — update a device (sets is_known = 1 since user is actively editing)
devicesRouter.put('/:id', (req, res) => {
  const existing = req.db.prepare('SELECT * FROM devices WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Device not found' });
  }
  const { ip_address, mac_address, hostname, host_id, category } = { ...existing, ...req.body };
  req.db.prepare(`
    UPDATE devices SET ip_address = ?, mac_address = ?, hostname = ?, host_id = ?,
      category = ?, is_known = 1, updated_at = datetime('now')
    WHERE id = ?
  `).run(ip_address, mac_address, hostname, host_id, category, req.params.id);
  const device = req.db.prepare('SELECT * FROM devices WHERE id = ?').get(req.params.id);
  res.json(device);
});

// PUT /:id/position — save map position (lightweight, doesn't change is_known)
devicesRouter.put('/:id/position', (req, res) => {
  const existing = req.db.prepare('SELECT * FROM devices WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Device not found' });
  }
  const { x, y } = req.body;
  req.db.prepare('UPDATE devices SET x_position = ?, y_position = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(x, y, req.params.id);
  const device = req.db.prepare('SELECT * FROM devices WHERE id = ?').get(req.params.id);
  res.json(device);
});

// DELETE /:id — remove device from map
devicesRouter.delete('/:id', (req, res) => {
  const result = req.db.prepare('DELETE FROM devices WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Device not found' });
  }
  res.status(204).end();
});
```

- [ ] **Step 4: Mount devices router in server/index.js**

In `server/index.js`, add the import and mount after the existing route imports:

```javascript
import { devicesRouter } from './routes/devices.js';
```

Add after the export router mount (`app.use('/api/export', exportRouter);`):

```javascript
app.use('/api/devices', devicesRouter);
```

- [ ] **Step 5: Add devicesRouter to test setup**

In `test/setup.js`, add the import:

```javascript
import { devicesRouter } from '../server/routes/devices.js';
```

Add the mount inside `createTestApp()` after the export router:

```javascript
app.use('/api/devices', devicesRouter);
```

- [ ] **Step 6: Run tests**

Run: `cd "/home/marty/Desktop/port tracker" && npx vitest run`
Expected: All tests pass (41 existing + new device tests).

- [ ] **Step 7: Commit**

```bash
git add server/routes/devices.js server/index.js test/setup.js test/devices.test.js
git commit -m "feat: devices API with CRUD and position endpoints"
```

---

### Task 3: Network Scanner (TDD)

**Files:**
- Create: `server/scanner.js`
- Create: `test/scanner.test.js`

- [ ] **Step 1: Write scanner parsing tests**

Create `test/scanner.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { parseArpOutput, getLocalSubnet } from '../server/scanner.js';

describe('Scanner utilities', () => {
  describe('parseArpOutput', () => {
    it('parses standard Linux arp -a output', () => {
      const output = [
        '? (192.168.1.1) at aa:bb:cc:dd:ee:ff [ether] on eth0',
        '? (192.168.1.50) at 11:22:33:44:55:66 [ether] on eth0',
        '? (192.168.1.100) at <incomplete> on eth0',
      ].join('\n');
      const result = parseArpOutput(output);
      expect(result).toEqual([
        { ip: '192.168.1.1', mac: 'aa:bb:cc:dd:ee:ff' },
        { ip: '192.168.1.50', mac: '11:22:33:44:55:66' },
      ]);
    });

    it('returns empty array for empty output', () => {
      expect(parseArpOutput('')).toEqual([]);
    });

    it('skips lines without valid MAC addresses', () => {
      const output = '? (192.168.1.1) at <incomplete> on eth0\nsome garbage line\n';
      expect(parseArpOutput(output)).toEqual([]);
    });
  });

  describe('getLocalSubnet', () => {
    it('returns a subnet string in CIDR-like format', () => {
      const subnet = getLocalSubnet();
      // Should return something like '192.168.1' or null if no private interface
      if (subnet) {
        expect(subnet).toMatch(/^\d+\.\d+\.\d+$/);
      }
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/home/marty/Desktop/port tracker" && npx vitest run test/scanner.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement scanner**

Create `server/scanner.js`:

```javascript
import { exec } from 'child_process';
import { promisify } from 'util';
import { networkInterfaces } from 'os';
import dns from 'dns';

const execAsync = promisify(exec);
const dnsReverse = promisify(dns.reverse);

// Parse `arp -a` output into [{ip, mac}] entries.
// Skips incomplete entries (no valid MAC).
export function parseArpOutput(output) {
  const results = [];
  const lines = output.split('\n');
  for (const line of lines) {
    const match = line.match(/\(([\d.]+)\)\s+at\s+([\da-fA-F:]{17})/);
    if (match) {
      results.push({ ip: match[1], mac: match[2].toLowerCase() });
    }
  }
  return results;
}

// Find the local private subnet prefix (e.g., '192.168.1') from network interfaces.
export function getLocalSubnet() {
  const ifaces = networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const parts = iface.address.split('.');
        if (parts[0] === '192' || parts[0] === '10' || (parts[0] === '172' && Number(parts[1]) >= 16 && Number(parts[1]) <= 31)) {
          return parts.slice(0, 3).join('.');
        }
      }
    }
  }
  return null;
}

// Attempt reverse DNS lookup, return hostname or null.
async function reverseLookup(ip) {
  try {
    const hostnames = await dnsReverse(ip);
    return hostnames[0] || null;
  } catch {
    return null;
  }
}

// Ping a single IP with a 1-second timeout. Resolves true/false.
async function pingHost(ip) {
  try {
    await execAsync(`ping -c 1 -W 1 ${ip}`, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

// Run a full network scan: ARP, ping sweep, ARP again, DNS lookups.
// Updates the database with discovered devices.
// Returns { devices, scan_summary }.
export async function scanNetwork(db) {
  const subnet = getLocalSubnet();
  if (!subnet) {
    throw new Error('Could not detect local subnet. Make sure the container has host network access.');
  }

  // Step 1: Initial ARP scan
  let arpResult;
  try {
    arpResult = await execAsync('arp -a');
  } catch {
    arpResult = { stdout: '' };
  }
  const initialArp = parseArpOutput(arpResult.stdout);

  // Step 2: Ping sweep (batches of 50)
  const ips = [];
  for (let i = 1; i <= 254; i++) {
    ips.push(`${subnet}.${i}`);
  }
  for (let i = 0; i < ips.length; i += 50) {
    const batch = ips.slice(i, i + 50);
    await Promise.allSettled(batch.map(ip => pingHost(ip)));
  }

  // Step 3: Second ARP scan to pick up new responses
  let arpResult2;
  try {
    arpResult2 = await execAsync('arp -a');
  } catch {
    arpResult2 = { stdout: '' };
  }
  const finalArp = parseArpOutput(arpResult2.stdout);

  // Merge ARP results (dedupe by IP, prefer later scan's MAC)
  const deviceMap = new Map();
  for (const entry of [...initialArp, ...finalArp]) {
    deviceMap.set(entry.ip, entry.mac);
  }

  // Step 4: Process discoveries
  let newCount = 0;
  let updatedCount = 0;

  for (const [ip, mac] of deviceMap) {
    const existing = db.prepare('SELECT * FROM devices WHERE ip_address = ?').get(ip);

    if (existing) {
      // Update MAC, last_seen; only update hostname if is_known = 0
      const hostname = existing.is_known ? existing.hostname : (await reverseLookup(ip)) || existing.hostname;
      db.prepare(`UPDATE devices SET mac_address = ?, hostname = ?, last_seen = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
        .run(mac, hostname, existing.id);
      updatedCount++;
    } else {
      // New device
      const hostname = await reverseLookup(ip);
      db.prepare(`INSERT INTO devices (ip_address, mac_address, hostname, is_known, last_seen) VALUES (?, ?, ?, 0, datetime('now'))`)
        .run(ip, mac, hostname);
      newCount++;
    }
  }

  // Step 5: Auto-link devices to hosts by matching IP addresses
  db.prepare(`
    UPDATE devices SET host_id = (
      SELECT h.id FROM hosts h WHERE h.ip_address = devices.ip_address
    )
    WHERE host_id IS NULL AND ip_address IN (SELECT ip_address FROM hosts)
  `).run();

  // Return all devices
  const devices = db.prepare(`
    SELECT d.*, h.name AS host_name, COUNT(p.id) AS port_count
    FROM devices d
    LEFT JOIN hosts h ON h.id = d.host_id
    LEFT JOIN ports p ON p.host_id = d.host_id
    GROUP BY d.id ORDER BY d.ip_address
  `).all();

  return {
    devices,
    scan_summary: { total: devices.length, new: newCount, updated: updatedCount },
  };
}
```

- [ ] **Step 4: Run scanner tests**

Run: `cd "/home/marty/Desktop/port tracker" && npx vitest run test/scanner.test.js`
Expected: PASS

- [ ] **Step 5: Add scan endpoint to devices router**

In `server/routes/devices.js`, add the import at the top:

```javascript
import { scanNetwork } from '../scanner.js';
```

Add the scan route **before** the `/:id` routes (so `scan` doesn't match as `:id`):

```javascript
// POST /scan — trigger a network scan, returns all devices and summary
devicesRouter.post('/scan', async (req, res) => {
  try {
    const result = await scanNetwork(req.db);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 6: Run all tests**

Run: `cd "/home/marty/Desktop/port tracker" && npx vitest run`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add server/scanner.js server/routes/devices.js test/scanner.test.js
git commit -m "feat: network scanner with ARP + ping sweep + DNS lookup"
```

---

### Task 4: Install React Flow + Add Device API Client Functions

**Files:**
- Modify: `client/package.json` (via npm install)
- Modify: `client/src/api.js`

- [ ] **Step 1: Install React Flow**

```bash
cd "/home/marty/Desktop/port tracker/client" && npm install @xyflow/react
```

- [ ] **Step 2: Add device API functions to api.js**

Append these exports to `client/src/api.js`:

```javascript
// Device API
export const getDevices = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/devices${qs ? '?' + qs : ''}`);
};
export const createDevice = (data) => request('/devices', { method: 'POST', body: JSON.stringify(data) });
export const updateDevice = (id, data) => request(`/devices/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteDevice = (id) => request(`/devices/${id}`, { method: 'DELETE' });
export const saveDevicePosition = (id, x, y) => request(`/devices/${id}/position`, { method: 'PUT', body: JSON.stringify({ x, y }) });
export const scanNetwork = () => request('/devices/scan', { method: 'POST' });
```

- [ ] **Step 3: Commit**

```bash
cd "/home/marty/Desktop/port tracker"
git add client/package.json client/package-lock.json client/src/api.js
git commit -m "feat: install React Flow and add device API client functions"
```

---

### Task 5: DeviceNode Component

**Files:**
- Create: `client/src/components/DeviceNode.jsx`

- [ ] **Step 1: Create custom React Flow node**

Create `client/src/components/DeviceNode.jsx`:

```javascript
import React from 'react';
import { Handle, Position } from '@xyflow/react';

// Category color mapping for node borders
const CATEGORY_COLORS = {
  server: 'var(--accent)',
  desktop: '#4a90d9',
  mobile: 'var(--green-text)',
  iot: 'var(--yellow-text)',
  network: '#9b59b6',
  other: 'var(--text-muted)',
};

// Custom React Flow node for devices on the network map.
// Shows IP, hostname, category, and port count badge for linked hosts.
export function DeviceNode({ data }) {
  const { device } = data;
  const isLinked = !!device.host_id;
  const borderColor = CATEGORY_COLORS[device.category] || CATEGORY_COLORS.other;

  return (
    <div className={`device-node ${isLinked ? 'device-node-linked' : 'device-node-unknown'}`}
      style={{ borderColor }}>
      <Handle type="target" position={Position.Top} style={{ visibility: 'hidden' }} />
      <div className="device-node-hostname">
        {isLinked ? device.host_name : (device.hostname || 'Unknown')}
      </div>
      <div className="device-node-ip">{device.ip_address}</div>
      <div className="device-node-meta">
        <span className="device-node-category" style={{ color: borderColor }}>{device.category}</span>
        {isLinked && device.port_count > 0 && (
          <span className="device-node-ports">{device.port_count} port{device.port_count !== 1 ? 's' : ''}</span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ visibility: 'hidden' }} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/DeviceNode.jsx
git commit -m "feat: custom DeviceNode component for React Flow"
```

---

### Task 6: DevicePopover Component

**Files:**
- Create: `client/src/components/DevicePopover.jsx`

- [ ] **Step 1: Create popover component**

Create `client/src/components/DevicePopover.jsx`:

```javascript
import React, { useState, useEffect } from 'react';
import * as api from '../api.js';

const CATEGORIES = ['server', 'desktop', 'mobile', 'iot', 'network', 'other'];

// Popover shown when clicking a device node on the network map.
// Shows device details, linked host info, and action buttons.
export function DevicePopover({ device, hosts, onClose, onSelectHost, onCreateHost, onDeviceUpdated, onDeviceDeleted }) {
  const [services, setServices] = useState([]);
  const [editing, setEditing] = useState(false);
  const [editHostname, setEditHostname] = useState(device.hostname || '');
  const [editCategory, setEditCategory] = useState(device.category || 'other');
  const [linkHostId, setLinkHostId] = useState('');

  // Fetch top services if device is linked to a host
  useEffect(() => {
    if (device.host_id) {
      api.getHost(device.host_id).then(host => {
        setServices((host.ports || []).slice(0, 5));
      }).catch(() => {});
    }
  }, [device.host_id]);

  const handleSaveEdit = async () => {
    await api.updateDevice(device.id, { hostname: editHostname, category: editCategory });
    setEditing(false);
    onDeviceUpdated();
  };

  const handleLinkHost = async () => {
    if (!linkHostId) return;
    await api.updateDevice(device.id, { host_id: Number(linkHostId) });
    onDeviceUpdated();
  };

  const handleDelete = async () => {
    if (!confirm(`Remove ${device.hostname || device.ip_address} from map?`)) return;
    await api.deleteDevice(device.id);
    onDeviceDeleted();
  };

  // Hosts not already linked to any device
  const availableHosts = hosts.filter(h => h.id !== device.host_id);

  const lastSeen = device.last_seen ? new Date(device.last_seen).toLocaleString() : 'Never';

  return (
    <div className="device-popover">
      <div className="device-popover-header">
        <strong>{device.hostname || device.ip_address}</strong>
        <button className="btn btn-danger btn-sm" onClick={onClose}>&times;</button>
      </div>

      <div className="device-popover-details">
        <div><span className="device-popover-label">IP:</span> {device.ip_address}</div>
        {device.mac_address && <div><span className="device-popover-label">MAC:</span> {device.mac_address}</div>}
        <div><span className="device-popover-label">Category:</span> {device.category}</div>
        <div><span className="device-popover-label">Last seen:</span> {lastSeen}</div>
      </div>

      {/* Linked host info with services */}
      {device.host_id && (
        <div className="device-popover-host">
          <div className="device-popover-label">Host: {device.host_name}</div>
          <div className="device-popover-label">{device.port_count} port{device.port_count !== 1 ? 's' : ''}</div>
          {services.length > 0 && (
            <div className="device-popover-services">
              {services.map(s => (
                <div key={s.id} className="device-popover-service">
                  :{s.port_number} {s.service_name}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div className="device-popover-edit">
          <input className="search-input" value={editHostname} onChange={(e) => setEditHostname(e.target.value)}
            placeholder="Hostname" style={{ marginBottom: '6px' }} />
          <select className="search-input" value={editCategory} onChange={(e) => setEditCategory(e.target.value)}
            style={{ marginBottom: '6px' }}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button className="btn btn-primary btn-sm" onClick={handleSaveEdit}>Save</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Link to host dropdown */}
      {!device.host_id && !editing && (
        <div className="device-popover-link" style={{ marginTop: '8px' }}>
          <div style={{ display: 'flex', gap: '4px' }}>
            <select className="search-input" value={linkHostId} onChange={(e) => setLinkHostId(e.target.value)}
              style={{ flex: 1, fontSize: '12px' }}>
              <option value="">Link to host...</option>
              {availableHosts.map(h => <option key={h.id} value={h.id}>{h.name} ({h.ip_address})</option>)}
            </select>
            {linkHostId && <button className="btn btn-primary btn-sm" onClick={handleLinkHost}>Link</button>}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="device-popover-actions">
        {device.host_id && (
          <button className="btn btn-primary btn-sm" onClick={() => onSelectHost(device.host_id)}>View Details</button>
        )}
        {!device.host_id && (
          <button className="btn btn-primary btn-sm"
            onClick={() => onCreateHost({ ip_address: device.ip_address, name: device.hostname || '' }, device.id)}>
            Create Host
          </button>
        )}
        {!editing && <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>Edit Device</button>}
        <button className="btn btn-danger btn-sm" onClick={handleDelete}>Remove</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/DevicePopover.jsx
git commit -m "feat: DevicePopover with host info, linking, and edit actions"
```

---

### Task 7: NetworkMap Component

**Files:**
- Create: `client/src/components/NetworkMap.jsx`

- [ ] **Step 1: Create the network map view**

Create `client/src/components/NetworkMap.jsx`:

```javascript
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ReactFlow, MiniMap, Controls, useNodesState, useEdgesState } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import * as api from '../api.js';
import { DeviceNode } from './DeviceNode.jsx';
import { DevicePopover } from './DevicePopover.jsx';
import { HostForm } from './HostForm.jsx';

const nodeTypes = { device: DeviceNode };

const CATEGORIES = ['all', 'server', 'desktop', 'mobile', 'iot', 'network', 'other'];

// Force-layout helper: arrange nodes in a grid pattern for initial placement.
// Nodes with saved positions keep theirs; others get auto-positioned.
function layoutNodes(devices) {
  const unpositioned = devices.filter(d => d.x_position == null);
  const positioned = devices.filter(d => d.x_position != null);
  const cols = Math.max(4, Math.ceil(Math.sqrt(unpositioned.length)));
  const spacing = 200;

  const nodes = positioned.map(d => ({
    id: String(d.id),
    type: 'device',
    position: { x: d.x_position, y: d.y_position },
    data: { device: d },
  }));

  unpositioned.forEach((d, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    nodes.push({
      id: String(d.id),
      type: 'device',
      position: { x: col * spacing + 50, y: row * spacing + 50 },
      data: { device: d },
    });
  });

  return nodes;
}

// Main network map view with toolbar, React Flow canvas, and device popover.
export function NetworkMap({ hosts, onSelectHost, onHostCreated }) {
  const [devices, setDevices] = useState([]);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges] = useEdgesState([]);
  const [knownOnly, setKnownOnly] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [scanning, setScanning] = useState(false);
  const [scanSummary, setScanSummary] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [showHostForm, setShowHostForm] = useState(false);
  const [hostFormPrefill, setHostFormPrefill] = useState(null);
  const [linkDeviceId, setLinkDeviceId] = useState(null);
  const dragSaveTimeout = useRef(null);

  const fetchDevices = useCallback(async () => {
    const params = knownOnly ? { known_only: 'true' } : {};
    const data = await api.getDevices(params);
    setDevices(data);
  }, [knownOnly]);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  // Update nodes whenever devices or category filter changes
  useEffect(() => {
    let filtered = devices;
    if (categoryFilter !== 'all') {
      filtered = devices.filter(d => d.category === categoryFilter);
    }
    setNodes(layoutNodes(filtered));
  }, [devices, categoryFilter, setNodes]);

  const handleScan = async () => {
    setScanning(true);
    setScanSummary(null);
    try {
      const result = await api.scanNetwork();
      setScanSummary(result.scan_summary);
      await fetchDevices();
    } catch (err) {
      alert(err.error || 'Scan failed');
    }
    setScanning(false);
  };

  // Save position when a node is dragged
  const handleNodeDragStop = useCallback((event, node) => {
    clearTimeout(dragSaveTimeout.current);
    dragSaveTimeout.current = setTimeout(() => {
      api.saveDevicePosition(Number(node.id), node.position.x, node.position.y);
    }, 300);
  }, []);

  const handleNodeClick = useCallback((event, node) => {
    const device = node.data.device;
    setSelectedDevice(device);
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedDevice(null);
  }, []);

  const handleCreateHost = (prefill, deviceId) => {
    setHostFormPrefill(prefill);
    setLinkDeviceId(deviceId);
    setShowHostForm(true);
    setSelectedDevice(null);
  };

  const handleHostCreated = async () => {
    // After host is created, link the device to it
    if (linkDeviceId) {
      const updatedHosts = await api.getHosts();
      // Find the newly created host by matching IP
      const newHost = updatedHosts.find(h => h.ip_address === hostFormPrefill?.ip_address);
      if (newHost) {
        await api.updateDevice(linkDeviceId, { host_id: newHost.id });
      }
    }
    setShowHostForm(false);
    setHostFormPrefill(null);
    setLinkDeviceId(null);
    onHostCreated();
    fetchDevices();
  };

  const deviceCount = devices.length;
  const filteredCount = categoryFilter !== 'all'
    ? devices.filter(d => d.category === categoryFilter).length
    : deviceCount;

  return (
    <div className="network-map">
      {/* Toolbar */}
      <div className="map-toolbar">
        <button className="btn btn-primary btn-sm" onClick={handleScan} disabled={scanning}>
          {scanning ? 'Scanning...' : 'Scan Network'}
        </button>
        <button className={`btn btn-sm ${knownOnly ? 'btn-secondary' : 'btn-primary'}`}
          onClick={() => setKnownOnly(!knownOnly)}>
          {knownOnly ? 'Known Only' : 'Show All'}
        </button>
        <select className="map-filter-select" value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}>
          {CATEGORIES.map(c => (
            <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>
          ))}
        </select>
        <span className="map-device-count">
          {filteredCount} device{filteredCount !== 1 ? 's' : ''}
          {categoryFilter !== 'all' && ` (${deviceCount} total)`}
        </span>
        {scanSummary && (
          <span className="map-scan-summary">
            Found {scanSummary.new} new, updated {scanSummary.updated}
          </span>
        )}
      </div>

      {/* React Flow canvas */}
      <div className="map-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onNodeDragStop={handleNodeDragStop}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <MiniMap
            style={{ background: 'var(--bg-tertiary)' }}
            nodeColor="var(--accent)"
            maskColor="var(--overlay)"
          />
          <Controls />
        </ReactFlow>

        {/* Popover positioned near the map */}
        {selectedDevice && (
          <DevicePopover
            device={selectedDevice}
            hosts={hosts}
            onClose={() => setSelectedDevice(null)}
            onSelectHost={(id) => { setSelectedDevice(null); onSelectHost(id); }}
            onCreateHost={handleCreateHost}
            onDeviceUpdated={() => { setSelectedDevice(null); fetchDevices(); }}
            onDeviceDeleted={() => { setSelectedDevice(null); fetchDevices(); }}
          />
        )}
      </div>

      {/* Host creation form pre-filled from device */}
      {showHostForm && (
        <HostForm
          prefill={hostFormPrefill}
          onClose={() => { setShowHostForm(false); setHostFormPrefill(null); setLinkDeviceId(null); }}
          onSaved={handleHostCreated}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/NetworkMap.jsx
git commit -m "feat: NetworkMap component with React Flow canvas and toolbar"
```

---

### Task 8: Integrate Map into App + Sidebar + HostForm Prefill

**Files:**
- Modify: `client/src/App.jsx`
- Modify: `client/src/components/Sidebar.jsx`
- Modify: `client/src/components/HostForm.jsx`

- [ ] **Step 1: Update HostForm to accept prefill prop**

In `client/src/components/HostForm.jsx`, change the component signature and initial state to accept a `prefill` prop:

Replace the existing function signature and state:

```javascript
export function HostForm({ host, prefill, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: host?.name || prefill?.name || '', ip_address: host?.ip_address || prefill?.ip_address || '',
    os: host?.os || '', type: host?.type || 'other', description: host?.description || ''
  });
```

This lets the NetworkMap pass `prefill={{ ip_address: '...', name: '...' }}` when creating a host from a device.

- [ ] **Step 2: Add map view to App.jsx**

In `client/src/App.jsx`:

Add the import at the top with the other component imports:

```javascript
import { NetworkMap } from './components/NetworkMap.jsx';
```

Add a `handleShowMap` function after `handleShowNotes`:

```javascript
const handleShowMap = () => {
  setSelectedHostId(null);
  setView('map');
  setSearchQuery('');
  setSearchResults(null);
  setSidebarOpen(false);
};
```

Pass the new handler and view to Sidebar:

```javascript
<Sidebar hosts={hosts} selectedHostId={selectedHostId} onSelectHost={handleSelectHost}
  onShowNotes={handleShowNotes} onShowMap={handleShowMap} onSearch={handleSearch} searchQuery={searchQuery}
  view={view} onHostCreated={refreshHosts} theme={theme} onToggleTheme={toggleTheme}
  isOpen={sidebarOpen} />
```

Add the map view rendering inside the `<div className="main">`, after the notes view line:

```javascript
{view === 'map' && <NetworkMap hosts={hosts} onSelectHost={handleSelectHost} onHostCreated={refreshHosts} />}
```

- [ ] **Step 3: Add Network Map nav item to Sidebar**

In `client/src/components/Sidebar.jsx`:

Update the function signature to accept the new props:

```javascript
export function Sidebar({ hosts, selectedHostId, onSelectHost, onShowNotes, onShowMap, onSearch, searchQuery, view, onHostCreated, theme, onToggleTheme, isOpen }) {
```

In the sidebar-footer div, add the Network Map item between Notes and the Add Host button:

```javascript
<div className="sidebar-footer">
  <div className={`sidebar-nav-item ${view === 'notes' ? 'active' : ''}`} onClick={onShowNotes}>Notes</div>
  <div className={`sidebar-nav-item ${view === 'map' ? 'active' : ''}`} onClick={onShowMap}>Network Map</div>
  <button className="btn btn-primary btn-full" onClick={() => setShowHostForm(true)}>+ Add Host</button>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add client/src/App.jsx client/src/components/Sidebar.jsx client/src/components/HostForm.jsx
git commit -m "feat: integrate network map view into app shell and sidebar"
```

---

### Task 9: Map Styles (CSS)

**Files:**
- Modify: `client/src/App.css`

- [ ] **Step 1: Add network map styles**

Append these styles to the end of `client/src/App.css` (before the mobile media queries):

```css
/* ── Network Map ───────────────────────────────── */

.network-map { display: flex; flex-direction: column; height: calc(100vh - 48px); }
.map-toolbar {
  display: flex; gap: 8px; align-items: center; padding: 12px 0;
  flex-wrap: wrap;
}
.map-filter-select {
  padding: 4px 10px; background: var(--bg-primary); border: 1px solid var(--border);
  border-radius: var(--radius); color: var(--text-primary); font-size: 12px; outline: none;
}
.map-device-count { font-size: 12px; color: var(--text-muted); }
.map-scan-summary { font-size: 12px; color: var(--green-text); }
.map-canvas { flex: 1; position: relative; border-radius: var(--radius); overflow: hidden; }

/* React Flow overrides to match theme */
.map-canvas .react-flow__background { background: var(--bg-primary); }
.map-canvas .react-flow__controls button {
  background: var(--bg-secondary); border-color: var(--border); color: var(--text-primary);
  fill: var(--text-primary);
}
.map-canvas .react-flow__controls button:hover { background: var(--bg-hover); }

/* Device node styling */
.device-node {
  background: var(--bg-secondary); border: 2px solid var(--border);
  border-radius: 8px; padding: 10px 14px; min-width: 140px;
  cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s;
}
.device-node:hover { box-shadow: var(--shadow); }
.device-node-linked { border-width: 2px; }
.device-node-unknown { opacity: 0.65; }
.device-node-hostname { font-size: 13px; font-weight: 600; margin-bottom: 2px; color: var(--text-primary); }
.device-node-ip { font-size: 11px; color: var(--text-muted); font-family: monospace; }
.device-node-meta { display: flex; justify-content: space-between; margin-top: 4px; }
.device-node-category { font-size: 10px; text-transform: uppercase; }
.device-node-ports { font-size: 10px; color: var(--text-secondary); }

/* Device popover */
.device-popover {
  position: absolute; top: 16px; right: 16px; width: 280px; z-index: 10;
  background: var(--bg-secondary); border: 1px solid var(--border);
  border-radius: 8px; padding: 16px; box-shadow: var(--shadow);
  max-height: calc(100vh - 150px); overflow-y: auto;
}
.device-popover-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 10px; font-size: 15px;
}
.device-popover-details { margin-bottom: 10px; }
.device-popover-details > div { font-size: 12px; color: var(--text-secondary); margin-bottom: 3px; }
.device-popover-label { color: var(--text-muted); font-size: 11px; text-transform: uppercase; }
.device-popover-host {
  background: var(--bg-tertiary); border-radius: var(--radius);
  padding: 8px 10px; margin-bottom: 10px;
}
.device-popover-services { margin-top: 6px; }
.device-popover-service {
  font-size: 11px; font-family: monospace; color: var(--text-secondary);
  padding: 1px 0;
}
.device-popover-edit { margin-bottom: 10px; }
.device-popover-actions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 10px; }
```

Make sure these styles are placed **before** the `@media (max-width: 768px)` block. Also add inside the `@media (max-width: 768px)` block:

```css
  /* Network map responsive */
  .network-map { height: calc(100vh - 100px); }
  .map-toolbar { padding: 8px 0; }
  .device-popover { width: calc(100% - 32px); right: 16px; left: 16px; }
```

- [ ] **Step 2: Commit**

```bash
git add client/src/App.css
git commit -m "feat: network map and device node styles with responsive support"
```

---

### Task 10: Docker Compose Update

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Update docker-compose.yml for host networking**

Replace the entire contents of `docker-compose.yml` with:

```yaml
services:
  port-tracker:
    build: .
    network_mode: host
    volumes:
      - port-tracker-data:/app/data
    restart: unless-stopped
    environment:
      - PORT=3000

volumes:
  port-tracker-data:
```

- [ ] **Step 2: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: switch to host networking for LAN scanning"
```

---

### Task 11: End-to-End Verification

Verify the full feature against the spec's verification plan.

- [ ] **Step 1: Run all tests**

```bash
cd "/home/marty/Desktop/port tracker" && npx vitest run
```

Expected: All tests pass (existing 41 + new device and scanner tests).

- [ ] **Step 2: Build and start Docker container**

```bash
cd "/home/marty/Desktop/port tracker" && docker compose up --build -d
```

Open http://localhost:3000

- [ ] **Step 3: Verify map view loads**

Click "Network Map" in the sidebar. Verify the map view renders with the toolbar (Scan Network button, filter toggles, device count showing 0).

- [ ] **Step 4: Test network scan**

Click "Scan Network". Wait for scan to complete. Verify devices appear as nodes on the map. Verify the scan summary shows "Found X new, updated Y".

- [ ] **Step 5: Test node interaction**

Click a discovered device node. Verify popover shows IP, MAC, category, last seen. Test "Edit Device" — change hostname and category, save, verify update.

- [ ] **Step 6: Test Create Host from device**

Click an unlinked device. Click "Create Host". Verify HostForm opens pre-filled with IP. Save the host. Verify the device is now linked (accent border, host name shows).

- [ ] **Step 7: Test View Details navigation**

Click a linked device node. Click "View Details" in popover. Verify navigation to the existing host detail page with port table.

- [ ] **Step 8: Test drag position persistence**

Drag a device node to a new position. Reload the page, return to Network Map. Verify the node is still in the saved position.

- [ ] **Step 9: Test filtering**

Toggle "Known Only" / "Show All". Verify correct devices appear/disappear. Select a category from the dropdown. Verify only matching devices show.

- [ ] **Step 10: Test device deletion**

Click a device, click "Remove". Confirm. Verify the node disappears from the map.

- [ ] **Step 11: Stop container**

```bash
docker compose down
```

- [ ] **Step 12: Commit any fixes from verification**

```bash
git add -A
git commit -m "fix: adjustments from network map end-to-end verification"
```
