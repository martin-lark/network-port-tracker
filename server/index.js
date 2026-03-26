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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const db = getDb();
app.use((req, res, next) => { req.db = db; next(); });

app.use('/api/hosts', hostsRouter);
app.use('/api', portsRouter);
app.use('/api/notes', notesRouter);
app.use('/api/search', searchRouter);
app.use('/api/export', exportRouter);

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
