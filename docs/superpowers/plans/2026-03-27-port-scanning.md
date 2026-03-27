# Port Scanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add TCP connect port scanning to auto-discover open services on hosts, create/update port entries, and mark closed ports as inactive.

**Architecture:** Node.js `net.Socket` TCP connect scanning with batched concurrency (50 at a time). Synchronous request/response — no background jobs. Curated ~150 home-lab port list as default, with custom range support. UI in host detail view and device popover.

**Tech Stack:** Node.js `net` module, Express, better-sqlite3, React, vitest, supertest

**Spec:** `docs/superpowers/specs/2026-03-27-port-scanning-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `server/port-scanner.js` | Create | TCP scanning logic, port list, parsing, service name lookup |
| `server/routes/ports.js` | Modify | Add `POST /hosts/:id/scan` endpoint |
| `test/port-scanner.test.js` | Create | Unit tests for parser, service lookup |
| `test/port-scan-api.test.js` | Create | Integration tests for scan endpoint with mocked scanner |
| `client/src/api.js` | Modify | Add `scanHostPorts()` function |
| `client/src/components/HostDetail.jsx` | Modify | Add Scan Ports button + dropdown + summary |
| `client/src/components/DevicePopover.jsx` | Modify | Add Scan Ports button for linked devices |
| `client/src/App.css` | Modify | Scan dropdown and summary styles |

---

## Summary (7 Tasks)

1. **Port Scanner Module** — `scanPort`, `scanPorts`, `COMMON_PORTS`, `getServiceName`, `parsePorts`
2. **Port Scanner Unit Tests** — Tests for `parsePorts` and `getServiceName`
3. **Scan API Endpoint** — `POST /hosts/:id/scan` with database logic
4. **Scan API Integration Tests** — Mocked scanner, test all DB behaviors
5. **API Client Function** — `scanHostPorts()` in `client/src/api.js`
6. **Host Detail Scan UI** — Scan button, dropdown, scanning state, summary display
7. **Device Popover Scan UI** — Scan button for linked devices in network map popover

---

### Task 1: Port Scanner Module

**Files:**
- Create: `server/port-scanner.js`

- [ ] **Step 1: Create port-scanner.js with COMMON_PORTS map and getServiceName**

```javascript
// server/port-scanner.js
import net from 'net';

