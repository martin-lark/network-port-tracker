import { Router } from 'express';

export const portsRouter = Router();

// GET /hosts/:id/ports — list ports for a host with optional filters
portsRouter.get('/hosts/:id/ports', (req, res) => {
  const { status, client, protocol } = req.query;
  let sql = 'SELECT * FROM ports WHERE host_id = ?';
  const params = [req.params.id];

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (client) {
    sql += ' AND client = ?';
    params.push(client);
  }
  if (protocol) {
    sql += ' AND protocol = ?';
    params.push(protocol);
  }

  sql += ' ORDER BY port_number';
  const ports = req.db.prepare(sql).all(...params);
  res.json(ports);
});

// POST /hosts/:id/ports — create a port
portsRouter.post('/hosts/:id/ports', (req, res) => {
  const host_id = req.params.id;
  const {
    port_number, port_end, service_name, protocol,
    status, tags, notes, client, domain, tunnel, tunnel_id,
  } = req.body;

  if (!port_number || !service_name) {
    return res.status(400).json({ error: 'port_number and service_name are required' });
  }

  try {
    const result = req.db.prepare(`
      INSERT INTO ports (host_id, port_number, port_end, service_name, protocol, status, tags, notes, client, domain, tunnel, tunnel_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      host_id,
      port_number,
      port_end || null,
      service_name,
      protocol || 'TCP',
      status || 'active',
      JSON.stringify(tags || []),
      notes || null,
      client || null,
      domain || null,
      tunnel || null,
      tunnel_id || null,
    );

    const port = req.db.prepare('SELECT * FROM ports WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(port);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      // Look up the existing port to include its service name in the error
      const existing = req.db.prepare(
        'SELECT service_name FROM ports WHERE host_id = ? AND port_number = ? AND protocol = ?'
      ).get(host_id, port_number, protocol || 'TCP');
      const existingName = existing ? existing.service_name : 'unknown';
      return res.status(409).json({
        error: `Port ${port_number}/${protocol || 'TCP'} is already assigned to ${existingName}`,
      });
    }
    throw err;
  }
});

// PUT /ports/:id — update a port
portsRouter.put('/ports/:id', (req, res) => {
  const existing = req.db.prepare('SELECT * FROM ports WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Port not found' });
  }

  const {
    port_number, port_end, service_name, protocol,
    status, tags, notes, client, domain, tunnel, tunnel_id,
  } = { ...existing, ...req.body };

  const tagsStr = typeof tags === 'string' ? tags : JSON.stringify(tags || []);

  req.db.prepare(`
    UPDATE ports SET port_number = ?, port_end = ?, service_name = ?, protocol = ?,
      status = ?, tags = ?, notes = ?, client = ?, domain = ?, tunnel = ?, tunnel_id = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    port_number, port_end, service_name, protocol,
    status, tagsStr, notes, client, domain, tunnel, tunnel_id,
    req.params.id,
  );

  const port = req.db.prepare('SELECT * FROM ports WHERE id = ?').get(req.params.id);
  res.json(port);
});

// DELETE /ports/:id — delete a port
portsRouter.delete('/ports/:id', (req, res) => {
  const result = req.db.prepare('DELETE FROM ports WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Port not found' });
  }
  res.status(204).end();
});
