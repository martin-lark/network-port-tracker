import { Router } from 'express';

export const exportRouter = Router();

function formatPort(port) {
  return port.port_end ? `${port.port_number}-${port.port_end}` : `${port.port_number}`;
}

function getExportData(db, { host_id, client }) {
  let hosts;
  if (host_id) {
    hosts = db.prepare('SELECT * FROM hosts WHERE id = ?').all(host_id);
  } else {
    hosts = db.prepare('SELECT * FROM hosts ORDER BY name').all();
  }

  const data = [];
  for (const host of hosts) {
    let ports;
    if (client) {
      ports = db.prepare('SELECT * FROM ports WHERE host_id = ? AND client = ? ORDER BY port_number').all(host.id, client);
    } else {
      ports = db.prepare('SELECT * FROM ports WHERE host_id = ? ORDER BY port_number').all(host.id);
    }

    // When filtering by client, skip hosts with no matching ports
    if (client && ports.length === 0) continue;

    const notes = db.prepare('SELECT * FROM notes WHERE host_id = ? ORDER BY created_at DESC').all(host.id);
    data.push({ host, ports, notes });
  }

  return data;
}

function toMarkdown(data) {
  let md = '';
  for (const { host, ports, notes } of data) {
    md += `## ${host.name} (${host.ip_address})\n\n`;
    if (host.os) md += `**OS:** ${host.os}\n\n`;
    if (host.description) md += `${host.description}\n\n`;

    if (ports.length > 0) {
      md += '| Port | Service | Protocol | Status | Client | Domain |\n';
      md += '|------|---------|----------|--------|--------|--------|\n';
      for (const p of ports) {
        md += `| ${formatPort(p)} | ${p.service_name} | ${p.protocol} | ${p.status} | ${p.client || ''} | ${p.domain || ''} |\n`;
      }
      md += '\n';
    }

    if (notes.length > 0) {
      md += '### Notes\n\n';
      for (const n of notes) {
        md += `**${n.title}:** ${n.content}\n\n`;
      }
    }
  }
  return md;
}

function toCsv(data) {
  const rows = ['host,ip_address,port,service,protocol,status,client,domain'];
  for (const { host, ports } of data) {
    for (const p of ports) {
      const port = formatPort(p);
      rows.push(
        [host.name, host.ip_address, port, p.service_name, p.protocol, p.status, p.client || '', p.domain || '']
          .map(v => `"${String(v).replace(/"/g, '""')}"`)
          .join(',')
      );
    }
  }
  return rows.join('\n') + '\n';
}

function toText(data) {
  let text = '';
  for (const { host, ports, notes } of data) {
    text += `${host.name} (${host.ip_address})\n`;
    if (host.os) text += `  OS: ${host.os}\n`;
    if (host.description) text += `  ${host.description}\n`;

    for (const p of ports) {
      const port = formatPort(p);
      text += `  :${port} ${p.service_name} (${p.protocol}/${p.status})`;
      if (p.client) text += ` [${p.client}]`;
      if (p.domain) text += ` ${p.domain}`;
      text += '\n';
    }

    for (const n of notes) {
      text += `  Note: ${n.title} - ${n.content}\n`;
    }

    text += '\n';
  }
  return text;
}

// GET / — export data in markdown, csv, or text format
exportRouter.get('/', (req, res) => {
  const { format, host_id, client } = req.query;

  if (!format || !['markdown', 'csv', 'text'].includes(format)) {
    return res.status(400).json({ error: 'format must be one of: markdown, csv, text' });
  }

  const data = getExportData(req.db, { host_id, client });

  switch (format) {
    case 'markdown':
      res.set('Content-Type', 'text/markdown; charset=utf-8');
      return res.send(toMarkdown(data));
    case 'csv':
      res.set('Content-Type', 'text/csv; charset=utf-8');
      return res.send(toCsv(data));
    case 'text':
      res.set('Content-Type', 'text/plain; charset=utf-8');
      return res.send(toText(data));
  }
});
