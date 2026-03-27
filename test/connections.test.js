import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './setup.js';

describe('Connections API', () => {
  let app, db;

  beforeEach(() => {
    ({ app, db } = createTestApp());
    db.prepare("INSERT INTO devices (ip_address, hostname, category, is_known) VALUES (?, ?, ?, 1)").run('192.168.1.1', 'Router', 'router');
    db.prepare("INSERT INTO devices (ip_address, hostname, category, is_known) VALUES (?, ?, ?, 1)").run('192.168.1.2', 'Switch', 'switch');
    db.prepare("INSERT INTO devices (ip_address, hostname, category, is_known) VALUES (?, ?, ?, 1)").run('192.168.1.3', 'Desktop', 'desktop');
  });

  describe('POST /api/connections', () => {
    it('creates a connection between two devices', async () => {
      const res = await request(app).post('/api/connections').send({
        source_device_id: 1, target_device_id: 2,
        connection_type: 'ethernet', label: 'Port 1 → Port 3',
      });
      expect(res.status).toBe(201);
      expect(res.body.source_device_id).toBe(1);
      expect(res.body.target_device_id).toBe(2);
      expect(res.body.connection_type).toBe('ethernet');
      expect(res.body.label).toBe('Port 1 → Port 3');
    });

    it('defaults connection_type to ethernet', async () => {
      const res = await request(app).post('/api/connections').send({
        source_device_id: 1, target_device_id: 2,
      });
      expect(res.status).toBe(201);
      expect(res.body.connection_type).toBe('ethernet');
    });

    it('rejects self-connections', async () => {
      const res = await request(app).post('/api/connections').send({
        source_device_id: 1, target_device_id: 1,
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/self/i);
    });

    it('rejects duplicate connections (same direction)', async () => {
      await request(app).post('/api/connections').send({ source_device_id: 1, target_device_id: 2 });
      const res = await request(app).post('/api/connections').send({ source_device_id: 1, target_device_id: 2 });
      expect(res.status).toBe(409);
    });

    it('rejects duplicate connections (reverse direction)', async () => {
      await request(app).post('/api/connections').send({ source_device_id: 1, target_device_id: 2 });
      const res = await request(app).post('/api/connections').send({ source_device_id: 2, target_device_id: 1 });
      expect(res.status).toBe(409);
    });

    it('rejects non-existent device IDs', async () => {
      const res = await request(app).post('/api/connections').send({
        source_device_id: 1, target_device_id: 999,
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not found/i);
    });
  });

  describe('GET /api/connections', () => {
    it('lists all connections with device info', async () => {
      await request(app).post('/api/connections').send({ source_device_id: 1, target_device_id: 2, connection_type: 'ethernet' });
      await request(app).post('/api/connections').send({ source_device_id: 2, target_device_id: 3, connection_type: 'wifi' });
      const res = await request(app).get('/api/connections');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].source_name).toBe('Router');
      expect(res.body[0].source_ip).toBe('192.168.1.1');
      expect(res.body[0].target_name).toBe('Switch');
      expect(res.body[0].target_ip).toBe('192.168.1.2');
    });
  });

  describe('PUT /api/connections/:id', () => {
    it('updates connection metadata', async () => {
      const create = await request(app).post('/api/connections').send({ source_device_id: 1, target_device_id: 2 });
      const res = await request(app).put(`/api/connections/${create.body.id}`).send({
        connection_type: 'fiber', label: 'Uplink', speed: '10Gbps', notes: 'Main trunk',
      });
      expect(res.status).toBe(200);
      expect(res.body.connection_type).toBe('fiber');
      expect(res.body.label).toBe('Uplink');
      expect(res.body.speed).toBe('10Gbps');
      expect(res.body.notes).toBe('Main trunk');
    });

    it('returns 404 for non-existent connection', async () => {
      const res = await request(app).put('/api/connections/999').send({ label: 'test' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/connections/:id', () => {
    it('deletes a connection', async () => {
      const create = await request(app).post('/api/connections').send({ source_device_id: 1, target_device_id: 2 });
      const res = await request(app).delete(`/api/connections/${create.body.id}`);
      expect(res.status).toBe(204);
      const list = await request(app).get('/api/connections');
      expect(list.body).toHaveLength(0);
    });

    it('returns 404 for non-existent connection', async () => {
      const res = await request(app).delete('/api/connections/999');
      expect(res.status).toBe(404);
    });
  });

  describe('CASCADE delete', () => {
    it('deletes connections when a device is removed', async () => {
      await request(app).post('/api/connections').send({ source_device_id: 1, target_device_id: 2 });
      await request(app).post('/api/connections').send({ source_device_id: 2, target_device_id: 3 });
      await request(app).delete('/api/devices/2');
      const res = await request(app).get('/api/connections');
      expect(res.body).toHaveLength(0);
    });
  });
});
