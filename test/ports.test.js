import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './setup.js';

describe('Ports API', () => {
  let app, db, hostId;

  beforeEach(async () => {
    ({ app, db } = createTestApp());
    // Create a host for port tests
    const res = await request(app)
      .post('/api/hosts')
      .send({ name: 'web-server', ip_address: '192.168.1.10' });
    hostId = res.body.id;
  });

  describe('GET /api/hosts/:id/ports', () => {
    it('lists ports for a host', async () => {
      db.prepare('INSERT INTO ports (host_id, port_number, service_name, protocol, status) VALUES (?, ?, ?, ?, ?)').run(hostId, 80, 'HTTP', 'TCP', 'active');
      db.prepare('INSERT INTO ports (host_id, port_number, service_name, protocol, status) VALUES (?, ?, ?, ?, ?)').run(hostId, 443, 'HTTPS', 'TCP', 'active');

      const res = await request(app).get(`/api/hosts/${hostId}/ports`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].port_number).toBe(80);
    });

    it('filters by status', async () => {
      db.prepare('INSERT INTO ports (host_id, port_number, service_name, protocol, status) VALUES (?, ?, ?, ?, ?)').run(hostId, 80, 'HTTP', 'TCP', 'active');
      db.prepare('INSERT INTO ports (host_id, port_number, service_name, protocol, status) VALUES (?, ?, ?, ?, ?)').run(hostId, 8080, 'Old App', 'TCP', 'inactive');

      const res = await request(app).get(`/api/hosts/${hostId}/ports?status=active`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].service_name).toBe('HTTP');
    });

    it('filters by client', async () => {
      db.prepare('INSERT INTO ports (host_id, port_number, service_name, protocol, client) VALUES (?, ?, ?, ?, ?)').run(hostId, 80, 'HTTP', 'TCP', 'Acme Corp');
      db.prepare('INSERT INTO ports (host_id, port_number, service_name, protocol, client) VALUES (?, ?, ?, ?, ?)').run(hostId, 443, 'HTTPS', 'TCP', 'Beta Inc');

      const res = await request(app).get(`/api/hosts/${hostId}/ports?client=Acme Corp`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].client).toBe('Acme Corp');
    });
  });

  describe('POST /api/hosts/:id/ports', () => {
    it('creates a port with all fields', async () => {
      const res = await request(app)
        .post(`/api/hosts/${hostId}/ports`)
        .send({
          port_number: 80,
          service_name: 'HTTP',
          protocol: 'TCP',
          status: 'active',
          tags: ['web', 'public'],
          notes: 'Main web port',
          client: 'Acme Corp',
          domain: 'example.com',
          tunnel: 'cloudflare',
          tunnel_id: 'abc-123',
        });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id: expect.any(Number),
        host_id: hostId,
        port_number: 80,
        service_name: 'HTTP',
        protocol: 'TCP',
        status: 'active',
        tags: '["web","public"]',
        notes: 'Main web port',
        client: 'Acme Corp',
        domain: 'example.com',
        tunnel: 'cloudflare',
        tunnel_id: 'abc-123',
      });
    });

    it('creates a port range', async () => {
      const res = await request(app)
        .post(`/api/hosts/${hostId}/ports`)
        .send({
          port_number: 8000,
          port_end: 8010,
          service_name: 'App Range',
          protocol: 'TCP',
        });

      expect(res.status).toBe(201);
      expect(res.body.port_number).toBe(8000);
      expect(res.body.port_end).toBe(8010);
    });

    it('returns 400 when port_number is missing', async () => {
      const res = await request(app)
        .post(`/api/hosts/${hostId}/ports`)
        .send({ service_name: 'HTTP' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('returns 409 on conflict with existing service name', async () => {
      await request(app)
        .post(`/api/hosts/${hostId}/ports`)
        .send({ port_number: 80, service_name: 'HTTP', protocol: 'TCP' });

      const res = await request(app)
        .post(`/api/hosts/${hostId}/ports`)
        .send({ port_number: 80, service_name: 'Nginx', protocol: 'TCP' });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('HTTP');
    });

    it('allows same port on different protocols', async () => {
      await request(app)
        .post(`/api/hosts/${hostId}/ports`)
        .send({ port_number: 53, service_name: 'DNS-TCP', protocol: 'TCP' });

      const res = await request(app)
        .post(`/api/hosts/${hostId}/ports`)
        .send({ port_number: 53, service_name: 'DNS-UDP', protocol: 'UDP' });

      expect(res.status).toBe(201);
      expect(res.body.protocol).toBe('UDP');
    });
  });

  describe('PUT /api/ports/:id', () => {
    it('updates a port', async () => {
      const createRes = await request(app)
        .post(`/api/hosts/${hostId}/ports`)
        .send({ port_number: 80, service_name: 'HTTP', protocol: 'TCP' });

      const portId = createRes.body.id;
      const res = await request(app)
        .put(`/api/ports/${portId}`)
        .send({ service_name: 'Nginx', status: 'inactive' });

      expect(res.status).toBe(200);
      expect(res.body.service_name).toBe('Nginx');
      expect(res.body.status).toBe('inactive');
      expect(res.body.port_number).toBe(80);
    });
  });

  describe('DELETE /api/ports/:id', () => {
    it('deletes a port', async () => {
      const createRes = await request(app)
        .post(`/api/hosts/${hostId}/ports`)
        .send({ port_number: 80, service_name: 'HTTP', protocol: 'TCP' });

      const portId = createRes.body.id;
      const res = await request(app).delete(`/api/ports/${portId}`);

      expect(res.status).toBe(204);

      // Verify it's gone
      const ports = db.prepare('SELECT * FROM ports WHERE id = ?').all(portId);
      expect(ports).toHaveLength(0);
    });
  });
});
