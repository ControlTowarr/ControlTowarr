import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { initializeDatabase } from './database/schema.js';
import { logger } from './logger.js';
import { startSyncScheduler } from './sync/syncEngine.js';
import { getSetting } from './database/queries.js';
import instancesRouter from './routes/instances.js';
import mediaRouter from './routes/media.js';
import syncRouter from './routes/sync.js';
import settingsRouter from './routes/settings.js';
import statsRouter from './routes/stats.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3377;

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/instances', instancesRouter);
app.use('/api/media', mediaRouter);
app.use('/api/sync', syncRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/stats', statsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// Serve Angular frontend in production
const clientDistPath = path.join(__dirname, '../../client/dist/client/browser');
app.use(express.static(clientDistPath));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  }
});

// Initialize
async function start() {
  try {
    const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/controltowarr.db');
    initializeDatabase(dbPath);
    logger.info('Database initialized');

    // Load sync interval from database, fallback to ENV or 60
    const dbInterval = getSetting('sync_interval_minutes');
    const syncInterval = parseInt(dbInterval || process.env.SYNC_INTERVAL_MINUTES || '60', 10);
    
    startSyncScheduler(syncInterval);
    logger.info(`Sync scheduler started (every ${syncInterval} minutes)`);

    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`ControlTowarr server running on 0.0.0.0:${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

export default app;
