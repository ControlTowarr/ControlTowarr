import { Router } from 'express';
import * as queries from '../database/queries.js';
import { logger } from '../logger.js';
import { startSyncScheduler } from '../sync/syncEngine.js';

const router = Router();

// GET /api/settings — get all settings
router.get('/', (req, res) => {
  try {
    const settings = queries.getAllSettings();
    res.json(settings);
  } catch (error) {
    logger.error('Failed to get settings:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// PUT /api/settings — update settings
router.put('/', (req, res) => {
  try {
    const updates = req.body;
    let syncIntervalChanged = false;
    let newInterval = 60;

    for (const [key, value] of Object.entries(updates)) {
      queries.setSetting(key, String(value));
      if (key === 'sync_interval_minutes') {
        syncIntervalChanged = true;
        newInterval = parseInt(String(value), 10);
      }
    }

    if (syncIntervalChanged && !isNaN(newInterval)) {
      startSyncScheduler(newInterval);
    }

    res.json(queries.getAllSettings());
  } catch (error) {
    logger.error('Failed to update settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;