// Curated home-lab port-to-service-name map (~150 ports).
export const COMMON_PORTS = new Map([
  // Infrastructure
  [21, 'FTP'], [22, 'SSH'], [23, 'Telnet'], [25, 'SMTP'], [53, 'DNS'],
  [67, 'DHCP'], [68, 'DHCP'], [69, 'TFTP'], [80, 'HTTP'], [110, 'POP3'],
  [111, 'RPCBind'], [123, 'NTP'], [135, 'MSRPC'], [137, 'NetBIOS'], [138, 'NetBIOS'],
  [139, 'NetBIOS'], [143, 'IMAP'], [161, 'SNMP'], [162, 'SNMP Trap'],
  [389, 'LDAP'], [443, 'HTTPS'], [445, 'SMB'], [465, 'SMTPS'],
  [514, 'Syslog'], [587, 'SMTP Submission'], [631, 'CUPS/IPP'],
  [636, 'LDAPS'], [853, 'DNS over TLS'], [873, 'rsync'],
  [993, 'IMAPS'], [995, 'POP3S'],

  // Databases
  [1433, 'MSSQL'], [1521, 'Oracle DB'], [3306, 'MySQL'], [5432, 'PostgreSQL'],
  [6379, 'Redis'], [9042, 'Cassandra'], [27017, 'MongoDB'], [5984, 'CouchDB'],
  [8529, 'ArangoDB'], [7474, 'Neo4j'], [26257, 'CockroachDB'],
  [2379, 'etcd'], [8087, 'Riak'],

  // Message queues
  [5672, 'RabbitMQ'], [9092, 'Kafka'], [4222, 'NATS'], [1883, 'MQTT'],
  [8883, 'MQTT TLS'], [6650, 'Pulsar'],

  // Containers & orchestration
  [2375, 'Docker (unencrypted)'], [2376, 'Docker (TLS)'], [2377, 'Docker Swarm'],
  [5000, 'Docker Registry'], [8443, 'Kubernetes API/HTTPS (alt)'], [10250, 'Kubelet'],
  [10255, 'Kubelet (read-only)'], [6443, 'K3s API'], [9000, 'Portainer'],
  [9443, 'Portainer HTTPS'],

  // Proxmox & virtualization
  [8006, 'Proxmox'], [3128, 'Squid Proxy'], [16509, 'libvirt'],
  [5900, 'VNC :0'], [5901, 'VNC :1'], [5902, 'VNC :2'], [5903, 'VNC :3'],
  [5904, 'VNC :4'], [5905, 'VNC :5'], [5906, 'VNC :6'], [5907, 'VNC :7'],
  [5908, 'VNC :8'], [5909, 'VNC :9'], [5910, 'VNC :10'],
  [3389, 'RDP'], [2049, 'NFS'],

  // Media
  [8096, 'Jellyfin'], [8920, 'Jellyfin HTTPS'], [32400, 'Plex'],
  [8989, 'Sonarr'], [7878, 'Radarr'], [8686, 'Lidarr'], [6767, 'Bazarr'],
  [9696, 'Prowlarr'], [8787, 'Readarr'], [7879, 'Whisparr'],
  [8112, 'Deluge'], [9091, 'Transmission'],
  [6881, 'BitTorrent'],

  // Home automation
  [8123, 'Home Assistant'], [1400, 'Sonos'], [8008, 'Chromecast'],
  [5353, 'mDNS'], [10000, 'Webmin'],

  // Monitoring & logging
  [9090, 'Prometheus'], [9093, 'Alertmanager'],
  [9100, 'Node Exporter'], [9115, 'Blackbox Exporter'],
  [5601, 'Kibana'], [9200, 'Elasticsearch'], [9300, 'Elasticsearch (transport)'],
  [5044, 'Logstash Beats'], [3100, 'Loki'], [4317, 'OTLP gRPC'],
  [4318, 'OTLP HTTP'], [8428, 'VictoriaMetrics'], [16686, 'Jaeger'],
  [9411, 'Zipkin'], [8086, 'InfluxDB'],

  // Web servers & reverse proxies
  [81, 'HTTP (alt)'], [8080, 'HTTP Proxy'],
  [8081, 'HTTP (alt)'], [8082, 'HTTP (alt)'], [8083, 'HTTP (alt)'],
  [8084, 'HTTP (alt)'], [8085, 'HTTP (alt)'], [8088, 'HTTP (alt)'],
  [8089, 'HTTP (alt)'], [8090, 'HTTP (alt)'], [8091, 'HTTP (alt)'],
  [8092, 'HTTP (alt)'], [8093, 'HTTP (alt)'], [8094, 'HTTP (alt)'],
  [8095, 'HTTP (alt)'], [8097, 'HTTP (alt)'], [8098, 'HTTP (alt)'],
  [8099, 'HTTP (alt)'],
  [8880, 'HTTP (alt)'], [8888, 'HTTP (alt)'], [9080, 'HTTP (alt)'],

  // Networking & VPN
  [51820, 'WireGuard'], [1194, 'OpenVPN'], [500, 'IKE/IPSec'],
  [4500, 'IPSec NAT-T'], [1701, 'L2TP'], [1723, 'PPTP'],
  [8291, 'MikroTik Winbox'], [8728, 'MikroTik API'], [8729, 'MikroTik API TLS'],

  // CI/CD & dev tools
  [3000, 'Grafana/Gitea'], [8929, 'GitLab'],
  [9418, 'Git'], [6000, 'X11'],

  // Other common
  [1080, 'SOCKS Proxy'], [1900, 'UPnP/SSDP'], [2222, 'SSH (alt)'],
  [4040, 'Localtunnel'], [4443, 'HTTPS (alt)'], [7681, 'ttyd'],
  [8000, 'HTTP (alt)'], [8001, 'HTTP (alt)'], [8002, 'HTTP (alt)'],
  [19999, 'Netdata'], [24800, 'Synergy'], [25565, 'Minecraft'],
  [27015, 'Source Engine'],
]);

// Look up a service name by port number. Returns 'unknown' for unlisted ports.
export function getServiceName(port) {
  return COMMON_PORTS.get(port) || 'unknown';
}

