import { Router } from 'express';

export const connectionsRouter = Router();

// GET / — list all connections with source/target device names and IPs.
// Uses COALESCE to prefer hostname over raw IP for display names.
connectionsRouter.get('/', (req, res) => {
  const connections = req.db.prepare(`
    SELECT c.*,
      COALESCE(sd.hostname, sd.ip_address) AS source_name, sd.ip_address AS source_ip,
      COALESCE(td.hostname, td.ip_address) AS target_name, td.ip_address AS target_ip
    FROM connections c
    JOIN devices sd ON sd.id = c.source_device_id
    JOIN devices td ON td.id = c.target_device_id
    ORDER BY c.id
  `).all();
  res.json(connections);
});

// POST / — create a connection between two devices.
// Rejects self-connections, verifies both devices exist, and prevents
// duplicates in either direction (A→B is the same link as B→A).
connectionsRouter.post('/', (req, res) => {
  const { source_device_id, target_device_id, connection_type, label, speed, notes } = req.body;

  if (source_device_id === target_device_id) {
    return res.status(400).json({ error: 'Cannot create a self-connection' });
  }

  const source = req.db.prepare('SELECT id FROM devices WHERE id = ?').get(source_device_id);
  const target = req.db.prepare('SELECT id FROM devices WHERE id = ?').get(target_device_id);
  if (!source || !target) {
    return res.status(400).json({ error: 'Device not found' });
  }

  // Check both directions — connections are undirected (A→B and B→A are the same link)
  const existing = req.db.prepare(
    'SELECT id FROM connections WHERE (source_device_id = ? AND target_device_id = ?) OR (source_device_id = ? AND target_device_id = ?)'
  ).get(source_device_id, target_device_id, target_device_id, source_device_id);
  if (existing) {
    return res.status(409).json({ error: 'Connection already exists between these devices' });
  }

  const result = req.db.prepare(
    'INSERT INTO connections (source_device_id, target_device_id, connection_type, label, speed, notes) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(source_device_id, target_device_id, connection_type || 'ethernet', label || null, speed || null, notes || null);

  const connection = req.db.prepare('SELECT * FROM connections WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(connection);
});

// PUT /:id — update connection metadata (type, label, speed, notes).
// Merges request body with existing values so partial updates work.
connectionsRouter.put('/:id', (req, res) => {
  const existing = req.db.prepare('SELECT * FROM connections WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Connection not found' });
  }

  const { connection_type, label, speed, notes } = { ...existing, ...req.body };
  req.db.prepare(`
    UPDATE connections SET connection_type = ?, label = ?, speed = ?, notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(connection_type, label, speed, notes, req.params.id);

  const connection = req.db.prepare('SELECT * FROM connections WHERE id = ?').get(req.params.id);
  res.json(connection);
});

// DELETE /:id — remove a connection between devices.
connectionsRouter.delete('/:id', (req, res) => {
  const result = req.db.prepare('DELETE FROM connections WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Connection not found' });
  }
  res.status(204).end();
});
