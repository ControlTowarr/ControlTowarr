import { logger } from '../logger.js';
import { getDb } from '../database/schema.js';
import * as queries from '../database/queries.js';
import { matchAndUpsertMedia } from './mediaMatcher.js';
import { RadarrClient } from '../services/radarr.js';
import { SonarrClient } from '../services/sonarr.js';
import { TautulliClient } from '../services/tautulli.js';
import { PlexClient } from '../services/plex.js';
import { SeerrClient } from '../services/seerr.js';
import { QBittorrentClient } from '../services/qbittorrent.js';

let syncTimeout = null;
let isSyncing = false;
let currentIntervalMinutes = 60;

export function startSyncScheduler(intervalMinutes = 60) {
  if (syncTimeout) {
    logger.info('Stopping previous sync scheduler...');
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }

  currentIntervalMinutes = intervalMinutes;
  
  // Schedule the first run
  scheduleNextSync();
  
  logger.info(`Sync scheduler started: every ${intervalMinutes} minutes`);
}

function scheduleNextSync() {
  if (syncTimeout) clearTimeout(syncTimeout);
  
  const ms = currentIntervalMinutes * 60 * 1000;
  syncTimeout = setTimeout(async () => {
    logger.info('Triggering scheduled sync...');
    try {
      await runFullSync();
    } catch (err) {
      logger.error('Scheduled sync failed:', err);
    } finally {
      // Always schedule the next one, even if this one failed
      scheduleNextSync();
    }
  }, ms);
}

export function stopSyncScheduler() {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }
}

export async function runFullSync() {
  if (isSyncing) {
    logger.warn('Sync already in progress, skipping');
    return { success: false, message: 'Sync already in progress' };
  }

  isSyncing = true;
  const startTime = Date.now();
  logger.info('Starting full sync...');

  try {
    // Sync Radarr instances
    const radarrInstances = queries.getInstancesByType('radarr');
    for (const instance of radarrInstances) {
      await syncRadarr(instance);
    }

    // Sync Sonarr instances
    const sonarrInstances = queries.getInstancesByType('sonarr');
    for (const instance of sonarrInstances) {
      await syncSonarr(instance);
    }

    // Sync Tautulli (watch history)
    const tautulliInstances = queries.getInstancesByType('tautulli');
    for (const instance of tautulliInstances) {
      await syncTautulli(instance);
    }

    // Sync Plex (watch history fallback)
    const plexInstances = queries.getInstancesByType('plex');
    for (const instance of plexInstances) {
      await syncPlex(instance);
    }
 
    // Sync Seerr (requests)
    const seerrInstances = queries.getInstancesByType('seerr');
    for (const instance of seerrInstances) {
      await syncSeerr(instance);
    }

    // Sync download clients (seeding status)
    const qbtInstances = queries.getInstancesByType('qbittorrent');
    for (const instance of qbtInstances) {
      await syncQBittorrent(instance);
    }

    // Update aggregated seeding status on media items
    updateMediaSeedingStatuses();

    // After sync, aggregate and save metrics for today
    await collectMetrics();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`Full sync completed in ${elapsed}s`);
    return { success: true, elapsed };
  } catch (error) {
    logger.error(`Full sync failed: ${error.message}`);
    return { success: false, error: error.message };
  } finally {
    isSyncing = false;
  }
}

async function syncRadarr(instance) {
  const logId = queries.createSyncLog({ instance_id: instance.id, sync_type: 'radarr' });

  try {
    const client = new RadarrClient(instance);
    const movies = await client.getMovies();
    const result = matchAndUpsertMedia(movies, instance.id, 'movie');

    // Extract torrent hashes from history
    const history = await client.getHistory();
    let hashedRecords = 0;
    const db = getDb();
    for (const record of history) {
      if (record.downloadId && record.downloadId.length === 40) {
        const mi = db.prepare('SELECT media_item_id FROM media_instances WHERE instance_id = ? AND external_id = ?').get(instance.id, record.movieId);
        if (mi) {
          queries.upsertDownloadRecordByHash({
            media_item_id: mi.media_item_id,
            instance_id: null,
            torrent_hash: record.downloadId,
            torrent_name: record.sourceTitle
          });
          hashedRecords++;
        }
      }
    }

    queries.updateInstanceLastSync(instance.id);
    queries.completeSyncLog(logId, {
      status: 'success',
      message: `Synced ${result.total} movies (${result.created} new). Extracted ${hashedRecords} hashes.`,
      items_processed: result.total,
    });
    logger.info(`Radarr sync [${instance.name}]: ${result.total} movies (${result.created} new), ${hashedRecords} history hashes`);
  } catch (error) {
    queries.completeSyncLog(logId, { status: 'failure', message: error.message });
    logger.error(`Radarr sync failed [${instance.name}]: ${error.message}`);
  }
}

