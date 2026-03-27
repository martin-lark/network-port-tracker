import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './setup.js';

describe('Devices API', () => {
  let app, db;
  beforeEach(() => { ({ app, db } = createTestApp()); });

  describe('GET /api/devices', () => {
    it('returns empty array initially', async () => {
      const res = await request(app).get('/api/devices');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns all devices', async () => {
      db.prepare('INSERT INTO devices (ip_address, hostname, is_known) VALUES (?, ?, ?)').run('192.168.1.1', 'router', 1);
      db.prepare('INSERT INTO devices (ip_address, is_known) VALUES (?, ?)').run('192.168.1.50', 0);
      const res = await request(app).get('/api/devices');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    it('filters to known_only when param is set', async () => {
      db.prepare('INSERT INTO devices (ip_address, hostname, is_known) VALUES (?, ?, ?)').run('192.168.1.1', 'router', 1);
      db.prepare('INSERT INTO devices (ip_address, is_known) VALUES (?, ?)').run('192.168.1.50', 0);
      const res = await request(app).get('/api/devices?known_only=true');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].hostname).toBe('router');
    });

    it('includes devices with host_id in known_only filter', async () => {
      const hostResult = db.prepare('INSERT INTO hosts (name, ip_address) VALUES (?, ?)').run('server-01', '192.168.1.10');
      db.prepare('INSERT INTO devices (ip_address, host_id, is_known) VALUES (?, ?, ?)').run('192.168.1.10', hostResult.lastInsertRowid, 0);
      const res = await request(app).get('/api/devices?known_only=true');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe('POST /api/devices', () => {
    it('creates a device', async () => {
      const res = await request(app).post('/api/devices')
        .send({ ip_address: '192.168.1.100', hostname: 'nas', category: 'server' });
      expect(res.status).toBe(201);
      expect(res.body.ip_address).toBe('192.168.1.100');
      expect(res.body.hostname).toBe('nas');
      expect(res.body.category).toBe('server');
      expect(res.body.is_known).toBe(1);
    });

    it('returns 400 without ip_address', async () => {
      const res = await request(app).post('/api/devices').send({ hostname: 'test' });
      expect(res.status).toBe(400);
    });

    it('returns 409 on duplicate ip_address', async () => {
      await request(app).post('/api/devices').send({ ip_address: '192.168.1.1' });
      const res = await request(app).post('/api/devices').send({ ip_address: '192.168.1.1' });
      expect(res.status).toBe(409);
    });
  });

  describe('PUT /api/devices/:id', () => {
    it('updates a device', async () => {
      const create = await request(app).post('/api/devices').send({ ip_address: '192.168.1.1' });
      const res = await request(app).put(`/api/devices/${create.body.id}`)
        .send({ hostname: 'my-router', category: 'network' });
      expect(res.status).toBe(200);
      expect(res.body.hostname).toBe('my-router');
      expect(res.body.category).toBe('network');
      expect(res.body.is_known).toBe(1);
    });

    it('returns 404 for nonexistent device', async () => {
      const res = await request(app).put('/api/devices/999').send({ hostname: 'test' });
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/devices/:id/position', () => {
    it('saves x and y position', async () => {
      const create = await request(app).post('/api/devices').send({ ip_address: '192.168.1.1' });
      const res = await request(app).put(`/api/devices/${create.body.id}/position`)
        .send({ x: 150.5, y: 300.2 });
      expect(res.status).toBe(200);
      expect(res.body.x_position).toBeCloseTo(150.5);
      expect(res.body.y_position).toBeCloseTo(300.2);
    });
  });

  describe('DELETE /api/devices/:id', () => {
    it('deletes a device', async () => {
      const create = await request(app).post('/api/devices').send({ ip_address: '192.168.1.1' });
      const res = await request(app).delete(`/api/devices/${create.body.id}`);
      expect(res.status).toBe(204);
      const list = await request(app).get('/api/devices');
      expect(list.body).toHaveLength(0);
    });

    it('returns 404 for nonexistent device', async () => {
      const res = await request(app).delete('/api/devices/999');
      expect(res.status).toBe(404);
    });
  });

  describe('host linking', () => {
    it('links device to host via update', async () => {
      const hostResult = db.prepare('INSERT INTO hosts (name, ip_address) VALUES (?, ?)').run('server-01', '192.168.1.10');
      const create = await request(app).post('/api/devices').send({ ip_address: '192.168.1.10' });
      const res = await request(app).put(`/api/devices/${create.body.id}`)
        .send({ host_id: hostResult.lastInsertRowid });
      expect(res.status).toBe(200);
      expect(res.body.host_id).toBe(Number(hostResult.lastInsertRowid));
    });

    it('sets host_id to null when host is deleted', async () => {
      const hostResult = db.prepare('INSERT INTO hosts (name, ip_address) VALUES (?, ?)').run('server-01', '192.168.1.10');
      const create = await request(app).post('/api/devices').send({ ip_address: '192.168.1.10', host_id: hostResult.lastInsertRowid });
      db.prepare('DELETE FROM hosts WHERE id = ?').run(hostResult.lastInsertRowid);
      const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(create.body.id);
      expect(device.host_id).toBeNull();
    });
  });

  describe('GET /api/devices with host data', () => {
    it('includes host name and port count for linked devices', async () => {
      const hostResult = db.prepare('INSERT INTO hosts (name, ip_address) VALUES (?, ?)').run('server-01', '192.168.1.10');
      const hostId = Number(hostResult.lastInsertRowid);
      db.prepare('INSERT INTO ports (host_id, port_number, service_name) VALUES (?, ?, ?)').run(hostId, 80, 'Nginx');
      db.prepare('INSERT INTO ports (host_id, port_number, service_name) VALUES (?, ?, ?)').run(hostId, 443, 'HTTPS');
      db.prepare('INSERT INTO devices (ip_address, host_id, is_known) VALUES (?, ?, ?)').run('192.168.1.10', hostId, 1);
      const res = await request(app).get('/api/devices');
      expect(res.status).toBe(200);
      expect(res.body[0].host_name).toBe('server-01');
      expect(res.body[0].port_count).toBe(2);
    });
  });
});
