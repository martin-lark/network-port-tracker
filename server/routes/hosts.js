import { Router } from 'express';

export const hostsRouter = Router();

// GET / — list all hosts with port counts
hostsRouter.get('/', (req, res) => {
  const hosts = req.db.prepare(`
    SELECT h.*, COUNT(p.id) AS port_count
    FROM hosts h
    LEFT JOIN ports p ON p.host_id = h.id
    GROUP BY h.id
    ORDER BY h.name
  `).all();
  res.json(hosts);
});

// POST / — create a host
hostsRouter.post('/', (req, res) => {
  const { name, ip_address, os, type, description } = req.body;

  if (!name || !ip_address) {
    return res.status(400).json({ error: 'name and ip_address are required' });
  }

  try {
    const result = req.db.prepare(
      'INSERT INTO hosts (name, ip_address, os, type, description) VALUES (?, ?, ?, ?, ?)'
    ).run(name, ip_address, os || null, type || 'other', description || null);

    const host = req.db.prepare('SELECT * FROM hosts WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(host);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: `Host with name '${name}' already exists` });
    }
    throw err;
  }
});

// GET /:id — get host with ports and notes
hostsRouter.get('/:id', (req, res) => {
  const host = req.db.prepare('SELECT * FROM hosts WHERE id = ?').get(req.params.id);
  if (!host) {
    return res.status(404).json({ error: 'Host not found' });
  }

  const ports = req.db.prepare('SELECT * FROM ports WHERE host_id = ? ORDER BY port_number').all(req.params.id);
  const notes = req.db.prepare('SELECT * FROM notes WHERE host_id = ? ORDER BY created_at DESC').all(req.params.id);

  res.json({ ...host, ports, notes });
});

// PUT /:id — update a host
hostsRouter.put('/:id', (req, res) => {
  const existing = req.db.prepare('SELECT * FROM hosts WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Host not found' });
  }

  // Merge existing data with request body to support partial updates
  const { name, ip_address, os, type, description } = { ...existing, ...req.body };

  req.db.prepare(
    `UPDATE hosts SET name = ?, ip_address = ?, os = ?, type = ?, description = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(name, ip_address, os, type, description, req.params.id);

  const host = req.db.prepare('SELECT * FROM hosts WHERE id = ?').get(req.params.id);
  res.json(host);
});

// DELETE /:id — delete a host (FK cascade handles ports/notes)
hostsRouter.delete('/:id', (req, res) => {
  const result = req.db.prepare('DELETE FROM hosts WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Host not found' });
  }
  res.status(204).end();
});
