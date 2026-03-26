import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './setup.js';

describe('Hosts API', () => {
  let app, db;

  beforeEach(() => {
    ({ app, db } = createTestApp());
  });

  describe('POST /api/hosts', () => {
    it('creates a host and returns 201', async () => {
      const res = await request(app)
        .post('/api/hosts')
        .send({ name: 'web-server', ip_address: '192.168.1.10', os: 'Ubuntu 22.04', type: 'vm', description: 'Main web server' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id: expect.any(Number),
        name: 'web-server',
        ip_address: '192.168.1.10',
        os: 'Ubuntu 22.04',
        type: 'vm',
        description: 'Main web server',
      });
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/hosts')
        .send({ ip_address: '192.168.1.10' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('returns 400 when ip_address is missing', async () => {
      const res = await request(app)
        .post('/api/hosts')
        .send({ name: 'web-server' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('returns 409 on duplicate name', async () => {
      await request(app)
        .post('/api/hosts')
        .send({ name: 'web-server', ip_address: '192.168.1.10' });

      const res = await request(app)
        .post('/api/hosts')
        .send({ name: 'web-server', ip_address: '192.168.1.11' });

      expect(res.status).toBe(409);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('GET /api/hosts', () => {
    it('returns empty list when no hosts exist', async () => {
      const res = await request(app).get('/api/hosts');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns hosts with port_count', async () => {
      // Create a host
      const hostRes = await request(app)
        .post('/api/hosts')
        .send({ name: 'web-server', ip_address: '192.168.1.10' });
      const hostId = hostRes.body.id;

      // Add ports directly to the db
      db.prepare('INSERT INTO ports (host_id, port_number, service_name, protocol) VALUES (?, ?, ?, ?)').run(hostId, 80, 'HTTP', 'TCP');
      db.prepare('INSERT INTO ports (host_id, port_number, service_name, protocol) VALUES (?, ?, ?, ?)').run(hostId, 443, 'HTTPS', 'TCP');

      const res = await request(app).get('/api/hosts');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].port_count).toBe(2);
      expect(res.body[0].name).toBe('web-server');
    });
  });

  describe('GET /api/hosts/:id', () => {
    it('returns host with ports and notes arrays', async () => {
      // Create a host
      const hostRes = await request(app)
        .post('/api/hosts')
        .send({ name: 'web-server', ip_address: '192.168.1.10' });
      const hostId = hostRes.body.id;

      // Add a port and a note directly
      db.prepare('INSERT INTO ports (host_id, port_number, service_name, protocol) VALUES (?, ?, ?, ?)').run(hostId, 80, 'HTTP', 'TCP');
      db.prepare('INSERT INTO notes (host_id, title, content) VALUES (?, ?, ?)').run(hostId, 'Setup Notes', 'Installed nginx');

      const res = await request(app).get(`/api/hosts/${hostId}`);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('web-server');
      expect(res.body.ports).toHaveLength(1);
      expect(res.body.ports[0].service_name).toBe('HTTP');
      expect(res.body.notes).toHaveLength(1);
      expect(res.body.notes[0].title).toBe('Setup Notes');
    });

    it('returns 404 for missing host', async () => {
      const res = await request(app).get('/api/hosts/9999');

      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('PUT /api/hosts/:id', () => {
    it('updates a host', async () => {
      const hostRes = await request(app)
        .post('/api/hosts')
        .send({ name: 'web-server', ip_address: '192.168.1.10' });
      const hostId = hostRes.body.id;

      const res = await request(app)
        .put(`/api/hosts/${hostId}`)
        .send({ ip_address: '192.168.1.20', os: 'Debian 12' });

      expect(res.status).toBe(200);
      expect(res.body.ip_address).toBe('192.168.1.20');
      expect(res.body.os).toBe('Debian 12');
      expect(res.body.name).toBe('web-server');
    });
  });

  describe('DELETE /api/hosts/:id', () => {
    it('deletes host and cascades to ports and notes', async () => {
      const hostRes = await request(app)
        .post('/api/hosts')
        .send({ name: 'web-server', ip_address: '192.168.1.10' });
      const hostId = hostRes.body.id;

      // Add port and note
      db.prepare('INSERT INTO ports (host_id, port_number, service_name, protocol) VALUES (?, ?, ?, ?)').run(hostId, 80, 'HTTP', 'TCP');
      db.prepare('INSERT INTO notes (host_id, title, content) VALUES (?, ?, ?)').run(hostId, 'Note', 'Content');

      const res = await request(app).delete(`/api/hosts/${hostId}`);
      expect(res.status).toBe(204);

      // Verify cascade
      const ports = db.prepare('SELECT * FROM ports WHERE host_id = ?').all(hostId);
      const notes = db.prepare('SELECT * FROM notes WHERE host_id = ?').all(hostId);
      expect(ports).toHaveLength(0);
      expect(notes).toHaveLength(0);

      // Verify host is gone
      const getRes = await request(app).get(`/api/hosts/${hostId}`);
      expect(getRes.status).toBe(404);
    });
  });
});
