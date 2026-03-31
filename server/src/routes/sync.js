import { Router } from 'express';
import { runFullSync, getSyncStatus } from '../sync/syncEngine.js';
import { logger } from '../logger.js';

const router = Router();

// POST /api/sync — trigger manual sync
router.post('/', async (req, res) => {
  try {
    const result = await runFullSync();
    res.json(result);
  } catch (error) {
    logger.error('Manual sync failed:', error);
    res.status(500).json({ error: 'Manual sync failed' });
  }
});

// GET /api/sync/status — get sync status and recent logs
router.get('/status', (req, res) => {
  try {
    const status = getSyncStatus();
    res.json(status);
  } catch (error) {
    logger.error('Failed to get sync status:', error);
    res.status(500).json({ error: 'Failed to get sync status' });
  }
});

export default router;