async function syncSonarr(instance) {
  const logId = queries.createSyncLog({ instance_id: instance.id, sync_type: 'sonarr' });

  try {
    const client = new SonarrClient(instance);
    const series = await client.getSeries();
    const result = matchAndUpsertMedia(series, instance.id, 'series');

    // Extract torrent hashes from history
    const history = await client.getHistory();
    let hashedRecords = 0;
    const db = getDb();
    for (const record of history) {
      if (record.downloadId && record.downloadId.length === 40) {
        const mi = db.prepare('SELECT media_item_id FROM media_instances WHERE instance_id = ? AND external_id = ?').get(instance.id, record.seriesId);
        if (mi) {
          queries.upsertDownloadRecordByHash({
            media_item_id: mi.media_item_id,
            instance_id: null,
            torrent_hash: record.downloadId,
            torrent_name: record.sourceTitle
          });
          hashedRecords++;
        }
      }
    }

    queries.updateInstanceLastSync(instance.id);
    queries.completeSyncLog(logId, {
      status: 'success',
      message: `Synced ${result.total} series (${result.created} new). Extracted ${hashedRecords} hashes.`,
      items_processed: result.total,
    });
    logger.info(`Sonarr sync [${instance.name}]: ${result.total} series (${result.created} new), ${hashedRecords} history hashes`);
  } catch (error) {
    queries.completeSyncLog(logId, { status: 'failure', message: error.message });
    logger.error(`Sonarr sync failed [${instance.name}]: ${error.message}`);
  }
}

async function syncTautulli(instance) {
  const logId = queries.createSyncLog({ instance_id: instance.id, sync_type: 'tautulli' });

  try {
    const client = new TautulliClient(instance);
    let matchedTotal = 0;
    let processedHistory = 0;

    // 1. FULL LIBRARY SYNC (Efficiently get last_played for everything)
    const libraries = await client.getLibraries();
    for (const lib of libraries) {
      if (lib.section_type !== 'movie' && lib.section_type !== 'show') continue;

      const mediaType = lib.section_type === 'movie' ? 'movie' : 'series';
      const items = await client.getLibraryMediaInfo({ section_id: lib.section_id });
      
      for (const item of items) {
        if (!item.last_played) continue;

        // Tautulli media info uses 'title' for both movies and shows
        const mediaItem = queries.findMediaByTitle(item.title, mediaType);
        if (mediaItem) {
          const watchedAt = new Date(item.last_played * 1000).toISOString();
          queries.updateLastWatched(mediaItem.id, watchedAt);
          matchedTotal++;
        }
      }
    }

    // 2. BATCHED HISTORY SYNC (Get detailed user activity)
    // Fetch 5 batches of 500 to get a good amount of recent history
    const batchSize = 500;
    const numBatches = 5;
    
    for (let i = 0; i < numBatches; i++) {
      const history = await client.getHistory({ start: i * batchSize, length: batchSize });
      if (history.length === 0) break;

      for (const entry of history) {
        const title = entry.grandparent_title || entry.title;
        const mediaType = entry.media_type === 'movie' ? 'movie' : 'series';

        const mediaItem = queries.findMediaByTitle(title, mediaType);
        if (mediaItem) {
          const watchedAt = new Date(entry.stopped * 1000).toISOString();
          queries.addWatchHistory({
            media_item_id: mediaItem.id,
            user_name: entry.friendly_name || entry.user,
            watched_at: watchedAt,
            duration_seconds: entry.duration || 0,
            percent_complete: entry.percent_complete || 0,
            source: 'tautulli',
          });
        }
      }
      processedHistory += history.length;
    }

    queries.updateInstanceLastSync(instance.id);
    queries.completeSyncLog(logId, {
      status: 'success',
      message: `Full library sync matched ${matchedTotal} items. History sync processed ${processedHistory} entries.`,
      items_processed: matchedTotal,
    });
    logger.info(`Tautulli sync [${instance.name}]: ${matchedTotal} items matched in library, ${processedHistory} history entries processed`);
  } catch (error) {
    queries.completeSyncLog(logId, { status: 'failure', message: error.message });
    logger.error(`Tautulli sync failed [${instance.name}]: ${error.message}`);
  }
}

