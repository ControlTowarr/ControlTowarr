import { Router } from 'express';
import * as queries from '../database/queries.js';
import { logger } from '../logger.js';
import { getDb } from '../database/schema.js';

const router = Router();

router.get('/', (req, res) => {
  // Disable caching to ensure fresh stats every time and avoid 304 issues
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');

  try {
    const days = parseInt(req.query.days || '30', 10);

    // 1. Current Totals
    const db = getDb();
    const currentMovies = db.prepare("SELECT COUNT(*) as count FROM media_items WHERE media_type = 'movie'").get().count;
    const currentSeries = db.prepare("SELECT COUNT(*) as count FROM media_items WHERE media_type = 'series'").get().count;
    const currentTotalSize = db.prepare('SELECT SUM(size_bytes) as total FROM media_instances').get().total || 0;

    const instanceTotals = db.prepare(`
      SELECT m.instance_id, i.name as instance_name, i.type as instance_type, COUNT(DISTINCT m.media_item_id) as item_count, SUM(m.size_bytes) as total_bytes
      FROM media_instances m
      LEFT JOIN instances i ON m.instance_id = i.id
      GROUP BY m.instance_id
    `).all();

    const watchStats = db.prepare(`
      SELECT 
        SUM(CASE WHEN last_watched_at IS NOT NULL THEN 1 ELSE 0 END) as watched,
        SUM(CASE WHEN last_watched_at IS NULL THEN 1 ELSE 0 END) as unwatched
      FROM media_items
    `).get();

    // 2. Historical Metrics
    const historicalMetrics = queries.getHistoricalMetrics(days);

    // 3. Action Summary (Total ever deleted)
    const actionSummary = queries.getActionSummary();

    // Monthly Space Freed History
    const monthlySpaceFreed = db.prepare(`
      SELECT strftime('%Y-%m', created_at) as month, SUM(size_freed_bytes) as total_bytes
      FROM action_logs
      WHERE action_type = 'media_deleted'
      GROUP BY month
      ORDER BY month DESC
      LIMIT 12
    `).all();

    res.json({
      current: {
        totalMovies: currentMovies,
        totalSeries: currentSeries,
        totalSizeBytes: currentTotalSize,
        instances: instanceTotals,
        watchStats: watchStats || { watched: 0, unwatched: 0 }
      },
      historical: historicalMetrics,
      actions: {
        summary: actionSummary,
        monthlyFreed: monthlySpaceFreed
      }
    });

  } catch (error) {
    logger.error('Failed to get stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

router.get('/deletions', (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '100', 10);
    const offset = parseInt(req.query.offset || '0', 10);

    const data = queries.getDeletionLogs(limit, offset);
    res.json(data);
  } catch (error) {
    logger.error('Failed to get deletion logs:', error);
    res.status(500).json({ error: 'Failed to fetch deletion history' });
  }
});

export default router;
