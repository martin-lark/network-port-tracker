# Port Scanning Design

## Goal

Add the ability to scan a host's ports via TCP connect to auto-discover open services, create or update port entries, and mark closed ports as inactive.

## Architecture

Synchronous TCP connect scanning using Node.js `net.Socket`, executed inline during the API request. Batched concurrency (50 at a time) keeps scan time to 2-5 seconds for the default curated port list. Custom ranges and full-range scans are supported but take longer.

This mirrors the existing network scan pattern (`POST /api/devices/scan`) — simple, no background jobs or WebSockets needed.

## Tech

- Node.js `net.Socket` for TCP connect probes
- Express endpoint on existing ports router
- Same React UI patterns (buttons, loading states, summary display)

---

## Backend

### New Module: `server/port-scanner.js`

**`scanPort(host, port, timeout = 1500)`**
Opens a TCP socket to `host:port`. Resolves `{ port, open: true }` on connect, `{ port, open: false }` on timeout/error. Socket is destroyed immediately after result.

**`scanPorts(host, ports, concurrency = 50)`**
Scans a list of port numbers in batches of `concurrency`. Returns array of results for open ports only (closed ports are filtered out).

**`COMMON_PORTS`**
A `Map<number, string>` of ~150 curated port-to-service-name mappings focused on home lab use cases:
- Infrastructure: 22 (SSH), 53 (DNS), 67-68 (DHCP), 80 (HTTP), 443 (HTTPS)
- Databases: 3306 (MySQL), 5432 (PostgreSQL), 6379 (Redis), 27017 (MongoDB)
- Containers/orchestration: 2375-2376 (Docker), 8443 (Kubernetes), 9000 (Portainer)
- Media: 8096 (Jellyfin), 32400 (Plex), 8989 (Sonarr), 7878 (Radarr)
- Home lab: 8080-8099 (various web UIs), 1883 (MQTT), 8123 (Home Assistant), 5000 (Synology/registry)
- Proxmox/virtualization: 8006 (Proxmox), 16509 (libvirt), 5900-5910 (VNC)
- Monitoring: 3000 (Grafana), 9090 (Prometheus), 9100 (Node Exporter)
- Networking: 51820 (WireGuard), 1194 (OpenVPN), 8291 (MikroTik)
- Other common: 21 (FTP), 25 (SMTP), 110 (POP3), 143 (IMAP), 445 (SMB), 631 (CUPS), 3389 (RDP)

**`getServiceName(port)`**
Returns the service name from `COMMON_PORTS` or `"unknown"` for unlisted ports.

**`parsePorts(spec)`**
Parses a port specification string into an array of port numbers:
- `"common"` or omitted → keys of `COMMON_PORTS`
- `"1-1024"` → range expansion
- `"80,443,8080"` → comma-separated list
- `"1-65535"` → full range
- Validates all numbers are 1-65535, throws on invalid input

### New API Endpoint: `POST /api/hosts/:id/scan`

Lives in `server/routes/ports.js` alongside existing port CRUD.

**Request body** (all fields optional):
```json
{ "ports": "common" }
```

`ports` accepts: `"common"` (default), a range like `"1-1024"`, a comma list like `"80,443,8080"`, or `"1-65535"`.

**Response:**
```json
{
  "scan_summary": {
    "host": "proxmox-01",
    "ip": "192.168.1.10",
    "scanned": 150,
    "open": 7,
    "new": 4,
    "updated": 3,
    "closed": 2
  },
  "open_ports": [
    { "port": 22, "service_name": "SSH", "is_new": true },
    { "port": 80, "service_name": "HTTP", "is_new": false }
  ]
}
```

**Logic:**
1. Look up host by ID (404 if not found)
2. Parse `ports` field into list of port numbers via `parsePorts()`
3. Scan all ports via `scanPorts(host.ip_address, portList)`
4. For each open port found:
   - If a matching `(host_id, port_number, protocol='TCP')` row exists → update `status = 'active'`, bump `updated_at` (count as "updated")
   - If no matching row → insert with `service_name` from `getServiceName()`, `protocol = 'TCP'`, `status = 'active'` (count as "new")
5. For ports in the scanned range that were found closed (not all ports for the host — only those whose port number was included in the scan):
   - If a matching row exists with `status = 'active'` → update `status = 'inactive'`, bump `updated_at` (count as "closed")
   - If no matching row → skip (don't create entries for closed ports)
6. Return summary and open port details

**Error handling:**
- 404 if host not found
- 400 if port spec is invalid (non-numeric, out of range)
- 500 if scan fails (network error)

**Timeout:** Endpoint-level timeout of 5 minutes to accommodate full-range scans. Express default is fine for common port scans (~5 seconds).

### Database Changes

None. Uses existing `ports` table as-is. Scanned ports are regular port entries with `protocol = 'TCP'` and `status = 'active'` or `'inactive'`.

---

## Frontend

### Host Detail View (`HostDetail.jsx`)

**Scan Ports button** in the header actions bar, next to "+ Add Port".

Clicking the button opens a small dropdown with:
- **Common Ports** (default) — scans the curated ~150 port list
- **Custom Range** — text input for a port spec (e.g., "1-1024" or "80,443,8080")

While scanning: button shows "Scanning..." and is disabled.

After scan completes: a summary line appears below the toolbar ("Found 7 open — 4 new, 3 updated, 2 closed") that auto-dismisses after 8 seconds. The port table refreshes to show new/updated entries.

### Device Popover (`DevicePopover.jsx`)

**Scan Ports button** in the action buttons row, visible only when the device is linked to a host.

Triggers the same `POST /api/hosts/:id/scan` using the device's `host_id`. Same scanning/summary UX as the host detail view, displayed inline in the popover.

### API Client (`client/src/api.js`)

New function:
```javascript
export const scanHostPorts = (hostId, ports = 'common') =>
  request(`/hosts/${hostId}/scan`, { method: 'POST', body: JSON.stringify({ ports }) });
```

---

## Testing

### Unit Tests (`test/port-scanner.test.js`)
- `parsePorts("common")` returns expected count (~150)
- `parsePorts("80,443")` returns `[80, 443]`
- `parsePorts("1-10")` returns `[1, 2, ..., 10]`
- `parsePorts("invalid")` throws
- `parsePorts("0")` and `parsePorts("99999")` throw (out of range)
- `getServiceName(22)` returns `"SSH"`
- `getServiceName(59999)` returns `"unknown"`

### Integration Tests (`test/port-scan-api.test.js`)
- `POST /api/hosts/:id/scan` with valid host returns scan summary
- Creates new port entries for discovered open ports
- Updates existing port entries to active
- Marks previously active ports as inactive when found closed
- Returns 404 for nonexistent host
- Returns 400 for invalid port spec
- Custom port range works

Note: Integration tests will need to mock `scanPorts` since we can't guarantee any ports are open on the test machine. The mock returns a known set of "open" ports so we can verify the database logic.

---

## Scope Boundaries

**In scope:**
- TCP connect scanning only (no UDP, no SYN scan)
- Synchronous request/response (no background jobs)
- Auto-create/update port entries
- Mark closed ports as inactive
- Service name lookup from static table
- UI in host detail + device popover

**Out of scope:**
- Scheduled/recurring scans
- Banner grabbing or version detection
- UDP scanning
- Scan history/audit log
- Bulk scan all hosts at once
