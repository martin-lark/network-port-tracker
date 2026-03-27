# Port Tracker

A self-hosted web app for tracking ports, services, domains, and network topology across home lab hosts. Built for managing infrastructure where you need a clear picture of what's running where.

## What It Does

**Host Management** — Track servers, desktops, and other machines with their IPs, descriptions, and categorization. Each host has a port table showing all services running on it.

**Port Tracking** — Record open ports with service names, protocols, status (open/closed/filtered), descriptions, and Cloudflare tunnel configuration. Ports can be organized into categories (Web, Database, Media, Monitoring, Infrastructure, etc.) with collapsible group-by view. Custom categories can be added and removed.

**Port Scanning** — TCP connect scanning discovers open services on hosts automatically. Scan common ports (~150 curated home-lab services), well-known ports (1-1024), or all 65535 ports. Found ports are auto-created with best-guess service names.

**Network Map & Topology** — Visual network map built on React Flow showing all discovered and manually-added devices as draggable nodes. Features include:

- Network scanning via ARP + ping sweep to discover devices on your LAN
- Manual device creation for infrastructure that doesn't respond to scans (unmanaged switches, etc.)
- Device categories: server, desktop, mobile, IoT, network, router, switch, access point, firewall
- Drag-to-connect devices with typed connections (ethernet, wifi, tunnel, fiber, USB)
- Visual line styles per connection type (solid, dashed, dotted with distinct colors)
- Connection popover for editing labels, speed, and notes on each link
- Positions saved per device — drag once, stays where you put it
- Clean scan to remove stale devices that have left the network
- Docker IP filtering toggle to hide container bridge addresses

**Notes** — Freeform notes that can be global or linked to a specific host. Useful for documenting setup procedures, known issues, or configuration details.

**Search** — Global search across hosts, ports, domains, client descriptions, and notes.

**Export** — Export data as Markdown, CSV, or plain text. Filter by scope (all hosts or specific host) and client.

## Tech Stack

- **Backend:** Node.js, Express, better-sqlite3
- **Frontend:** React (plain JS, no TypeScript), Vite
- **Network Map:** React Flow (@xyflow/react)
- **Testing:** vitest, supertest
- **Deployment:** Docker (multi-stage build)

## Deployment

### Docker (recommended)

```bash
git clone <repo-url> port-tracker
cd port-tracker
docker compose up -d --build
```

The app will be available at `http://localhost:3000`.

**Important:** The container uses `network_mode: host` so that network scanning (ARP + ping sweep) can reach devices on your LAN. This means the container shares the host's network stack directly.

Data is persisted in a Docker volume (`port-tracker-data`). The SQLite database is stored at `/app/data/port-tracker.db` inside the container.

#### Configuration

| Environment Variable | Default      | Description                                      |
| -------------------- | ------------ | ------------------------------------------------ |
| `PORT`               | `3000`       | Port the server listens on                       |
| `DATA_DIR`           | `/app/data`  | Directory for the SQLite database file           |
| `NODE_ENV`           | `production` | Set to `production` to serve the built React SPA |

To change the port:

```yaml
# docker-compose.yml
environment:
  - PORT=8080
```

### Manual (without Docker)

Requires Node.js 20+.

```bash
# Install dependencies
npm install
cd client && npm install && cd ..

# Build the frontend
npm run client:build

# Start the server
npm start
```

The database is created automatically on first run at `./data/port-tracker.db`.

### Development

```bash
# Terminal 1: API server (port 3000)
npm run dev

# Terminal 2: Vite dev server with HMR (port 5173)
npm run client:dev
```

The Vite dev server proxies `/api` requests to the Express server.

## Testing

```bash
npm test            # Run all tests once
npm run test:watch  # Watch mode
```

105 tests covering all API endpoints: hosts, ports, notes, search, export, devices, connections, port scanning, network scanner, and categories.

## Project Structure

```
├── server/
│   ├── index.js              # Express app, route mounting, static serving
│   ├── db.js                 # SQLite schema, migrations, seed data
│   ├── scanner.js            # Network scanner (ARP + ping sweep)
│   ├── port-scanner.js       # TCP port scanner
│   └── routes/
│       ├── hosts.js          # Hosts CRUD
│       ├── ports.js          # Ports CRUD + port scan endpoint
│       ├── notes.js          # Notes CRUD
│       ├── devices.js        # Devices CRUD + network scan endpoints
│       ├── connections.js    # Connections CRUD (topology links)
│       ├── categories.js     # Port categories CRUD
│       ├── search.js         # Global search
│       └── export.js         # Data export
├── client/
│   └── src/
│       ├── App.jsx           # Main app with sidebar + detail layout
│       ├── App.css           # Dark theme styles
│       ├── api.js            # API client functions
│       └── components/
│           ├── NetworkMap.jsx       # React Flow canvas + toolbar
│           ├── DeviceNode.jsx       # Custom node with category colors + handles
│           ├── DevicePopover.jsx    # Device info/edit popover
│           ├── ConnectionPopover.jsx # Connection edit popover
│           ├── ConnectionForm.jsx   # New connection type picker
│           ├── AddDeviceForm.jsx    # Manual device creation form
│           ├── HostDetail.jsx       # Host info + port table + scan
│           ├── PortTable.jsx        # Sortable port table with categories
│           ├── PortForm.jsx         # Add/edit port form
│           ├── HostForm.jsx         # Add/edit host form
│           ├── NotesList.jsx        # Notes list + form
│           ├── SearchResults.jsx    # Grouped search results
│           └── ExportPanel.jsx      # Export format/scope picker
├── test/                     # vitest + supertest API tests
├── Dockerfile                # Multi-stage build
└── docker-compose.yml        # Production deployment
```

## Network Scanning

The network scanner requires access to the host network to function. In Docker, this is handled by `network_mode: host`. Without Docker, the app needs to be run on a machine connected to the target LAN.

The scan process:

1. Reads the ARP table (`arp -a`)
2. Ping sweeps the local /24 subnet (batches of 50)
3. Reads ARP again to pick up new responses
4. Reverse DNS lookups for hostnames
5. Updates the database with discovered devices
6. Auto-links devices to hosts by matching IP addresses

Docker bridge interfaces (`br-*`, `docker0`, `veth*`) are automatically excluded from subnet detection to avoid scanning container networks.