// Parse a port specification string into an array of port numbers.
// Accepts: 'common' (default), '1-1024' (range), '80,443,8080' (list), '1-65535' (full).
export function parsePorts(spec) {
  if (!spec || spec === 'common') {
    return [...COMMON_PORTS.keys()];
  }

  const ports = [];

  const parts = spec.split(',').map(s => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-');
      const start = Number(startStr);
      const end = Number(endStr);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > 65535 || start > end) {
        throw new Error(`Invalid port range: ${part}`);
      }
      for (let p = start; p <= end; p++) {
        ports.push(p);
      }
    } else {
      const p = Number(part);
      if (!Number.isInteger(p) || p < 1 || p > 65535) {
        throw new Error(`Invalid port number: ${part}`);
      }
      ports.push(p);
    }
  }

  if (ports.length === 0) {
    throw new Error('No ports specified');
  }

  return ports;
}

// Scan a single port via TCP connect. Resolves { port, open: true/false }.
export function scanPort(host, port, timeout = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.on('connect', () => { socket.destroy(); resolve({ port, open: true }); });
    socket.on('timeout', () => { socket.destroy(); resolve({ port, open: false }); });
    socket.on('error', () => { socket.destroy(); resolve({ port, open: false }); });
    socket.connect(port, host);
  });
}

// Scan multiple ports with batched concurrency. Returns only open port results.
export async function scanPorts(host, ports, concurrency = 50) {
  const results = [];
  for (let i = 0; i < ports.length; i += concurrency) {
    const batch = ports.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(p => scanPort(host, p)));
    results.push(...batchResults.filter(r => r.open));
  }
  return results;
}
```

- [ ] **Step 2: Verify the module loads without errors**

Run: `cd "/home/marty/Desktop/port tracker" && node -e "import('./server/port-scanner.js').then(m => console.log('OK, ports:', m.COMMON_PORTS.size))"`

Expected: `OK, ports:` followed by a number around 150

- [ ] **Step 3: Commit**

```bash
git add server/port-scanner.js
git commit -m "feat: add port scanner module with TCP connect scanning and common ports map"
```

---

### Task 2: Port Scanner Unit Tests

**Files:**
- Create: `test/port-scanner.test.js`

- [ ] **Step 1: Write unit tests for parsePorts and getServiceName**

```javascript
// test/port-scanner.test.js
import { describe, it, expect } from 'vitest';
import { parsePorts, getServiceName, COMMON_PORTS } from '../server/port-scanner.js';

