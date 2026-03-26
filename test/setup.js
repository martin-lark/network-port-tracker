import express from 'express';
import { createDb } from '../server/db.js';

export function createTestApp() {
  const db = createDb(':memory:');
  const app = express();
  app.use(express.json());

  app.use((req, res, next) => {
    req.db = db;
    next();
  });

  // Routes will be added in Task 3 when stubs exist
  return { app, db };
}
