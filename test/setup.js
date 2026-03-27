import express from 'express';
import { createDb } from '../server/db.js';
import { hostsRouter } from '../server/routes/hosts.js';
import { portsRouter } from '../server/routes/ports.js';
import { notesRouter } from '../server/routes/notes.js';
import { searchRouter } from '../server/routes/search.js';
import { exportRouter } from '../server/routes/export.js';
import { devicesRouter } from '../server/routes/devices.js';
import { categoriesRouter } from '../server/routes/categories.js';
import { connectionsRouter } from '../server/routes/connections.js';

// Create an isolated Express app with an in-memory SQLite database for testing.
// Each test file calls this to get a fresh database with no shared state.
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
  app.use('/api/devices', devicesRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/connections', connectionsRouter);
  return { app, db };
}
