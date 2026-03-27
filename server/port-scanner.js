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
  if (spec === undefined || spec === null || spec === 'common') {
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

  if (ports.length > 10000) {
    throw new Error(`Too many ports (${ports.length}). Maximum is 10,000 per scan.`);
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
