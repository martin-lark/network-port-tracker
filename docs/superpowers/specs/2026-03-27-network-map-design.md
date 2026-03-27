# Network Map — Design Spec

**For:** Lark Digital Studio
**Purpose:** Add an interactive network map view to Port Tracker that visualizes all devices on the local network, with click-through to port/service details for tracked hosts.

## Context

Port Tracker already tracks hosts, ports, services, and Cloudflare tunnels. This feature adds a visual layer on top — a network map showing everything on the `192.168.1.0/24` subnet. Devices are discovered via network scan or added manually. Tracked hosts (with port data) link into the map automatically. The map is the visual front door; the existing host detail pages remain the place for detailed port management.

## Tech Additions

- **Visualization:** React Flow (interactive node graph library for React)
- **Scanning:** ARP table + ping sweep from Node.js (no external dependencies)
- **Docker:** `network_mode: host` to scan the real LAN instead of Docker bridge

## Data Model

### Device

| Field        | Type    | Notes                                                      |
|--------------|---------|------------------------------------------------------------|
| id           | INTEGER | Primary key, auto-increment                                |
| ip_address   | TEXT    | Required, unique                                           |
| mac_address  | TEXT    | Nullable. Discovered from ARP table                        |
| hostname     | TEXT    | Nullable. From reverse DNS or manually set                 |
| host_id      | INTEGER | Nullable FK → Host.id. Links device to a tracked host      |
| category     | TEXT    | "server", "desktop", "mobile", "iot", "network", "other". Default "other" |
| is_known     | INTEGER | 1 = manually added/labeled, 0 = scan-discovered only. Default 0 |
| last_seen    | TEXT    | ISO 8601 timestamp from most recent scan                   |
| x_position   | REAL    | Nullable. Saved map X coordinate. Null = auto-layout       |
| y_position   | REAL    | Nullable. Saved map Y coordinate                           |
| created_at   | TEXT    | ISO 8601 timestamp                                         |
| updated_at   | TEXT    | ISO 8601 timestamp                                         |

**Relationships:**
- `host_id` FK to hosts table with SET NULL on delete (deleting a host doesn't remove the device from the map)
- When a scanned device's IP matches an existing host's `ip_address`, the scan auto-links them by setting `host_id`

## API Endpoints

### Devices
- `GET /api/devices` — list all devices. Optional `?known_only=true` to filter to is_known=1 or has host_id
- `POST /api/devices` — manually add a device
- `PUT /api/devices/:id` — update device (hostname, category, host_id link, is_known)
- `DELETE /api/devices/:id` — remove device from map
- `PUT /api/devices/:id/position` — save x/y position (lightweight endpoint for drag-save)
- `POST /api/devices/scan` — trigger network scan, returns updated device list

### Scan Endpoint Detail

`POST /api/devices/scan` performs:

1. Detect local subnet from host network interfaces (find `192.168.x.x` interface, derive /24 CIDR)
2. Run `arp -a` to get currently known IP/MAC pairs
3. Ping sweep the subnet for anything ARP missed (parallel `ping -c 1 -W 1` in batches of 50)
4. Re-run `arp -a` to pick up newly responded MACs
5. Attempt reverse DNS lookup (`dns.reverse()`) on each discovered IP for hostname hint
6. For each discovered IP/MAC:
   - If device exists (match by IP) → update `mac_address`, `last_seen`, and `hostname` only if `is_known = 0` (preserves manually set names)
   - If new → insert with `is_known = 0`, `category = 'other'`
7. Auto-link: if device IP matches a host's `ip_address` and `host_id` is null, set `host_id`
8. Return full device list

**Response:** `{ devices: Device[], scan_summary: { total: number, new: number, updated: number } }`

## Frontend

### Map View

Accessed via "Network Map" nav item in the sidebar footer. New view mode `'map'` in App.jsx.

**Map Canvas (React Flow):**
- Force-directed auto-layout for nodes without saved positions
- Zoom, pan, and minimap controls
- Dragging a node triggers `PUT /api/devices/:id/position` to persist the layout
- Nodes with saved x/y positions use those instead of auto-layout

**Node Rendering:**
- Each node displays: IP address, hostname (or "Unknown"), category label
- Nodes linked to a tracked host (has `host_id`): accent-colored border, show host name + port count badge
- Unlinked/unknown devices: dimmed appearance, muted border
- Category indicated by color or small label on the node

**Node Categories and Colors:**
- server: accent color (red)
- desktop: blue
- mobile: green
- iot: yellow
- network: purple (routers, switches, APs)
- other: gray

**Toolbar (above map):**
- "Scan Network" button with loading spinner during scan
- Filter toggle: "Known only" (default on) / "Show all"
- Category filter dropdown
- Device count indicator

**Click Interaction — Popover:**
- Clicking a node shows a popover/panel with:
  - Hostname, IP, MAC address, category, last seen timestamp
  - If linked to host: port count, list of top 5 services (name + port), host status summary
  - Actions:
    - "View Details" → navigates to existing host detail page (if linked)
    - "Create Host" → opens host form pre-filled with IP/hostname, on save links the device
    - "Link to Host" → dropdown of existing unlinked hosts to connect
    - "Edit Device" → edit hostname, category
    - "Remove" → delete device from map
- Clicking the map background closes the popover

**Default Filtering:**
- On load, map shows only "known" devices (is_known = 1 OR host_id is not null)
- "Show all" toggle reveals all discovered devices
- Category dropdown filters within whichever visibility mode is active

### Sidebar Changes

- New "Network Map" item in sidebar footer, positioned between "Notes" and "+ Add Host"
- Active state styling matches existing nav items
- Clicking it sets view to `'map'`, clears host selection and search

### Linking Workflow

When clicking an unlinked device on the map:

1. **Create Host** — Opens the existing HostForm modal pre-filled with the device's IP and hostname. On save, the new host is created and the device's `host_id` is set to it. Device becomes `is_known = 1`.

2. **Link to Host** — Shows a dropdown of existing hosts that don't already have a linked device. Selecting one sets the device's `host_id`. Device becomes `is_known = 1`.

3. **Just label it** — Edit the device's hostname and category without creating a host record. Device becomes `is_known = 1`.

## Docker Changes

The container needs LAN access to scan the network. Update `docker-compose.yml`:

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

Changes from current config:
- `network_mode: host` replaces `ports: ["3000:3000"]` (host networking exposes the port directly)
- `PORT` set explicitly via environment

## What Stays Unchanged

- All existing host, port, note, search, and export functionality
- The sidebar host list and host detail pages
- The existing data model (hosts, ports, notes tables)
- Export formats and filtering

## Verification Plan

1. Start app, click "Network Map" in sidebar, verify empty map view loads
2. Click "Scan Network", verify devices are discovered and appear as nodes
3. Verify nodes auto-layout with force-directed positioning
4. Drag a node, reload page, verify position persists
5. Click a discovered device, verify popover with IP/MAC/hostname
6. Use "Create Host" from popover, verify host is created and device links to it
7. Click a linked host node, verify popover shows port count and services
8. Click "View Details", verify navigation to existing host detail page
9. Toggle "Show all" / "Known only", verify filtering works
10. Filter by category, verify nodes filter correctly
11. Manually add a device, verify it appears on map
12. Delete a device, verify it disappears from map
13. Rebuild Docker with `network_mode: host`, verify scan works on real LAN
