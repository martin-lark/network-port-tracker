import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './setup.js';

describe('Search API', () => {
  let app, db, hostId;

  beforeEach(async () => {
    ({ app, db } = createTestApp());

    // Seed data
    const hostRes = await request(app)
      .post('/api/hosts')
      .send({ name: 'web-server', ip_address: '192.168.1.10', os: 'Ubuntu', description: 'Main production server' });
    hostId = hostRes.body.id;

    const host2Res = await request(app)
      .post('/api/hosts')
      .send({ name: 'db-server', ip_address: '192.168.1.20', os: 'Debian' });

    // Add ports
    await request(app).post(`/api/hosts/${hostId}/ports`).send({
      port_number: 80, service_name: 'Nginx', protocol: 'TCP',
      client: 'Acme Corp', domain: 'example.com', notes: 'Public web',
    });
    await request(app).post(`/api/hosts/${host2Res.body.id}/ports`).send({
      port_number: 5432, service_name: 'PostgreSQL', protocol: 'TCP',
      client: 'Internal', domain: 'db.local',
    });

    // Add notes
    await request(app).post('/api/notes').send({ title: 'Network Policy', content: 'All Acme Corp servers must use HTTPS' });
    await request(app).post('/api/notes').send({ host_id: hostId, title: 'Setup Guide', content: 'Install nginx first' });
  });

  describe('GET /api/search', () => {
    it('searches hosts by name', async () => {
      const res = await request(app).get('/api/search?q=web');

      expect(res.status).toBe(200);
      expect(res.body.hosts).toHaveLength(1);
      expect(res.body.hosts[0].name).toBe('web-server');
    });

    it('searches ports by service name', async () => {
      const res = await request(app).get('/api/search?q=Nginx');

      expect(res.status).toBe(200);
      expect(res.body.ports).toHaveLength(1);
      expect(res.body.ports[0].service_name).toBe('Nginx');
      expect(res.body.ports[0].host_name).toBe('web-server');
      expect(res.body.ports[0].host_ip).toBe('192.168.1.10');
    });

    it('searches ports by domain', async () => {
      const res = await request(app).get('/api/search?q=db.local');

      expect(res.status).toBe(200);
      expect(res.body.ports).toHaveLength(1);
      expect(res.body.ports[0].service_name).toBe('PostgreSQL');
    });

    it('searches ports by client and notes by content', async () => {
      const res = await request(app).get('/api/search?q=Acme');

      expect(res.status).toBe(200);
      // Should find the port with client 'Acme Corp'
      expect(res.body.ports.length).toBeGreaterThanOrEqual(1);
      expect(res.body.ports[0].client).toContain('Acme');
      // Should also find the note mentioning 'Acme Corp'
      expect(res.body.notes.length).toBeGreaterThanOrEqual(1);
    });

    it('searches notes by title', async () => {
      const res = await request(app).get('/api/search?q=Setup');

      expect(res.status).toBe(200);
      expect(res.body.notes).toHaveLength(1);
      expect(res.body.notes[0].title).toBe('Setup Guide');
    });

    it('returns 400 without q parameter', async () => {
      const res = await request(app).get('/api/search');

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });
});
