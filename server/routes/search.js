import { Router } from 'express';

export const searchRouter = Router();

// GET / — search across hosts, ports, and notes
searchRouter.get('/', (req, res) => {
  const { q } = req.query;

  if (!q) {
    return res.status(400).json({ error: 'q query parameter is required' });
  }

  const pattern = `%${q}%`;

  const hosts = req.db.prepare(`
    SELECT * FROM hosts
    WHERE name LIKE ? OR ip_address LIKE ? OR os LIKE ? OR description LIKE ?
  `).all(pattern, pattern, pattern, pattern);

  const ports = req.db.prepare(`
    SELECT p.*, h.name AS host_name, h.ip_address AS host_ip
    FROM ports p
    JOIN hosts h ON h.id = p.host_id
    WHERE p.service_name LIKE ?
      OR p.notes LIKE ?
      OR p.client LIKE ?
      OR p.domain LIKE ?
      OR p.tunnel_id LIKE ?
      OR CAST(p.port_number AS TEXT) LIKE ?
  `).all(pattern, pattern, pattern, pattern, pattern, pattern);

  const notes = req.db.prepare(`
    SELECT * FROM notes
    WHERE title LIKE ? OR content LIKE ?
  `).all(pattern, pattern);

  res.json({ hosts, ports, notes });
});
