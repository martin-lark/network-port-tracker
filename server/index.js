import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from './db.js';
import { hostsRouter } from './routes/hosts.js';
import { portsRouter } from './routes/ports.js';
import { notesRouter } from './routes/notes.js';
import { searchRouter } from './routes/search.js';
import { exportRouter } from './routes/export.js';
import { devicesRouter } from './routes/devices.js';
import { categoriesRouter } from './routes/categories.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Attach the database instance to every request so route handlers can access it via req.db
const db = getDb();
app.use((req, res, next) => { req.db = db; next(); });

app.use('/api/hosts', hostsRouter);
app.use('/api', portsRouter);  // Mounted at /api because it handles both /hosts/:id/ports and /ports/:id
app.use('/api/notes', notesRouter);
app.use('/api/search', searchRouter);
app.use('/api/export', exportRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/categories', categoriesRouter);

// In production, serve the built React SPA and fall back to index.html for client-side routing
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Port Tracker running at http://localhost:${PORT}`);
});

export default app;