async function syncPlex(instance) {
  const logId = queries.createSyncLog({ instance_id: instance.id, sync_type: 'plex' });

  try {
    const client = new PlexClient(instance);
    const libraries = await client.getLibraries();
    let matched = 0;
    let totalItems = 0;

    for (const lib of libraries) {
      if (lib.type !== 'movie' && lib.type !== 'show') continue;

      const mediaType = lib.type === 'show' ? 'series' : 'movie';
      const items = await client.getLibraryMetadata(lib.key);
      totalItems += items.length;

      for (const item of items) {
        if (!item.lastViewedAt) continue;

        const title = item.title; // For 'show' type, 'title' is the show title
        const mediaItem = queries.findMediaByTitle(title, mediaType);
        
        if (mediaItem) {
          const watchedAt = new Date(item.lastViewedAt * 1000).toISOString();
          queries.updateLastWatched(mediaItem.id, watchedAt);

          // Also add a basic watch history record if it doesn't exist
          queries.addWatchHistory({
            media_item_id: mediaItem.id,
            user_name: 'Plex User',
            watched_at: watchedAt,
            duration_seconds: item.duration ? Math.floor(item.duration / 1000) : 0,
            percent_complete: (item.viewCount && item.viewCount > 0) ? 1.0 : 0.9,
            source: 'plex',
          });
          matched++;
        }
      }
    }

    queries.updateInstanceLastSync(instance.id);
    queries.completeSyncLog(logId, {
      status: 'success',
      message: `Processed ${totalItems} items across libraries, matched ${matched}`,
      items_processed: matched,
    });
    logger.info(`Plex sync [${instance.name}]: ${matched}/${totalItems} library items matched`);
  } catch (error) {
    queries.completeSyncLog(logId, { status: 'failure', message: error.message });
    logger.error(`Plex sync failed [${instance.name}]: ${error.message}`);
  }
}

async function syncQBittorrent(instance) {
  const logId = queries.createSyncLog({ instance_id: instance.id, sync_type: 'qbittorrent' });

  try {
    const client = new QBittorrentClient(instance);
    await client.connect();
    const torrents = await client.getTorrents();

    let matched = 0;
    // Build a lookup of torrent hashes to torrent data
    const torrentMap = new Map(torrents.map(t => [t.hash.toLowerCase(), t]));

    // Get all download records and update their status
    const allMedia = queries.getMediaItems({ limit: 10000 });
    for (const media of allMedia.items) {
      const downloads = queries.getDownloadsByMediaId(media.id);
      for (const dl of downloads) {
        if (dl.torrent_hash) {
          const torrent = torrentMap.get(dl.torrent_hash.toLowerCase());
          if (torrent) {
            queries.updateDownloadByHash(dl.torrent_hash, {
              ratio: torrent.ratio,
              ratio_limit: torrent.ratioLimit,
              state: torrent.state,
              done_seeding: torrent.doneSeeding ? 1 : 0,
              seeding_time_seconds: torrent.seedingTimeSeconds,
              seeding_time_limit: torrent.seedingTimeLimit,
            });
            matched++;
          } else {
            // Torrent not found in client — mark as done/missing
            queries.updateDownloadByHash(dl.torrent_hash, {
              state: 'missing',
              done_seeding: 1,
            });
          }
        }
      }
    }

    queries.updateInstanceLastSync(instance.id);
    queries.completeSyncLog(logId, {
      status: 'success',
      message: `Updated ${matched} download records from ${torrents.length} torrents`,
      items_processed: matched,
    });
    logger.info(`qBittorrent sync [${instance.name}]: ${matched} records updated`);
  } catch (error) {
    queries.completeSyncLog(logId, { status: 'failure', message: error.message });
    logger.error(`qBittorrent sync failed [${instance.name}]: ${error.message}`);
  }
}

