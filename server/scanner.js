import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { networkInterfaces } from 'os';
import dns from 'dns';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
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
// Skips Docker bridge interfaces (br-*, docker0, veth*) to avoid scanning container networks.
// Returns { subnet, localIp, localMac } or null.
export function getLocalSubnet() {
  const ifaces = networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    if (name.startsWith('br-') || name === 'docker0' || name.startsWith('veth')) continue;
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const parts = iface.address.split('.');
        if (parts[0] === '192' || parts[0] === '10' || (parts[0] === '172' && Number(parts[1]) >= 16 && Number(parts[1]) <= 31)) {
          return { subnet: parts.slice(0, 3).join('.'), localIp: iface.address, localMac: iface.mac };
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
// Uses execFile (not exec) to avoid shell injection — IP is passed as an argument, not interpolated.
async function pingHost(ip) {
  try {
    await execFileAsync('ping', ['-c', '1', '-W', '1', ip], { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

// Run a full network scan: ARP, ping sweep, ARP again, DNS lookups.
// Updates the database with discovered devices.
// Returns { devices, scan_summary }.
export async function scanNetwork(db) {
  const localInfo = getLocalSubnet();
  if (!localInfo) {
    throw new Error('Could not detect local subnet. Make sure the container has host network access.');
  }
  const { subnet, localIp, localMac } = localInfo;

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
  // Filter out Docker bridge IPs (172.x.x.x on br-* interfaces)
  const deviceMap = new Map();
  for (const entry of [...initialArp, ...finalArp]) {
    const parts = entry.ip.split('.');
    // Skip if it doesn't match our LAN subnet
    if (parts.slice(0, 3).join('.') !== subnet) continue;
    deviceMap.set(entry.ip, entry.mac);
  }

  // Include the local machine (can't ARP yourself)
  if (localIp && !deviceMap.has(localIp)) {
    deviceMap.set(localIp, localMac || 'unknown');
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
