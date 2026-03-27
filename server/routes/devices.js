import { Router } from 'express';

export const devicesRouter = Router();

// GET / — list all devices, optionally filtered to known-only.
// Includes host_name and port_count via LEFT JOIN for linked devices.
devicesRouter.get('/', (req, res) => {
  const knownOnly = req.query.known_only === 'true';
  let sql = `
    SELECT d.*, h.name AS host_name, COUNT(p.id) AS port_count
    FROM devices d
    LEFT JOIN hosts h ON h.id = d.host_id
    LEFT JOIN ports p ON p.host_id = d.host_id
  `;
  if (knownOnly) sql += ' WHERE d.is_known = 1 OR d.host_id IS NOT NULL';
  sql += ' GROUP BY d.id ORDER BY d.ip_address';
  res.json(req.db.prepare(sql).all());
});

// POST / — manually add a device (always marked as known)
devicesRouter.post('/', (req, res) => {
  const { ip_address, mac_address, hostname, host_id, category } = req.body;
  if (!ip_address) {
    return res.status(400).json({ error: 'ip_address is required' });
  }
  try {
    const result = req.db.prepare(
      'INSERT INTO devices (ip_address, mac_address, hostname, host_id, category, is_known) VALUES (?, ?, ?, ?, ?, 1)'
    ).run(ip_address, mac_address || null, hostname || null, host_id || null, category || 'other');
    const device = req.db.prepare('SELECT * FROM devices WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(device);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: `Device with IP ${ip_address} already exists` });
    }
    throw err;
  }
});

// PUT /:id — update a device (sets is_known = 1 since user is actively editing)
devicesRouter.put('/:id', (req, res) => {
  const existing = req.db.prepare('SELECT * FROM devices WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Device not found' });
  }
  const { ip_address, mac_address, hostname, host_id, category } = { ...existing, ...req.body };
  req.db.prepare(`
    UPDATE devices SET ip_address = ?, mac_address = ?, hostname = ?, host_id = ?,
      category = ?, is_known = 1, updated_at = datetime('now')
    WHERE id = ?
  `).run(ip_address, mac_address, hostname, host_id, category, req.params.id);
  const device = req.db.prepare('SELECT * FROM devices WHERE id = ?').get(req.params.id);
  res.json(device);
});

// PUT /:id/position — save map position (lightweight, doesn't change is_known)
devicesRouter.put('/:id/position', (req, res) => {
  const existing = req.db.prepare('SELECT * FROM devices WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Device not found' });
  }
  const { x, y } = req.body;
  req.db.prepare('UPDATE devices SET x_position = ?, y_position = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(x, y, req.params.id);
  const device = req.db.prepare('SELECT * FROM devices WHERE id = ?').get(req.params.id);
  res.json(device);
});

// DELETE /:id — remove device from map
devicesRouter.delete('/:id', (req, res) => {
  const result = req.db.prepare('DELETE FROM devices WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Device not found' });
  }
  res.status(204).end();
});
