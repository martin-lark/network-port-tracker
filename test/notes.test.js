import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './setup.js';

describe('Notes API', () => {
  let app, db, hostId;

  beforeEach(async () => {
    ({ app, db } = createTestApp());
    const res = await request(app)
      .post('/api/hosts')
      .send({ name: 'web-server', ip_address: '192.168.1.10' });
    hostId = res.body.id;
  });

  describe('GET /api/notes', () => {
    it('lists all notes (global + host-linked)', async () => {
      db.prepare('INSERT INTO notes (title, content) VALUES (?, ?)').run('Global Note', 'Global content');
      db.prepare('INSERT INTO notes (host_id, title, content) VALUES (?, ?, ?)').run(hostId, 'Host Note', 'Host content');

      const res = await request(app).get('/api/notes');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    it('filters by host_id', async () => {
      db.prepare('INSERT INTO notes (title, content) VALUES (?, ?)').run('Global Note', 'Global content');
      db.prepare('INSERT INTO notes (host_id, title, content) VALUES (?, ?, ?)').run(hostId, 'Host Note', 'Host content');

      const res = await request(app).get(`/api/notes?host_id=${hostId}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].title).toBe('Host Note');
    });
  });

  describe('POST /api/notes', () => {
    it('creates a global note (host_id null)', async () => {
      const res = await request(app)
        .post('/api/notes')
        .send({ title: 'Network Policy', content: 'All servers must use HTTPS' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id: expect.any(Number),
        host_id: null,
        title: 'Network Policy',
        content: 'All servers must use HTTPS',
      });
    });

    it('creates a host-linked note', async () => {
      const res = await request(app)
        .post('/api/notes')
        .send({ host_id: hostId, title: 'Setup', content: 'Installed nginx' });

      expect(res.status).toBe(201);
      expect(res.body.host_id).toBe(hostId);
      expect(res.body.title).toBe('Setup');
    });

    it('returns 400 when title is missing', async () => {
      const res = await request(app)
        .post('/api/notes')
        .send({ content: 'Some content' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('returns 400 when content is missing', async () => {
      const res = await request(app)
        .post('/api/notes')
        .send({ title: 'A title' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('PUT /api/notes/:id', () => {
    it('updates a note', async () => {
      const createRes = await request(app)
        .post('/api/notes')
        .send({ title: 'Original', content: 'Original content' });
      const noteId = createRes.body.id;

      const res = await request(app)
        .put(`/api/notes/${noteId}`)
        .send({ title: 'Updated', content: 'Updated content' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated');
      expect(res.body.content).toBe('Updated content');
    });
  });

  describe('DELETE /api/notes/:id', () => {
    it('deletes a note', async () => {
      const createRes = await request(app)
        .post('/api/notes')
        .send({ title: 'To Delete', content: 'Will be deleted' });
      const noteId = createRes.body.id;

      const res = await request(app).delete(`/api/notes/${noteId}`);
      expect(res.status).toBe(204);

      const notes = db.prepare('SELECT * FROM notes WHERE id = ?').all(noteId);
      expect(notes).toHaveLength(0);
    });
  });
});
