import { Router } from 'express';

export const notesRouter = Router();

// GET / — list all notes (optional ?host_id filter)
notesRouter.get('/', (req, res) => {
  const { host_id } = req.query;
  let sql = 'SELECT * FROM notes';
  const params = [];

  if (host_id) {
    sql += ' WHERE host_id = ?';
    params.push(host_id);
  }

  sql += ' ORDER BY created_at DESC';
  const notes = req.db.prepare(sql).all(...params);
  res.json(notes);
});

// POST / — create a note
notesRouter.post('/', (req, res) => {
  const { host_id, title, content } = req.body;

  if (!title || !content) {
    return res.status(400).json({ error: 'title and content are required' });
  }

  const result = req.db.prepare(
    'INSERT INTO notes (host_id, title, content) VALUES (?, ?, ?)'
  ).run(host_id || null, title, content);

  const note = req.db.prepare('SELECT * FROM notes WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(note);
});

// PUT /:id — update a note
notesRouter.put('/:id', (req, res) => {
  const existing = req.db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Note not found' });
  }

  const { title, content, host_id } = { ...existing, ...req.body };

  req.db.prepare(
    `UPDATE notes SET title = ?, content = ?, host_id = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(title, content, host_id, req.params.id);

  const note = req.db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  res.json(note);
});

// DELETE /:id — delete a note
notesRouter.delete('/:id', (req, res) => {
  const result = req.db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Note not found' });
  }
  res.status(204).end();
});