describe('parsePorts', () => {
  it('returns common ports for "common"', () => {
    const ports = parsePorts('common');
    expect(ports.length).toBeGreaterThan(100);
    expect(ports).toContain(22);
    expect(ports).toContain(80);
    expect(ports).toContain(443);
  });

  it('returns common ports when spec is undefined', () => {
    const ports = parsePorts(undefined);
    expect(ports.length).toBe(parsePorts('common').length);
  });

  it('parses comma-separated list', () => {
    const ports = parsePorts('80,443,8080');
    expect(ports).toEqual([80, 443, 8080]);
  });

  it('parses a range', () => {
    const ports = parsePorts('1-10');
    expect(ports).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('parses mixed ranges and singles', () => {
    const ports = parsePorts('22,80-82,443');
    expect(ports).toEqual([22, 80, 81, 82, 443]);
  });

  it('throws on invalid port string', () => {
    expect(() => parsePorts('abc')).toThrow('Invalid port number');
  });

  it('throws on port 0 (below range)', () => {
    expect(() => parsePorts('0')).toThrow('Invalid port number');
  });

  it('throws on port above 65535', () => {
    expect(() => parsePorts('99999')).toThrow('Invalid port number');
  });

  it('throws on invalid range (start > end)', () => {
    expect(() => parsePorts('100-50')).toThrow('Invalid port range');
  });

  it('throws on empty string', () => {
    expect(() => parsePorts('')).toThrow('No ports specified');
  });
});

describe('getServiceName', () => {
  it('returns SSH for port 22', () => {
    expect(getServiceName(22)).toBe('SSH');
  });

  it('returns HTTP for port 80', () => {
    expect(getServiceName(80)).toBe('HTTP');
  });

  it('returns HTTPS for port 443', () => {
    expect(getServiceName(443)).toBe('HTTPS');
  });

  it('returns MySQL for port 3306', () => {
    expect(getServiceName(3306)).toBe('MySQL');
  });

  it('returns unknown for unlisted port', () => {
    expect(getServiceName(59999)).toBe('unknown');
  });
});

describe('COMMON_PORTS', () => {
  it('has more than 100 entries', () => {
    expect(COMMON_PORTS.size).toBeGreaterThan(100);
  });

  it('all keys are valid port numbers', () => {
    for (const port of COMMON_PORTS.keys()) {
      expect(port).toBeGreaterThanOrEqual(1);
      expect(port).toBeLessThanOrEqual(65535);
    }
  });

  it('all values are non-empty strings', () => {
    for (const name of COMMON_PORTS.values()) {
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `cd "/home/marty/Desktop/port tracker" && npx vitest run test/port-scanner.test.js`

Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add test/port-scanner.test.js
git commit -m "test: add unit tests for port scanner parsePorts and getServiceName"
```

---

### Task 3: Scan API Endpoint

**Files:**
- Modify: `server/routes/ports.js`

The scan endpoint goes in `ports.js` because it operates on the ports table and lives under `/api/hosts/:id/scan`. It must be placed BEFORE the existing `POST /hosts/:id/ports` route so Express matches `/hosts/:id/scan` before `/:id/ports`.

- [ ] **Step 1: Add scan endpoint to ports.js**

Add these imports at the top of `server/routes/ports.js`:

```javascript
import { scanPorts, parsePorts, getServiceName } from '../port-scanner.js';
```

Add this route BEFORE the existing `portsRouter.get('/hosts/:id/ports', ...)` route (i.e., after line 3 `export const portsRouter = Router();` and before line 6 `portsRouter.get('/hosts/:id/ports', ...)`):

```javascript
// POST /hosts/:id/scan — scan a host's ports and auto-create/update entries
portsRouter.post('/hosts/:id/scan', async (req, res) => {
  const host = req.db.prepare('SELECT * FROM hosts WHERE id = ?').get(req.params.id);
  if (!host) {
    return res.status(404).json({ error: 'Host not found' });
  }

  let portList;
  try {
    portList = parsePorts(req.body.ports);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const openResults = await scanPorts(host.ip_address, portList);
  const openPortNumbers = new Set(openResults.map(r => r.port));
  const scannedSet = new Set(portList);

  let newCount = 0;
  let updatedCount = 0;
  let closedCount = 0;
  const openPorts = [];

  // Process open ports: create new or update existing
  for (const { port } of openResults) {
    const existing = req.db.prepare(
      'SELECT * FROM ports WHERE host_id = ? AND port_number = ? AND protocol = ?'
    ).get(host.id, port, 'TCP');

    if (existing) {
      req.db.prepare(
        `UPDATE ports SET status = 'active', updated_at = datetime('now') WHERE id = ?`
      ).run(existing.id);
      updatedCount++;
      openPorts.push({ port, service_name: existing.service_name, is_new: false });
    } else {
      const serviceName = getServiceName(port);
      req.db.prepare(
        `INSERT INTO ports (host_id, port_number, service_name, protocol, status) VALUES (?, ?, ?, 'TCP', 'active')`
      ).run(host.id, port, serviceName);
      newCount++;
      openPorts.push({ port, service_name: serviceName, is_new: true });
    }
  }

  // Mark scanned-but-closed ports as inactive
  const activePorts = req.db.prepare(
    `SELECT * FROM ports WHERE host_id = ? AND protocol = 'TCP' AND status = 'active'`
  ).all(host.id);

  for (const ap of activePorts) {
    if (scannedSet.has(ap.port_number) && !openPortNumbers.has(ap.port_number)) {
      req.db.prepare(
        `UPDATE ports SET status = 'inactive', updated_at = datetime('now') WHERE id = ?`
      ).run(ap.id);
      closedCount++;
    }
  }

  res.json({
    scan_summary: {
      host: host.name,
      ip: host.ip_address,
      scanned: portList.length,
      open: openResults.length,
      new: newCount,
      updated: updatedCount,
      closed: closedCount,
    },
    open_ports: openPorts,
  });
});
```

- [ ] **Step 2: Verify the server still starts**

Run: `cd "/home/marty/Desktop/port tracker" && node -e "import('./server/index.js').then(() => console.log('OK'))"`

Expected: `OK` (server starts without import errors)

- [ ] **Step 3: Commit**

```bash
git add server/routes/ports.js
git commit -m "feat: add POST /hosts/:id/scan endpoint for TCP port scanning"
```

---

### Task 4: Scan API Integration Tests

**Files:**
- Create: `test/port-scan-api.test.js`

Integration tests mock `scanPorts` to return controlled results so we can test the database logic without depending on real network ports.

- [ ] **Step 1: Write integration tests**

```javascript
// test/port-scan-api.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './setup.js';

// Mock the scanPorts function so tests don't hit the network
vi.mock('../server/port-scanner.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    scanPorts: vi.fn().mockResolvedValue([
      { port: 22, open: true },
      { port: 80, open: true },
      { port: 443, open: true },
    ]),
  };
});

describe('POST /api/hosts/:id/scan', () => {
  let app, db;

  beforeEach(() => {
    vi.clearAllMocks();
    ({ app, db } = createTestApp());
    // Create a test host
    db.prepare("INSERT INTO hosts (name, ip_address) VALUES ('test-host', '192.168.1.10')").run();
  });

  it('returns scan summary with open ports', async () => {
    const res = await request(app).post('/api/hosts/1/scan').send({ ports: '22,80,443' });
    expect(res.status).toBe(200);
    expect(res.body.scan_summary).toMatchObject({
      host: 'test-host',
      ip: '192.168.1.10',
      scanned: 3,
      open: 3,
      new: 3,
      updated: 0,
      closed: 0,
    });
    expect(res.body.open_ports).toHaveLength(3);
    expect(res.body.open_ports[0]).toMatchObject({ port: 22, service_name: 'SSH', is_new: true });
  });

  it('creates new port entries for discovered open ports', async () => {
    await request(app).post('/api/hosts/1/scan').send({ ports: '22,80' });
    const ports = db.prepare('SELECT * FROM ports WHERE host_id = 1 ORDER BY port_number').all();
    expect(ports).toHaveLength(2);
    expect(ports[0]).toMatchObject({ port_number: 22, service_name: 'SSH', protocol: 'TCP', status: 'active' });
    expect(ports[1]).toMatchObject({ port_number: 80, service_name: 'HTTP', protocol: 'TCP', status: 'active' });
  });

  it('updates existing active ports and counts them as updated', async () => {
    // Pre-insert port 22 as inactive
    db.prepare("INSERT INTO ports (host_id, port_number, service_name, protocol, status) VALUES (1, 22, 'OpenSSH', 'TCP', 'inactive')").run();

    const res = await request(app).post('/api/hosts/1/scan').send({ ports: '22,80,443' });
    expect(res.body.scan_summary.updated).toBe(1);
    expect(res.body.scan_summary.new).toBe(2);

    // Port 22 should be active now with original service name preserved
    const port22 = db.prepare("SELECT * FROM ports WHERE host_id = 1 AND port_number = 22").get();
    expect(port22.status).toBe('active');
    expect(port22.service_name).toBe('OpenSSH');

    // open_ports entry should show is_new: false
    const p22Result = res.body.open_ports.find(p => p.port === 22);
    expect(p22Result.is_new).toBe(false);
  });

  it('marks previously active ports as inactive when found closed', async () => {
    const { scanPorts } = await import('../server/port-scanner.js');
    // Mock returns only port 22 open; 80 and 443 are closed
    scanPorts.mockResolvedValueOnce([{ port: 22, open: true }]);

    // Pre-insert ports 22 and 80 as active
    db.prepare("INSERT INTO ports (host_id, port_number, service_name, protocol, status) VALUES (1, 22, 'SSH', 'TCP', 'active')").run();
    db.prepare("INSERT INTO ports (host_id, port_number, service_name, protocol, status) VALUES (1, 80, 'HTTP', 'TCP', 'active')").run();

    const res = await request(app).post('/api/hosts/1/scan').send({ ports: '22,80,443' });
    expect(res.body.scan_summary.closed).toBe(1);

    const port80 = db.prepare("SELECT * FROM ports WHERE host_id = 1 AND port_number = 80").get();
    expect(port80.status).toBe('inactive');
  });

  it('does not mark ports outside the scanned range as inactive', async () => {
    const { scanPorts } = await import('../server/port-scanner.js');
    scanPorts.mockResolvedValueOnce([{ port: 22, open: true }]);

    // Pre-insert port 3306 as active (not in scan range)
    db.prepare("INSERT INTO ports (host_id, port_number, service_name, protocol, status) VALUES (1, 3306, 'MySQL', 'TCP', 'active')").run();

    await request(app).post('/api/hosts/1/scan').send({ ports: '22,80' });

    const port3306 = db.prepare("SELECT * FROM ports WHERE host_id = 1 AND port_number = 3306").get();
    expect(port3306.status).toBe('active');
  });

  it('returns 404 for nonexistent host', async () => {
    const res = await request(app).post('/api/hosts/999/scan').send({});
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Host not found');
  });

  it('returns 400 for invalid port spec', async () => {
    const res = await request(app).post('/api/hosts/1/scan').send({ ports: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid port/);
  });

  it('uses common ports when no ports specified', async () => {
    const res = await request(app).post('/api/hosts/1/scan').send({});
    expect(res.status).toBe(200);
    expect(res.body.scan_summary.scanned).toBeGreaterThan(100);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `cd "/home/marty/Desktop/port tracker" && npx vitest run test/port-scan-api.test.js`

Expected: All 8 tests pass

- [ ] **Step 3: Run all tests to verify nothing is broken**

Run: `cd "/home/marty/Desktop/port tracker" && npx vitest run`

Expected: All tests pass (existing 60 + new ~19)

- [ ] **Step 4: Commit**

```bash
git add test/port-scan-api.test.js
git commit -m "test: add integration tests for port scan API endpoint"
```

---

### Task 5: API Client Function

**Files:**
- Modify: `client/src/api.js`

- [ ] **Step 1: Add scanHostPorts to api.js**

Add this line after the existing `export const deletePort` line (line 35):

```javascript
export const scanHostPorts = (hostId, ports = 'common') =>
  request(`/hosts/${hostId}/scan`, { method: 'POST', body: JSON.stringify({ ports }) });
```

- [ ] **Step 2: Commit**

```bash
git add client/src/api.js
git commit -m "feat: add scanHostPorts API client function"
```

---

### Task 6: Host Detail Scan UI

**Files:**
- Modify: `client/src/components/HostDetail.jsx`
- Modify: `client/src/App.css`

- [ ] **Step 1: Add scan state and handler to HostDetail.jsx**

Add these state variables after the existing state declarations (after line 20 `const [editNote, setEditNote] = useState(null);`):

```javascript
  const [scanning, setScanning] = useState(false);
  const [scanSummary, setScanSummary] = useState(null);
  const [showScanMenu, setShowScanMenu] = useState(false);
  const [customPorts, setCustomPorts] = useState('');
```

Add this handler function after the existing `handleDelete` function (after line 30):

```javascript
  const handleScan = async (ports = 'common') => {
    setShowScanMenu(false);
    setScanning(true);
    setScanSummary(null);
    try {
      const result = await api.scanHostPorts(host.id, ports);
      setScanSummary(result.scan_summary);
      await refresh();
      onHostUpdated();
      setTimeout(() => setScanSummary(null), 8000);
    } catch (err) {
      alert(err.error || 'Scan failed');
    }
    setScanning(false);
  };
```

- [ ] **Step 2: Add Scan Ports button and dropdown to the JSX**

In the `main-actions` div, add the scan button BEFORE the existing Export button. Replace the entire `<div className="main-actions">` block (lines 48-53) with:

```javascript
        <div className="main-actions">
          <div className="scan-dropdown-wrapper">
            <button className="btn btn-primary btn-sm" disabled={scanning}
              onClick={() => setShowScanMenu(!showScanMenu)}>
              {scanning ? 'Scanning...' : 'Scan Ports'}
            </button>
            {showScanMenu && (
              <div className="scan-dropdown">
                <button className="scan-dropdown-item" onClick={() => handleScan('common')}>Common Ports (~150)</button>
                <button className="scan-dropdown-item" onClick={() => handleScan('1-1024')}>Well-Known (1-1024)</button>
                <div className="scan-dropdown-custom">
                  <input className="search-input" value={customPorts} onChange={(e) => setCustomPorts(e.target.value)}
                    placeholder="e.g. 80,443,8080 or 1-1024" style={{ fontSize: '12px' }} />
                  <button className="btn btn-primary btn-sm"
                    onClick={() => { if (customPorts.trim()) handleScan(customPorts.trim()); }}
                    disabled={!customPorts.trim()}>Scan</button>
                </div>
              </div>
            )}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowExport(!showExport)}>Export</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowHostEdit(true)}>Edit</button>
          <button className="btn btn-danger btn-sm" onClick={handleDelete}>Delete</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setEditPort(null); setShowPortForm(true); }}>+ Add Port</button>
        </div>
```

- [ ] **Step 3: Add scan summary display**

Add this block right after the closing `</div>` of `main-header` (after the div that contains `main-actions`) and before the `{showExport && ...}` line:

```javascript
      {scanSummary && (
        <div className="scan-summary">
          Found {scanSummary.open} open port{scanSummary.open !== 1 ? 's' : ''} —
          {' '}{scanSummary.new} new, {scanSummary.updated} updated, {scanSummary.closed} closed
        </div>
      )}
```

- [ ] **Step 4: Add CSS styles for scan dropdown and summary**

Add these styles to `client/src/App.css` before the `@media (max-width: 768px)` block:

```css
/* Port scan dropdown */
.scan-dropdown-wrapper {
  position: relative;
}

.scan-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 100;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px;
  min-width: 220px;
  box-shadow: 0 4px 12px var(--overlay);
  margin-top: 4px;
}

.scan-dropdown-item {
  display: block;
  width: 100%;
  padding: 8px 12px;
  background: none;
  border: none;
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
  border-radius: 4px;
  font-size: 13px;
}

.scan-dropdown-item:hover {
  background: var(--bg-tertiary);
}

.scan-dropdown-custom {
  display: flex;
  gap: 4px;
  padding: 6px;
  border-top: 1px solid var(--border);
  margin-top: 4px;
}

.scan-summary {
  background: var(--bg-secondary);
  border: 1px solid var(--accent);
  border-radius: 6px;
  padding: 8px 14px;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--accent);
}
```

- [ ] **Step 5: Verify the build works**

Run: `cd "/home/marty/Desktop/port tracker/client" && npx vite build`

Expected: Build succeeds with no errors

- [ ] **Step 6: Commit**

```bash
git add client/src/components/HostDetail.jsx client/src/App.css
git commit -m "feat: add Scan Ports button with dropdown and summary in host detail view"
```

---

### Task 7: Device Popover Scan UI

**Files:**
- Modify: `client/src/components/DevicePopover.jsx`

- [ ] **Step 1: Add scan state and handler to DevicePopover.jsx**

Add these state variables after the existing `const [linkHostId, setLinkHostId] = useState('');` (line 13):

```javascript
  const [scanning, setScanning] = useState(false);
  const [scanSummary, setScanSummary] = useState(null);
```

Add this handler after the existing `handleDelete` function (after line 40):

```javascript
  const handleScanPorts = async () => {
    setScanning(true);
    setScanSummary(null);
    try {
      const result = await api.scanHostPorts(device.host_id);
      setScanSummary(result.scan_summary);
      setTimeout(() => setScanSummary(null), 8000);
    } catch (err) {
      alert(err.error || 'Scan failed');
    }
    setScanning(false);
  };
```

- [ ] **Step 2: Add Scan Ports button and summary to the JSX**

In the action buttons section (the `device-popover-actions` div), add the Scan Ports button right after the "View Details" button. Replace the entire actions div (lines 110-122) with:

```javascript
      <div className="device-popover-actions">
        {device.host_id && (
          <button className="btn btn-primary btn-sm" onClick={() => onSelectHost(device.host_id)}>View Details</button>
        )}
        {device.host_id && (
          <button className="btn btn-primary btn-sm" onClick={handleScanPorts} disabled={scanning}>
            {scanning ? 'Scanning...' : 'Scan Ports'}
          </button>
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
```

Add the scan summary display right before the actions div (before the `{/* Action buttons */}` comment):

```javascript
      {scanSummary && (
        <div style={{ padding: '6px 0', fontSize: '12px', color: 'var(--accent)' }}>
          Found {scanSummary.open} open — {scanSummary.new} new, {scanSummary.updated} updated
        </div>
      )}
```

- [ ] **Step 3: Verify the build works**

Run: `cd "/home/marty/Desktop/port tracker/client" && npx vite build`

Expected: Build succeeds with no errors

- [ ] **Step 4: Run all tests to verify nothing is broken**

Run: `cd "/home/marty/Desktop/port tracker" && npx vitest run`

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add client/src/components/DevicePopover.jsx
git commit -m "feat: add Scan Ports button to device popover for linked devices"
```
