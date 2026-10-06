import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { applySchema } from './common.js';
import statsRouter from './routes/stats.js';
import buildingsRouter from './routes/buildings.js';
import roomsRouter from './routes/rooms.js';
import occupantsRouter from './routes/occupants.js';
import allocationsRouter from './routes/allocations.js';
import reportsRouter from './routes/reports.js';
import settingsRouter from './routes/settings.js';

dotenv.config({ override: true });

const app = express();
const PORT = Number(process.env.PORT) > 0 ? Number(process.env.PORT) : 4001;

app.use(cors());
app.use(express.json());

// Request log
app.use((req, _res, next) => {
  if (process.env.NODE_ENV !== 'test') {
    console.log(`${new Date().toISOString()}  ${req.method} ${req.originalUrl}`);
  }
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'rms-api' }));

app.use('/api', statsRouter);
app.use('/api', buildingsRouter);
app.use('/api', roomsRouter);
app.use('/api', occupantsRouter);
app.use('/api', allocationsRouter);
app.use('/api', reportsRouter);
app.use('/api', settingsRouter);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Central error handler
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Internal server error' });
});

applySchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`RMS API listening on http://localhost:${PORT}/api`);
    });
  })
  .catch((err) => {
    console.error('Failed to apply schema:', err);
    process.exit(1);
  });
