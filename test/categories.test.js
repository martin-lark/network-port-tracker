import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './setup.js';

describe('Categories API', () => {
  let app, db;

  beforeEach(() => {
    ({ app, db } = createTestApp());
  });

  describe('GET /api/categories', () => {
    it('returns seeded default categories', async () => {
      const res = await request(app).get('/api/categories');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(6);
      const names = res.body.map(c => c.name);
      expect(names).toContain('Web');
      expect(names).toContain('Database');
      expect(names).toContain('Other');
    });
  });

  describe('POST /api/categories', () => {
    it('creates a new category', async () => {
      const res = await request(app).post('/api/categories').send({ name: 'Gaming' });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Gaming');
      expect(res.body.id).toBeDefined();
    });

    it('returns 400 for missing name', async () => {
      const res = await request(app).post('/api/categories').send({});
      expect(res.status).toBe(400);
    });

    it('returns 409 for duplicate name', async () => {
      const res = await request(app).post('/api/categories').send({ name: 'Web' });
      expect(res.status).toBe(409);
    });
  });

  describe('DELETE /api/categories/:id', () => {
    it('deletes a category', async () => {
      const categories = await request(app).get('/api/categories');
      const other = categories.body.find(c => c.name === 'Other');
      const res = await request(app).delete(`/api/categories/${other.id}`);
      expect(res.status).toBe(204);
    });

    it('returns 404 for nonexistent category', async () => {
      const res = await request(app).delete('/api/categories/999');
      expect(res.status).toBe(404);
    });

    it('nullifies category_id on ports when category deleted', async () => {
      // Create a host and port with a category
      db.prepare("INSERT INTO hosts (name, ip_address) VALUES ('test', '1.2.3.4')").run();
      const categories = db.prepare('SELECT * FROM port_categories').all();
      const webCat = categories.find(c => c.name === 'Web');
      db.prepare("INSERT INTO ports (host_id, port_number, service_name, category_id) VALUES (1, 80, 'HTTP', ?)").run(webCat.id);

      await request(app).delete(`/api/categories/${webCat.id}`);

      const port = db.prepare('SELECT * FROM ports WHERE port_number = 80').get();
      expect(port.category_id).toBeNull();
    });
  });
});
