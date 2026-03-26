# Port Tracker — Design Spec

**For:** Lark Digital Studio
**Purpose:** Self-hosted web app to track ports, services, domains, and Cloudflare tunnels across home lab hosts.

## Context

Lark Digital Studio hosts many client websites on a home lab using Docker containers served via Cloudflare tunnels. There is no centralized way to track which ports are in use, which domains point where, or which client owns what. This tool provides a single dashboard to manage that information and export it when needed.

## Tech Stack

- **Backend:** Node.js + Express + SQLite (better-sqlite3)
- **Frontend:** React (plain JS, no TypeScript) + Vite
- **Deployment:** Single Docker container, SQLite persisted via Docker volume
- **No auth** — single-user internal tool

## Data Model

### Host
| Field       | Type    | Notes                                      |
|-------------|---------|-------------------------------------------|
| id          | INTEGER | Primary key, auto-increment               |
| name        | TEXT    | Required, unique. e.g., "proxmox-01"      |
| ip_address  | TEXT    | Required. e.g., "192.168.1.10"            |
| os          | TEXT    | Nullable. e.g., "Ubuntu 22.04", "Proxmox" |
| type        | TEXT    | "physical", "vm", "container", "other"    |
| description | TEXT    | Nullable free text                        |
| created_at  | TEXT    | ISO 8601 timestamp                        |
| updated_at  | TEXT    | ISO 8601 timestamp                        |

### Port
| Field        | Type    | Notes                                          |
|--------------|---------|------------------------------------------------|
| id           | INTEGER | Primary key, auto-increment                   |
| host_id      | INTEGER | FK → Host.id, CASCADE delete                  |
| port_number  | INTEGER | Required, 1-65535                              |
| port_end     | INTEGER | Nullable. If set, entry is a range (port_number–port_end) |
| service_name | TEXT    | Required. e.g., "Nginx", "Portainer"           |
| protocol     | TEXT    | "TCP" or "UDP", default "TCP"                  |
| status       | TEXT    | "active" or "inactive", default "active"       |
| tags         | TEXT    | JSON array stored as text. e.g., '["web","proxy"]' |
| notes        | TEXT    | Nullable free text                             |
| client       | TEXT    | Nullable. Client or project name               |
| domain       | TEXT    | Nullable. Public domain served. e.g., "example.com" |
| tunnel       | TEXT    | Nullable. Tunnel type, e.g., "cloudflare"      |
| tunnel_id    | TEXT    | Nullable. CF tunnel ID/name for reference       |
| created_at   | TEXT    | ISO 8601 timestamp                             |
| updated_at   | TEXT    | ISO 8601 timestamp                             |

**Constraint:** Unique (host_id, port_number, protocol) — enforces port conflict detection.

### Note
| Field      | Type    | Notes                                    |
|------------|---------|------------------------------------------|
| id         | INTEGER | Primary key, auto-increment             |
| host_id    | INTEGER | Nullable FK → Host.id. Null = global note |
| title      | TEXT    | Required                                 |
| content    | TEXT    | Required, free text                      |
| created_at | TEXT    | ISO 8601 timestamp                       |
| updated_at | TEXT    | ISO 8601 timestamp                       |

## API Endpoints

### Hosts
- `GET /api/hosts` — list all hosts (with port count)
- `POST /api/hosts` — create host
- `GET /api/hosts/:id` — get host with its ports and notes
- `PUT /api/hosts/:id` — update host
- `DELETE /api/hosts/:id` — delete host (cascades ports and linked notes)

### Ports
- `GET /api/hosts/:id/ports` — list ports for a host (with optional filters: status, client, protocol)
- `POST /api/hosts/:id/ports` — create port (returns 409 on conflict)
- `PUT /api/ports/:id` — update port
- `DELETE /api/ports/:id` — delete port

### Notes
- `GET /api/notes` — list all notes (optional `?host_id=` filter)
- `POST /api/notes` — create note
- `PUT /api/notes/:id` — update note
- `DELETE /api/notes/:id` — delete note

### Search
- `GET /api/search?q=` — global search across hosts, ports, domains, clients, notes

### Export
- `GET /api/export?format=markdown|csv|text&host_id=optional&client=optional`
- Returns formatted text with Content-Type header matching format
- Includes hosts, ports, tunnel info, and notes

## Frontend

### Layout: Sidebar Navigation
- **Sidebar (left, ~240px):**
  - App title/logo: "Port Tracker"
  - Search bar (global search)
  - Host list with port counts, click to select
  - "Add Host" button
  - Divider
  - "Notes" link (shows all notes view)
- **Main area (right):**
  - When a host is selected: host details header + port table + linked notes
  - When Notes is selected: notes list with create/edit/delete
  - When search is active: search results across all entities

### Port Table
- Columns: Port, Service, Protocol, Status, Client, Domain, Tunnel, Tags, Notes
- Inline status toggle (active/inactive)
- Edit and delete actions per row
- "Add Port" button above table
- Sort by any column

### Forms (Modal Dialogs)
- **Add/Edit Host:** name, IP, OS, type, description
- **Add/Edit Port:** port number, port end (optional range), service name, protocol, status, tags, notes, client, domain, tunnel type, tunnel ID
- **Add/Edit Note:** title, content, optional host link (dropdown)

### Export Panel
- Triggered by "Export" button in host header or global export
- Pick format: Markdown, CSV, Plain Text
- Pick scope: current host, specific client, or all
- Preview area showing formatted output
- "Copy to Clipboard" button

### Theme
- Dark theme (dark navy/charcoal backgrounds, high-contrast text)
- Accent color for interactive elements
- Clean, functional design appropriate for an internal tool

## Port Conflict Detection
- Database enforces unique constraint on (host_id, port_number, protocol)
- API returns 409 with a clear error message when conflict is detected
- Frontend shows the conflict inline in the form (which service already uses that port)

## Export Format Examples

### Markdown
```
## proxmox-01 (192.168.1.10)
| Port | Service | Protocol | Status | Client | Domain | Tunnel |
|------|---------|----------|--------|--------|--------|--------|
| 8006 | Proxmox UI | TCP | Active | — | — | — |
| 22 | SSH | TCP | Active | — | — | — |
```

### CSV
```
Host,IP,Port,Service,Protocol,Status,Client,Domain,Tunnel
proxmox-01,192.168.1.10,8006,Proxmox UI,TCP,Active,,,
proxmox-01,192.168.1.10,22,SSH,TCP,Active,,,
```

### Plain Text
```
proxmox-01 (192.168.1.10)
  :8006  Proxmox UI      TCP  Active
  :22    SSH              TCP  Active
```

## Docker Deployment

Single `Dockerfile` with multi-stage build:
1. Stage 1: Build React frontend with Vite
2. Stage 2: Node.js runtime serving Express API + static frontend files

`docker-compose.yml` maps port and mounts a volume for SQLite persistence:
```yaml
services:
  port-tracker:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - port-tracker-data:/app/data
volumes:
  port-tracker-data:
```

## Verification Plan
1. Run `docker-compose up --build` and verify app loads at localhost:3000
2. Add a host, verify it appears in sidebar
3. Add ports to the host, verify table renders correctly
4. Add a port that conflicts — verify 409 error and inline message
5. Add client and domain fields to a port, verify search finds them
6. Create global and host-linked notes, verify they appear correctly
7. Export in all 3 formats, verify output is correct and copy-to-clipboard works
8. Delete a host, verify cascade removes its ports and linked notes
