import { Router } from 'express';

export const categoriesRouter = Router();

// GET / — list all categories
categoriesRouter.get('/', (req, res) => {
  const categories = req.db.prepare('SELECT * FROM port_categories ORDER BY name').all();
  res.json(categories);
});

// POST / — create a category
categoriesRouter.post('/', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  try {
    const result = req.db.prepare('INSERT INTO port_categories (name) VALUES (?)').run(name.trim());
    const category = req.db.prepare('SELECT * FROM port_categories WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(category);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: `Category '${name.trim()}' already exists` });
    }
    throw err;
  }
});

// DELETE /:id — delete a category (ports with this category get null)
categoriesRouter.delete('/:id', (req, res) => {
  const result = req.db.prepare('DELETE FROM port_categories WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Category not found' });
  }
  res.status(204).end();
});
