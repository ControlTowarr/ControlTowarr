import { getDb } from './schema.js';

// ═══════════════════════════════════════════════════════════
// INSTANCES
// ═══════════════════════════════════════════════════════════

export function getAllInstances() {
  return getDb().prepare('SELECT * FROM instances ORDER BY type, name').all();
}

export function getInstanceById(id) {
  return getDb().prepare('SELECT * FROM instances WHERE id = ?').get(id);
}

export function getInstancesByType(type) {
  return getDb().prepare('SELECT * FROM instances WHERE type = ? AND enabled = 1 ORDER BY name').all(type);
}

export function createInstance({ type, name, url, api_key, username, password }) {
  const result = getDb().prepare(`
    INSERT INTO instances (type, name, url, api_key, username, password)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(type, name, url.replace(/\/+$/, ''), api_key || '', username || '', password || '');
  return getInstanceById(result.lastInsertRowid);
}

export function updateInstance(id, { name, url, api_key, username, password, enabled }) {
  const fields = [];
  const values = [];

  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (url !== undefined) { fields.push('url = ?'); values.push(url.replace(/\/+$/, '')); }
  if (api_key !== undefined) { fields.push('api_key = ?'); values.push(api_key); }
  if (username !== undefined) { fields.push('username = ?'); values.push(username); }
  if (password !== undefined) { fields.push('password = ?'); values.push(password); }
  if (enabled !== undefined) { fields.push('enabled = ?'); values.push(enabled ? 1 : 0); }

  if (fields.length === 0) return getInstanceById(id);

  fields.push("updated_at = datetime('now')");
  values.push(id);

  getDb().prepare(`UPDATE instances SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getInstanceById(id);
}

export function deleteInstance(id) {
  return getDb().prepare('DELETE FROM instances WHERE id = ?').run(id);
}

export function updateInstanceLastSync(id) {
  getDb().prepare("UPDATE instances SET last_sync = datetime('now') WHERE id = ?").run(id);
}

// ═══════════════════════════════════════════════════════════
// MEDIA ITEMS
// ═══════════════════════════════════════════════════════════

export function findMediaByExternalId({ imdb_id, tvdb_id, tmdb_id }) {
  if (imdb_id) {
    const item = getDb().prepare('SELECT * FROM media_items WHERE imdb_id = ?').get(imdb_id);
    if (item) return item;
  }
  if (tvdb_id) {
    const item = getDb().prepare('SELECT * FROM media_items WHERE tvdb_id = ?').get(tvdb_id);
    if (item) return item;
  }
  if (tmdb_id) {
    const item = getDb().prepare('SELECT * FROM media_items WHERE tmdb_id = ?').get(tmdb_id);
    if (item) return item;
  }
  return null;
}

export function findMediaByTitle(title, mediaType) {
  if (!title) return null;
  // Try exact match first
  let item = getDb().prepare('SELECT * FROM media_items WHERE title = ? AND media_type = ?').get(title, mediaType);
  if (item) return item;

  // Try case-insensitive exact match
  item = getDb().prepare('SELECT * FROM media_items WHERE LOWER(title) = LOWER(?) AND media_type = ?').get(title, mediaType);
  if (item) return item;

  return null;
}

export function updateLastWatched(mediaItemId, watchedAt) {
  if (!watchedAt) return;
  getDb().prepare(`
    UPDATE media_items 
    SET last_watched_at = MAX(COALESCE(last_watched_at, ''), ?), 
        updated_at = datetime('now')
    WHERE id = ?
  `).run(watchedAt, mediaItemId);
}

export function createMediaItem({ title, media_type, imdb_id, tvdb_id, tmdb_id, poster_url, overview, year, status, added_at }) {
  const result = getDb().prepare(`
    INSERT INTO media_items (title, media_type, imdb_id, tvdb_id, tmdb_id, poster_url, overview, year, status, added_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, media_type, imdb_id || null, tvdb_id || null, tmdb_id || null, poster_url || null, overview || null, year || null, status || 'unknown', added_at || null);
  return getDb().prepare('SELECT * FROM media_items WHERE id = ?').get(result.lastInsertRowid);
}

export function updateMediaItem(id, fields) {
  const sets = [];
  const values = [];

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      sets.push(`${key} = ?`);
      values.push(value);
    }
  }
  if (sets.length === 0) return;

  sets.push("updated_at = datetime('now')");
  values.push(id);
  getDb().prepare(`UPDATE media_items SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteMediaItem(id) {
  return getDb().prepare('DELETE FROM media_items WHERE id = ?').run(id);
}

export function getMediaItems({ sort = 'title', order = 'asc', mediaType, seedingStatus, watchStatus, requestedBy, rootFolder, search, limit = 100, offset = 0 } = {}) {
  let where = [];
  let params = [];

  if (requestedBy) {
    where.push('m.id IN (SELECT media_item_id FROM media_requests WHERE requested_by_name = ?)');
    params.push(requestedBy);
  }
  if (rootFolder) {
    where.push('m.id IN (SELECT media_item_id FROM media_instances WHERE path LIKE ?)');
    params.push(rootFolder + '/%');
  }
  if (mediaType) {
    where.push('m.media_type = ?');
    params.push(mediaType);
  }
  if (seedingStatus) {
    where.push('m.seeding_status = ?');
    params.push(seedingStatus);
  }
  if (watchStatus === 'unwatched') {
    where.push('m.last_watched_at IS NULL');
  } else if (watchStatus === 'watched') {
    where.push('m.last_watched_at IS NOT NULL');
  }
  if (search) {
    where.push('m.title LIKE ?');
    params.push(`%${search}%`);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const validSorts = {
    title: 'm.title',
    added_at: 'm.added_at',
    last_watched_at: 'm.last_watched_at',
    year: 'm.year',
    seeding_status: 'm.seeding_status',
    size_bytes: 'total_size_bytes',
  };
  const sortColumn = validSorts[sort] || 'm.title';
  const sortOrder = order === 'desc' ? 'DESC' : 'ASC';

  // Handle NULLs: push nulls to the end for ascending date sorts
  let orderClause;
  if (sort === 'added_at' || sort === 'last_watched_at') {
    orderClause = `ORDER BY CASE WHEN ${sortColumn} IS NULL THEN 1 ELSE 0 END, ${sortColumn} ${sortOrder}`;
  } else {
    orderClause = `ORDER BY ${sortColumn} ${sortOrder}`;
  }

  const countResult = getDb().prepare(`SELECT COUNT(*) as total FROM media_items m ${whereClause}`).get(...params);

  const items = getDb().prepare(`
    SELECT m.*,
      (SELECT SUM(mi.size_bytes) FROM media_instances mi WHERE mi.media_item_id = m.id) as total_size_bytes,
      (SELECT GROUP_CONCAT(DISTINCT i.name) FROM media_instances mi JOIN instances i ON mi.instance_id = i.id WHERE mi.media_item_id = m.id) as instance_names,
      (SELECT GROUP_CONCAT(DISTINCT i.type) FROM media_instances mi JOIN instances i ON mi.instance_id = i.id WHERE mi.media_item_id = m.id) as instance_types,
      (SELECT JSON_GROUP_ARRAY(JSON_OBJECT('name', name, 'avatar', avatar)) FROM (SELECT DISTINCT requested_by_name as name, requested_by_avatar as avatar FROM media_requests WHERE media_item_id = m.id)) as requests
    FROM media_items m
    ${whereClause}
    ${orderClause}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  return {
    items: items.map(item => ({
      ...item,
      requests: item.requests ? JSON.parse(item.requests) : []
    })),
    total: countResult.total, limit, offset
  };
}

export function getMediaItemDetail(id) {
  const item = getDb().prepare('SELECT * FROM media_items WHERE id = ?').get(id);
  if (!item) return null;

  const instances = getDb().prepare(`
    SELECT mi.*, i.name as instance_name, i.type as instance_type, i.url as instance_url
    FROM media_instances mi
    JOIN instances i ON mi.instance_id = i.id
    WHERE mi.media_item_id = ?
  `).all(id);

  const downloads = getDb().prepare(`
    SELECT dr.*, i.name as instance_name
    FROM download_records dr
    LEFT JOIN instances i ON dr.instance_id = i.id
    WHERE dr.media_item_id = ?
  `).all(id);

  const watchHistory = getDb().prepare(`
    SELECT * FROM watch_history WHERE media_item_id = ? ORDER BY watched_at DESC LIMIT 50
  `).all(id);

  const requests = getDb().prepare(`
    SELECT *, requested_by_name as name, requested_by_avatar as avatar
    FROM media_requests 
    WHERE media_item_id = ? 
    ORDER BY requested_at DESC
  `).all(id);

  return { ...item, instances, downloads, watchHistory, requests };
}

// ═══════════════════════════════════════════════════════════
// MEDIA INSTANCES (junction)
// ═══════════════════════════════════════════════════════════

export function upsertMediaInstance({ media_item_id, instance_id, external_id, external_slug, path, size_bytes, has_file, quality, date_added }) {
  getDb().prepare(`
    INSERT INTO media_instances (media_item_id, instance_id, external_id, external_slug, path, size_bytes, has_file, quality, date_added)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(media_item_id, instance_id, external_id)
    DO UPDATE SET external_slug = excluded.external_slug, path = excluded.path, size_bytes = excluded.size_bytes, has_file = excluded.has_file,
                  quality = excluded.quality, updated_at = datetime('now')
  `).run(media_item_id, instance_id, external_id, external_slug || null, path || null, size_bytes || 0, has_file ? 1 : 0, quality || null, date_added || null);
}

export function getMediaInstancesForInstance(instanceId) {
  return getDb().prepare('SELECT * FROM media_instances WHERE instance_id = ?').all(instanceId);
}

export function deleteMediaInstancesForInstance(instanceId) {
  return getDb().prepare('DELETE FROM media_instances WHERE instance_id = ?').run(instanceId);
}

export function getMediaInstancesByMediaId(mediaId) {
  return getDb().prepare(`
    SELECT mi.*, i.name as instance_name, i.type as instance_type, i.url as instance_url
    FROM media_instances mi
    JOIN instances i ON mi.instance_id = i.id
    WHERE mi.media_item_id = ?
  `).all(mediaId);
}

export function getRootFolders() {
  const paths = getDb().prepare('SELECT DISTINCT path FROM media_instances WHERE path IS NOT NULL').all();
  const rootFolders = new Set();
  
  paths.forEach(({ path }) => {
    const parts = path.split(/[/\\]/);
    if (parts.length > 1) {
      parts.pop(); 
      const base = parts.join('/');
      if (base) rootFolders.add(base);
    }
  });
  
  return Array.from(rootFolders).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

// ═══════════════════════════════════════════════════════════
// DOWNLOAD RECORDS
// ═══════════════════════════════════════════════════════════

export function upsertDownloadRecord({ media_item_id, instance_id, torrent_hash, torrent_name, ratio, ratio_limit, state, done_seeding, seeding_time_seconds, seeding_time_limit }) {
  getDb().prepare(`
    INSERT INTO download_records (media_item_id, instance_id, torrent_hash, torrent_name, ratio, ratio_limit, state, done_seeding, seeding_time_seconds, seeding_time_limit, last_checked)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      ratio = excluded.ratio, ratio_limit = excluded.ratio_limit, state = excluded.state,
      done_seeding = excluded.done_seeding, seeding_time_seconds = excluded.seeding_time_seconds,
      seeding_time_limit = excluded.seeding_time_limit, last_checked = datetime('now'),
      updated_at = datetime('now')
  `).run(media_item_id, instance_id || null, torrent_hash || null, torrent_name || null, ratio || 0, ratio_limit || -1, state || 'unknown', done_seeding ? 1 : 0, seeding_time_seconds || 0, seeding_time_limit || -1);
}

export function upsertDownloadRecordByHash({ media_item_id, instance_id, torrent_hash, torrent_name }) {
  if (!torrent_hash) return;
  const hash = torrent_hash.toLowerCase();
  const existing = getDb().prepare('SELECT id FROM download_records WHERE torrent_hash = ?').get(hash);
  if (existing) {
    getDb().prepare(`
      UPDATE download_records
      SET media_item_id = ?, torrent_name = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(media_item_id, torrent_name || null, existing.id);
  } else {
    getDb().prepare(`
      INSERT INTO download_records (media_item_id, instance_id, torrent_hash, torrent_name, last_checked)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(media_item_id, instance_id || null, hash, torrent_name || null);
  }
}

export function getDownloadsByMediaId(mediaId) {
  return getDb().prepare('SELECT * FROM download_records WHERE media_item_id = ?').all(mediaId);
}

export function updateDownloadByHash(hash, fields) {
  const sets = [];
  const values = [];
  for (const [key, value] of Object.entries(fields)) {
    sets.push(`${key} = ?`);
    values.push(value);
  }
  sets.push("updated_at = datetime('now')");
  sets.push("last_checked = datetime('now')");
  values.push(hash);
  getDb().prepare(`UPDATE download_records SET ${sets.join(', ')} WHERE torrent_hash = ?`).run(...values);
}

export function getDownloadByHash(hash) {
  return getDb().prepare('SELECT * FROM download_records WHERE torrent_hash = ?').get(hash);
}

// ═══════════════════════════════════════════════════════════
// WATCH HISTORY
// ═══════════════════════════════════════════════════════════

export function addWatchHistory({ media_item_id, user_name, watched_at, duration_seconds, percent_complete, source }) {
  // Avoid duplicate entries for the same user/media/timestamp
  const existing = getDb().prepare(
    'SELECT id FROM watch_history WHERE media_item_id = ? AND user_name = ? AND watched_at = ?'
  ).get(media_item_id, user_name, watched_at);

  if (existing) return existing;

  const result = getDb().prepare(`
    INSERT INTO watch_history (media_item_id, user_name, watched_at, duration_seconds, percent_complete, source)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(media_item_id, user_name || 'unknown', watched_at, duration_seconds || 0, percent_complete || 0, source || 'tautulli');

  // Update the media item's last_watched_at
  getDb().prepare(`
    UPDATE media_items SET last_watched_at = MAX(COALESCE(last_watched_at, ''), ?), updated_at = datetime('now')
    WHERE id = ?
  `).run(watched_at, media_item_id);

  return { id: result.lastInsertRowid };
}

// ═══════════════════════════════════════════════════════════
// SYNC LOG
// ═══════════════════════════════════════════════════════════

export function createSyncLog({ instance_id, sync_type }) {
  const result = getDb().prepare(`
    INSERT INTO sync_log (instance_id, sync_type, status) VALUES (?, ?, 'running')
  `).run(instance_id || null, sync_type);
  return result.lastInsertRowid;
}

export function completeSyncLog(id, { status, message, items_processed }) {
  getDb().prepare(`
    UPDATE sync_log SET status = ?, message = ?, items_processed = ?, completed_at = datetime('now')
    WHERE id = ?
  `).run(status, message || null, items_processed || 0, id);
}

export function getLatestSyncStatus() {
  return getDb().prepare(`
    SELECT sl.*, i.name as instance_name, i.type as instance_type
    FROM sync_log sl
    LEFT JOIN instances i ON sl.instance_id = i.id
    ORDER BY sl.started_at DESC
    LIMIT 20
  `).all();
}

// ═══════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════

export function getSetting(key) {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

export function setSetting(key, value) {
  getDb().prepare(`
    INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(key, value);
}

export function getAllSettings() {
  const rows = getDb().prepare('SELECT * FROM app_settings').all();
  const settings = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

// ═══════════════════════════════════════════════════════════
// METRICS & ACTION LOGS
// ═══════════════════════════════════════════════════════════

export function logAction({ action_type, media_type, media_title, instance_id, size_freed_bytes, details }) {
  getDb().prepare(`
    INSERT INTO action_logs (action_type, media_type, media_title, instance_id, size_freed_bytes, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(action_type, media_type || null, media_title || null, instance_id || null, size_freed_bytes || 0, details ? JSON.stringify(details) : null);
}

export function upsertMetric({ date, metric_name, instance_id, root_folder, value }) {
  const db = getDb();
  // We handle manual existence check because SQLite UNIQUE constraints with NULLs don't trigger ON CONFLICT as expected for upsert
  const existing = db.prepare(`
    SELECT id FROM metrics_timeseries 
    WHERE date = ? AND metric_name = ? 
    AND (instance_id = ? OR (instance_id IS NULL AND ? IS NULL))
    AND (root_folder = ? OR (root_folder IS NULL AND ? IS NULL))
  `).get(date, metric_name, instance_id || null, instance_id || null, root_folder || null, root_folder || null);

  if (existing) {
    db.prepare('UPDATE metrics_timeseries SET value = ?, updated_at = datetime("now") WHERE id = ?').run(value, existing.id);
  } else {
    db.prepare(`
      INSERT INTO metrics_timeseries (date, metric_name, instance_id, root_folder, value)
      VALUES (?, ?, ?, ?, ?)
    `).run(date, metric_name, instance_id || null, root_folder || null, value);
  }
}

export function getHistoricalMetrics(days = 30, instanceId = null, rootFolder = null) {
  let query = `
    SELECT date, metric_name, AVG(value) as value
    FROM metrics_timeseries 
    WHERE date >= date('now', ?)
  `;
  const params = [`-${days} days`];

  if (instanceId) {
    query += ` AND instance_id = ? AND metric_name IN ('instance_size_bytes', 'instance_item_count')`;
    params.push(instanceId);
  } else if (rootFolder) {
    query += ` AND root_folder = ? AND metric_name IN ('folder_size_bytes', 'folder_item_count')`;
    params.push(rootFolder);
  } else {
    // Global metrics
    query += ` AND instance_id IS NULL AND root_folder IS NULL`;
  }

  // If over 30 days, we only want 1 value per day. Since they are stored daily, grouping by date works.
  query += ` GROUP BY date, metric_name ORDER BY date ASC`;

  let results = getDb().prepare(query).all(...params);
  
  // Transform folder/instance metrics into expected global metrics for the UI to display them correctly
  results = results.map(row => {
    if (row.metric_name === 'instance_size_bytes' || row.metric_name === 'folder_size_bytes') {
      return { ...row, metric_name: 'total_size_bytes' };
    }
    if (row.metric_name === 'instance_item_count' || row.metric_name === 'folder_item_count') {
      return { ...row, metric_name: 'total_movies' }; // UI uses total_movies for item count growth
    }
    return row;
  });
  
  return results;
}

export function getActionSummary(instanceId = null, rootFolder = null) {
  let whereClause = `WHERE action_type = 'media_deleted'`;
  const params = [];

  if (instanceId) {
    whereClause += ` AND instance_id = ?`;
    params.push(instanceId);
  }
  
  if (rootFolder) {
    whereClause += ` AND details LIKE ?`; // Fallback, details contains full path theoretically
    params.push(`%${rootFolder}%`);
  }

  const totalDeleted = getDb().prepare(`
    SELECT COUNT(DISTINCT media_title || strftime('%Y-%m-%d %H:%M', created_at)) as count, SUM(size_freed_bytes) as total_bytes 
    FROM action_logs 
    ${whereClause}
  `).get(...params);

  const deletedPerInstance = getDb().prepare(`
    SELECT a.instance_id, i.name as instance_name, i.type as instance_type, COUNT(*) as count, SUM(a.size_freed_bytes) as total_bytes
    FROM action_logs a
    LEFT JOIN instances i ON a.instance_id = i.id
    ${whereClause}
    GROUP BY a.instance_id
  `).all(...params);

  return { totalDeleted, deletedPerInstance };
}

export function getDeletionLogs(limit = 100, offset = 0) {
  const countQuery = getDb().prepare(`
    SELECT COUNT(DISTINCT media_title || strftime('%Y-%m-%d %H:%M', created_at)) as total
    FROM action_logs
    WHERE action_type = 'media_deleted'
  `).get();

  const logs = getDb().prepare(`
    SELECT 
      media_title, 
      media_type,
      MAX(details) as details,
      SUM(size_freed_bytes) as total_size_freed,
      MIN(created_at) as deleted_at
    FROM action_logs
    WHERE action_type = 'media_deleted'
    GROUP BY media_title, strftime('%Y-%m-%d %H:%M', created_at)
    ORDER BY deleted_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);

  return {
    total: countQuery.total,
    logs: logs.map(l => ({
      title: l.media_title,
      type: l.media_type,
      freed_bytes: l.total_size_freed,
      deleted_at: l.deleted_at,
      details: l.details ? JSON.parse(l.details) : null
    })),
    limit,
    offset
  };
}

// ═══════════════════════════════════════════════════════════
// MEDIA REQUESTS
// ═══════════════════════════════════════════════════════════

export function upsertMediaRequest({ media_item_id, external_id, requested_by_name, requested_by_avatar, requested_by_id, requested_at, type }) {
  getDb().prepare(`
    INSERT INTO media_requests (media_item_id, external_id, requested_by_name, requested_by_avatar, requested_by_id, requested_at, type, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(media_item_id, external_id) DO UPDATE SET
      requested_by_name = excluded.requested_by_name,
      requested_by_avatar = excluded.requested_by_avatar,
      requested_by_id = excluded.requested_by_id,
      requested_at = excluded.requested_at,
      type = excluded.type,
      updated_at = datetime('now')
  `).run(media_item_id, external_id, requested_by_name || null, requested_by_avatar || null, requested_by_id || null, requested_at || null, type || null);
}

export function getUniqueRequesters() {
  return getDb().prepare(`
    SELECT DISTINCT requested_by_name, requested_by_avatar, requested_by_id 
    FROM media_requests 
    WHERE requested_by_name IS NOT NULL
    ORDER BY LOWER(requested_by_name) ASC
  `).all();
}
