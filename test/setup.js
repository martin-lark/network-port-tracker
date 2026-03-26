import express from 'express';
import { createDb } from '../server/db.js';
import { hostsRouter } from '../server/routes/hosts.js';
import { portsRouter } from '../server/routes/ports.js';
import { notesRouter } from '../server/routes/notes.js';
import { searchRouter } from '../server/routes/search.js';
import { exportRouter } from '../server/routes/export.js';

export function createTestApp() {
  const db = createDb(':memory:');
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.db = db; next(); });
  app.use('/api/hosts', hostsRouter);
  app.use('/api', portsRouter);
  app.use('/api/notes', notesRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/export', exportRouter);
  return { app, db };
}
