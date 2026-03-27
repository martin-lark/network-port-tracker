# Network Topology Tool — Design Spec

**Date:** 2026-03-28
**Goal:** Transform the existing network map into a proper topology tool where users can add infrastructure devices, create connections between devices, and visualize the physical/logical network layout.

---

## Overview

The network map currently displays discovered and manually-added devices as draggable nodes on a React Flow canvas. This feature adds:

1. **Infrastructure device categories** — router, switch, access point, firewall
2. **Manual "Add Device" button** — for devices that don't appear in network scans (unmanaged switches, etc.)
3. **Connections between devices** — stored in a new `connections` table, rendered as React Flow edges
4. **Drag-to-connect** — drag from one device's handle to another to create a connection
5. **Connection popover** — click a connection line to view/edit metadata (type, label, speed, notes)
6. **Visual line styles** — connection type determines line appearance (solid, dashed, dotted, thick)

## Data Model

### `connections` table

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| source_device_id | INTEGER FK | References devices(id), ON DELETE CASCADE |
| target_device_id | INTEGER FK | References devices(id), ON DELETE CASCADE |
| connection_type | TEXT | Default 'ethernet'. One of: ethernet, wifi, tunnel, fiber, usb |
| label | TEXT | Optional. e.g., "Port 3 → Port 7" |
| speed | TEXT | Optional. e.g., "1Gbps", "100Mbps" |
| notes | TEXT | Optional freeform |
| created_at | DATETIME | Default `datetime('now')` |
| updated_at | DATETIME | Default `datetime('now')` |

**Constraints:**
- UNIQUE on `(source_device_id, target_device_id)` — one connection per ordered pair
- API enforces no duplicates in either direction (A→B or B→A)
- API rejects self-connections (source = target)

### Device category expansion

The `category` TEXT field on the `devices` table already supports freeform values. New infrastructure categories are added to the UI dropdown only:

- `router`
- `switch`
- `access_point`
- `firewall`

These join the existing categories: `server`, `desktop`, `mobile`, `iot`, `network`, `other`.

No schema migration needed — the category field is freeform text.

## API Endpoints

### Connections CRUD — `/api/connections`

**GET `/api/connections`**
- Returns all connections with source/target device info via JOIN on devices table
- `source_name`/`target_name` derived from `COALESCE(d.hostname, d.ip_address)` — uses hostname if available, falls back to IP
- Response shape:
```json
[
  {
    "id": 1,
    "source_device_id": 3,
    "target_device_id": 7,
    "connection_type": "ethernet",
    "label": "Port 1 → Port 3",
    "speed": "1Gbps",
    "notes": null,
    "source_name": "Router",
    "source_ip": "192.168.1.1",
    "target_name": "Switch",
    "target_ip": "192.168.1.2",
    "created_at": "...",
    "updated_at": "..."
  }
]
```

**POST `/api/connections`**
- Body: `{ source_device_id, target_device_id, connection_type?, label?, speed?, notes? }`
- Returns 201 with created connection
- Returns 400 if `source_device_id === target_device_id`
- Returns 400 if either device ID doesn't exist
- Returns 409 if connection already exists between the pair in either direction
- Default `connection_type` is `'ethernet'`

**PUT `/api/connections/:id`**
- Body: any subset of `{ connection_type, label, speed, notes }`
- Returns updated connection
- Returns 404 if not found

**DELETE `/api/connections/:id`**
- Returns 204
- Returns 404 if not found

### No changes to existing APIs

The existing `POST /api/devices` endpoint already supports manual device creation with `is_known = 1`. The "Add Device" button calls this same endpoint.

## React Flow Integration

### Edge rendering

Connections are fetched alongside devices on map load and converted to React Flow edges:

```javascript
const edge = {
  id: `conn-${connection.id}`,
  source: String(connection.source_device_id),
  target: String(connection.target_device_id),
  type: 'default',
  style: EDGE_STYLES[connection.connection_type],
  data: { connection },
};
```

### Edge visual styles by connection type

| Type | Stroke | Dash | Width | Color |
|------|--------|------|-------|-------|
| ethernet | solid | none | 2px | `var(--accent)` |
| wifi | dashed | `5 5` | 2px | `var(--text-secondary)` |
| tunnel | dotted | `2 4` | 2px | `#f59e0b` (amber) |
| fiber | solid | none | 3px | `#10b981` (green) |
| usb | solid | none | 1.5px | `var(--text-tertiary)` |

Edges are undirected — no arrowheads. These represent physical/logical links, not data flow direction.

### Drag-to-connect

- DeviceNode Handle components (already present, currently hidden) become visible as small dots on node borders
- React Flow's `onConnect` callback fires when a user drags from one handle to another
- On connect: show a small ConnectionForm to pick connection type before saving
- Calls `POST /api/connections`, then refreshes edges

### Edge click → ConnectionPopover

- `onEdgeClick` handler sets `selectedConnection` state
- ConnectionPopover displays: connection type dropdown, label input, speed input, notes textarea, delete button
- Edits save via `PUT /api/connections/:id` on field change/blur
- Delete calls `DELETE /api/connections/:id` and removes the edge

## New Components

### `ConnectionPopover`
- Triggered by edge click
- Displays connection metadata fields (type, label, speed, notes)
- Inline editing — fields save on change
- Delete button with confirmation
- Close on clicking away (pane click)
- Positioned in the map overlay area (similar to DevicePopover placement)

### `ConnectionForm`
- Small inline form shown after drag-to-connect
- Fields: connection type dropdown (ethernet default), optional label
- Submit creates the connection, cancel aborts
- Minimal — just enough to classify the connection before saving

### `AddDeviceForm`
- Triggered by "Add Device" toolbar button
- Fields: hostname/name, IP address (optional — unmanaged switches may not have one), category dropdown (includes infrastructure types)
- Calls `POST /api/devices` with `is_known = 1`
- New device placed at center of current viewport
- Form closes on save

## UI Changes

### NetworkMap toolbar
- New "Add Device" button
- Category filter dropdown expanded with: `router`, `switch`, `access_point`, `firewall`
- `CATEGORIES` constant updated

### DeviceNode
- Handles become visible (small circles on node edges for drag-to-connect)
- New border colors for infrastructure categories:
  - `router` — blue
  - `switch` — teal
  - `access_point` — purple
  - `firewall` — red

### NetworkMap state additions
- `connections` state array (fetched from API)
- `edges` derived from connections with visual styles
- `selectedConnection` for connection popover
- `showAddDevice` for add device form
- `showConnectionForm` + `pendingConnection` for drag-to-connect flow

## Layout

**Manual only.** Users drag nodes wherever they want. Connections draw lines between nodes at their current positions. No auto-layout algorithms. Positions are already persisted via the existing `PUT /api/devices/:id/position` endpoint.

## Testing

- **Connection API tests:** CRUD operations, duplicate prevention (both directions), self-connection rejection, cascade delete when device removed
- **Unit tests:** Edge style mapping, connection form validation
- Existing device and scanner tests remain unchanged