async function syncSeerr(instance) {
  const logId = queries.createSyncLog({ instance_id: instance.id, sync_type: 'seerr' });

  try {
    const client = new SeerrClient(instance);
    let totalRequests = 0;
    let matchedRequests = 0;
    let skip = 0;
    const take = 100;

    while (true) {
      const data = await client.getRequests(take, skip);
      if (!data.results || data.results.length === 0) break;

      for (const req of data.results) {
        totalRequests++;
        
        // Find media item by TMDB/TVDB ID
        const mediaType = req.type === 'movie' ? 'movie' : 'series';
        const mediaItem = queries.findMediaByExternalId({
          tmdb_id: req.media?.tmdbId ? String(req.media.tmdbId) : null,
          tvdb_id: req.media?.tvdbId ? String(req.media.tvdbId) : null,
        });

        if (mediaItem) {
          queries.upsertMediaRequest({
            media_item_id: mediaItem.id,
            external_id: req.id,
            requested_by_name: req.requestedBy?.displayName || req.requestedBy?.email,
            requested_by_avatar: req.requestedBy?.avatar,
            requested_by_id: req.requestedBy?.id,
            requested_at: req.createdAt,
            type: req.is4k ? '4k' : 'standard',
          });
          matchedRequests++;
        }
      }

      if (data.results.length < take) break;
      skip += take;
    }

    queries.updateInstanceLastSync(instance.id);
    queries.completeSyncLog(logId, {
      status: 'success',
      message: `Processed ${totalRequests} requests, matched ${matchedRequests} to local items.`,
      items_processed: matchedRequests,
    });
    logger.info(`Seerr sync [${instance.name}]: ${matchedRequests}/${totalRequests} requests matched`);
  } catch (error) {
    queries.completeSyncLog(logId, { status: 'failure', message: error.message });
    logger.error(`Seerr sync failed [${instance.name}]: ${error.message}`);
  }
}

/**
 * Update the aggregated seeding_status field on media_items
 * based on their download_records.
 */
function updateMediaSeedingStatuses() {
  const db = getDb();

  // Media with at least one download record
  const mediaWithDownloads = db.prepare(`
    SELECT DISTINCT media_item_id FROM download_records
  `).all();

  for (const { media_item_id } of mediaWithDownloads) {
    const records = db.prepare(`
      SELECT done_seeding, state FROM download_records WHERE media_item_id = ?
    `).all(media_item_id);

    let status = 'unknown';
    if (records.length > 0) {
      const allDone = records.every(r => r.done_seeding === 1);
      const anySeeding = records.some(r => !r.done_seeding && r.state !== 'missing' && r.state !== 'unknown');

      if (allDone) {
        status = 'done';
      } else if (anySeeding) {
        status = 'seeding';
      }
    }

    db.prepare('UPDATE media_items SET seeding_status = ? WHERE id = ?').run(status, media_item_id);
  }
}

async function collectMetrics() {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  
  try {
    // 1. Total Metrics
    const totalMovies = db.prepare("SELECT COUNT(*) as count FROM media_items WHERE media_type = 'movie'").get().count;
    const totalSeries = db.prepare("SELECT COUNT(*) as count FROM media_items WHERE media_type = 'series'").get().count;
    const totalSize = db.prepare('SELECT SUM(size_bytes) as total FROM media_instances').get().total || 0;

    queries.upsertMetric({ date: today, metric_name: 'total_movies', value: totalMovies });
    queries.upsertMetric({ date: today, metric_name: 'total_series', value: totalSeries });
    queries.upsertMetric({ date: today, metric_name: 'total_size_bytes', value: totalSize });

    // 2. Per-Instance Metrics
    const instancesCount = db.prepare('SELECT instance_id, COUNT(DISTINCT media_item_id) as count FROM media_instances GROUP BY instance_id').all();
    for (const row of instancesCount) {
      queries.upsertMetric({ date: today, metric_name: 'instance_item_count', instance_id: row.instance_id, value: row.count });
    }

    const instancesSize = db.prepare('SELECT instance_id, SUM(size_bytes) as total FROM media_instances GROUP BY instance_id').all();
    for (const row of instancesSize) {
      queries.upsertMetric({ date: today, metric_name: 'instance_size_bytes', instance_id: row.instance_id, value: row.total || 0 });
    }

    // 3. Per-Root Folder Metrics
    const rootFolders = queries.getRootFolders();
    for (const folder of rootFolders) {
      const folderStats = db.prepare('SELECT COUNT(DISTINCT media_item_id) as count, SUM(size_bytes) as total FROM media_instances WHERE path LIKE ?').get(folder + '/%');
      queries.upsertMetric({ 
        date: today, 
        metric_name: 'folder_item_count', 
        root_folder: folder, 
        value: folderStats.count || 0 
      });
      queries.upsertMetric({ 
        date: today, 
        metric_name: 'folder_size_bytes', 
        root_folder: folder, 
        value: folderStats.total || 0 
      });
    }

    logger.info(`Collected daily metrics for ${today} (${rootFolders.length} folders)`);
  } catch (error) {
    logger.error(`Failed to collect daily metrics: ${error.message}`);
  }
}

export function getSyncStatus() {
  return {
    isSyncing,
    recentLogs: queries.getLatestSyncStatus(),
  };
}
