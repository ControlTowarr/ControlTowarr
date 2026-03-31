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
    const instanceId = req.query.instanceId ? parseInt(req.query.instanceId, 10) : null;
    const rootFolder = req.query.rootFolder || null;
    const user = req.query.user || null;

    const db = getDb();
    
    // Filters for media_items
    let baseWhere = [];
    let params = [];
    if (instanceId) {
      baseWhere.push(`id IN (SELECT media_item_id FROM media_instances WHERE instance_id = ?)`);
      params.push(instanceId);
    }
    if (rootFolder) {
      baseWhere.push(`id IN (SELECT media_item_id FROM media_instances WHERE path LIKE ?)`);
      params.push(rootFolder + '/%');
    }
    if (user) {
      baseWhere.push(`id IN (SELECT media_item_id FROM media_requests WHERE requested_by_name = ?)`);
      params.push(user);
    }
    const whereMedia = baseWhere.length ? `WHERE ${baseWhere.join(' AND ')}` : '';

    // Filters for media_instances
    let sizeWhere = [];
    let sizeParams = [];
    if (instanceId) { sizeWhere.push(`instance_id = ?`); sizeParams.push(instanceId); }
    if (rootFolder) { sizeWhere.push(`path LIKE ?`); sizeParams.push(rootFolder + '/%'); }
    if (user) { sizeWhere.push(`media_item_id IN (SELECT media_item_id FROM media_requests WHERE requested_by_name = ?)`); sizeParams.push(user); }
    const whereSize = sizeWhere.length ? `WHERE ${sizeWhere.join(' AND ')}` : '';

    // 1. Current Totals
    const currentMovies = db.prepare(`SELECT COUNT(*) as count FROM media_items ${whereMedia} ${whereMedia ? 'AND' : 'WHERE'} media_type = 'movie'`).get(...params).count;
    const currentSeries = db.prepare(`SELECT COUNT(*) as count FROM media_items ${whereMedia} ${whereMedia ? 'AND' : 'WHERE'} media_type = 'series'`).get(...params).count;
    const currentTotalSize = db.prepare(`SELECT SUM(size_bytes) as total FROM media_instances ${whereSize}`).get(...sizeParams).total || 0;

    const instanceTotals = db.prepare(`
      SELECT m.instance_id, i.name as instance_name, i.type as instance_type, COUNT(DISTINCT m.media_item_id) as item_count, SUM(m.size_bytes) as total_bytes
      FROM media_instances m
      LEFT JOIN instances i ON m.instance_id = i.id
      ${whereSize}
      GROUP BY m.instance_id
    `).all(...sizeParams);

    const watchStats = db.prepare(`
      SELECT 
        SUM(CASE WHEN last_watched_at IS NOT NULL THEN 1 ELSE 0 END) as watched,
        SUM(CASE WHEN last_watched_at IS NULL THEN 1 ELSE 0 END) as unwatched
      FROM media_items
      ${whereMedia}
    `).get(...params);

    // 2. Historical Metrics
    const historicalMetrics = queries.getHistoricalMetrics(days, instanceId, rootFolder);

    // 3. Action Summary (Total ever deleted)
    const actionSummary = queries.getActionSummary(instanceId, rootFolder);

    // Monthly Space Freed History
    let freedWhere = `WHERE action_type = 'media_deleted'`;
    let freedParams = [];
    if (instanceId) { freedWhere += ` AND instance_id = ?`; freedParams.push(instanceId); }
    if (rootFolder) { freedWhere += ` AND details LIKE ?`; freedParams.push(`%${rootFolder}%`); }

    const monthlySpaceFreed = db.prepare(`
      SELECT strftime('%Y-%m', created_at) as month, SUM(size_freed_bytes) as total_bytes
      FROM action_logs
      ${freedWhere}
      GROUP BY month
      ORDER BY month DESC
      LIMIT 12
    `).all(...freedParams);

    // 4. User Stats
    let uParams = [];
    let sizeSubConds = ['mi.media_item_id = m.id'];
    if (instanceId) { sizeSubConds.push('mi.instance_id = ?'); uParams.push(instanceId); }
    if (rootFolder) { sizeSubConds.push('mi.path LIKE ?'); uParams.push(rootFolder + '/%'); }
    
    let mConds = [];
    if (instanceId) { mConds.push('m.id IN (SELECT media_item_id FROM media_instances WHERE instance_id = ?)'); uParams.push(instanceId); }
    if (rootFolder) { mConds.push('m.id IN (SELECT media_item_id FROM media_instances WHERE path LIKE ?)'); uParams.push(rootFolder + '/%'); }
    if (user) { mConds.push('m.id IN (SELECT media_item_id FROM media_requests WHERE requested_by_name = ?)'); uParams.push(user); }
    
    const userStats = db.prepare(`
      SELECT 
        r.requested_by_name as user_name,
        SUM(CASE WHEN m.media_type = 'movie' THEN 1 ELSE 0 END) as movie_requests,
        SUM(CASE WHEN m.media_type = 'series' THEN 1 ELSE 0 END) as series_requests,
        COUNT(DISTINCT m.id) as total_requests,
        SUM((
          SELECT COALESCE(SUM(mi.size_bytes), 0)
          FROM media_instances mi
          WHERE ${sizeSubConds.join(' AND ')}
        )) as total_bytes
      FROM media_requests r
      JOIN media_items m ON r.media_item_id = m.id
      ${mConds.length ? 'WHERE ' + mConds.join(' AND ') : ''}
      GROUP BY r.requested_by_name
      HAVING r.requested_by_name IS NOT NULL
      ORDER BY total_requests DESC
    `).all(...uParams);

    res.json({
      current: {
        totalMovies: currentMovies,
        totalSeries: currentSeries,
        totalSizeBytes: currentTotalSize,
        instances: instanceTotals,
        watchStats: watchStats || { watched: 0, unwatched: 0 },
        userStats: userStats
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
