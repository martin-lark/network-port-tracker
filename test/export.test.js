import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './setup.js';

describe('Export API', () => {
  let app, db, hostId, host2Id;

  beforeEach(async () => {
    ({ app, db } = createTestApp());

    // Seed data
    const h1 = await request(app)
      .post('/api/hosts')
      .send({ name: 'web-server', ip_address: '192.168.1.10', os: 'Ubuntu' });
    hostId = h1.body.id;

    const h2 = await request(app)
      .post('/api/hosts')
      .send({ name: 'db-server', ip_address: '192.168.1.20', os: 'Debian' });
    host2Id = h2.body.id;

    // Add ports
    await request(app).post(`/api/hosts/${hostId}/ports`).send({
      port_number: 80, service_name: 'HTTP', protocol: 'TCP', status: 'active', client: 'Acme Corp',
    });
    await request(app).post(`/api/hosts/${hostId}/ports`).send({
      port_number: 443, port_end: 445, service_name: 'HTTPS Range', protocol: 'TCP', status: 'active', client: 'Beta Inc',
    });
    await request(app).post(`/api/hosts/${host2Id}/ports`).send({
      port_number: 5432, service_name: 'PostgreSQL', protocol: 'TCP', status: 'active', client: 'Acme Corp',
    });

    // Add notes
    await request(app).post('/api/notes').send({ host_id: hostId, title: 'Web Notes', content: 'Running nginx' });
  });

  describe('GET /api/export', () => {
    it('exports as markdown', async () => {
      const res = await request(app).get('/api/export?format=markdown');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/markdown');
      expect(res.text).toContain('web-server');
      expect(res.text).toContain('80');
      expect(res.text).toContain('HTTP');
      expect(res.text).toContain('db-server');
    });

    it('exports single host', async () => {
      const res = await request(app).get(`/api/export?format=markdown&host_id=${hostId}`);

      expect(res.status).toBe(200);
      expect(res.text).toContain('web-server');
      expect(res.text).not.toContain('db-server');
    });

    it('exports as CSV', async () => {
      const res = await request(app).get('/api/export?format=csv');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      // Should have header row
      const lines = res.text.trim().split('\n');
      expect(lines[0]).toContain('host');
      // Should have data rows
      expect(lines.length).toBeGreaterThan(1);
      expect(res.text).toContain('web-server');
    });

    it('exports as text', async () => {
      const res = await request(app).get('/api/export?format=text');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.text).toContain('web-server');
      expect(res.text).toContain('192.168.1.10');
      expect(res.text).toContain(':80');
    });

    it('shows port range in export', async () => {
      const res = await request(app).get(`/api/export?format=text&host_id=${hostId}`);

      expect(res.status).toBe(200);
      expect(res.text).toContain('443-445');
    });

    it('filters by client', async () => {
      const res = await request(app).get('/api/export?format=markdown&client=Acme Corp');

      expect(res.status).toBe(200);
      // Both hosts have Acme Corp ports
      expect(res.text).toContain('web-server');
      expect(res.text).toContain('db-server');
      // Should contain Acme Corp port but not Beta Inc port
      expect(res.text).toContain('HTTP');
      expect(res.text).not.toContain('HTTPS Range');
    });

    it('returns 400 for invalid format', async () => {
      const res = await request(app).get('/api/export?format=xml');

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });
});
