import { Router } from 'express';
import * as queries from '../database/queries.js';
import { RadarrClient } from '../services/radarr.js';
import { SonarrClient } from '../services/sonarr.js';
import { SeerrClient } from '../services/seerr.js';
import { QBittorrentClient } from '../services/qbittorrent.js';
import { logger } from '../logger.js';

const router = Router();

// GET /api/media — list media with filters and sorting
router.get('/', (req, res) => {
  try {
    const { sort, order, mediaType, seedingStatus, search, limit, offset } = req.query;
    const result = queries.getMediaItems({
      sort,
      order,
      mediaType,
      seedingStatus,
      search,
      limit: limit ? parseInt(limit, 10) : 100,
      offset: offset ? parseInt(offset, 10) : 0,
    });
    res.json(result);
  } catch (error) {
    logger.error('Failed to get media:', error);
    res.status(500).json({ error: 'Failed to get media' });
  }
});

// GET /api/media/:id — get detailed media info
router.get('/:id', (req, res) => {
  try {
    const detail = queries.getMediaItemDetail(parseInt(req.params.id, 10));
    if (!detail) return res.status(404).json({ error: 'Media not found' });
    res.json(detail);
  } catch (error) {
    logger.error('Failed to get media detail:', error);
    res.status(500).json({ error: 'Failed to get media detail' });
  }
});

// DELETE /api/media/:id — nuclear delete from all services
router.delete('/:id', async (req, res) => {
  try {
    const mediaId = parseInt(req.params.id, 10);
    const detail = queries.getMediaItemDetail(mediaId);
    if (!detail) return res.status(404).json({ error: 'Media not found' });

    const results = {
      radarr: [],
      sonarr: [],
      seerr: [],
      downloads: [],
    };

    // 1. Delete from all Radarr/Sonarr instances
    for (const mi of detail.instances) {
      try {
        const instance = queries.getInstanceById(mi.instance_id);
        if (!instance) continue;

        if (mi.instance_type === 'radarr') {
          const client = new RadarrClient(instance);
          logger.info(`Calling Radarr [${instance.name}] to delete movie "${detail.title}" (ID: ${mi.external_id})`);
          const result = await client.deleteMovie(mi.external_id, true);
          results.radarr.push({ instance: mi.instance_name, ...result });
        } else if (mi.instance_type === 'sonarr') {
          const client = new SonarrClient(instance);
          logger.info(`Calling Sonarr [${instance.name}] to delete series "${detail.title}" (ID: ${mi.external_id})`);
          const result = await client.deleteSeries(mi.external_id, true);
          results.sonarr.push({ instance: mi.instance_name, ...result });
        }
      } catch (error) {
        logger.error(`Failed to delete from ${mi.instance_type} [${mi.instance_name}]: ${error.message}`);
      }
    }

    // 2. Delete from Seerr/Overseerr
    const seerrInstances = queries.getInstancesByType('seerr');
    for (const seerrInstance of seerrInstances) {
      try {
        const client = new SeerrClient(seerrInstance);
        
        let result = null;
        if (detail.tmdb_id) {
          const mediaType = detail.media_type === 'movie' ? 'movie' : 'tv';
          logger.info(`Calling Seerr [${seerrInstance.name}] to delete ${mediaType} "${detail.title}" (TMDB ID: ${detail.tmdb_id})`);
          result = await client.deleteMediaAndRequestsByTmdbId(detail.tmdb_id, mediaType);
        } else if (detail.tvdb_id && detail.media_type === 'series') {
          // If we only have TVDB ID, we must find the TMDB ID from Seerr/Overseerr first
          // because the /tv/:tmdbId endpoint expects TMDB ID.
          logger.info(`Searching Seerr [${seerrInstance.name}] for TVDB ID ${detail.tvdb_id} to delete "${detail.title}"`);
          const seerrMedia = await client.getTvByTvdbId(detail.tvdb_id);
          if (seerrMedia && seerrMedia.tmdbId) {
            logger.info(`Calling Seerr [${seerrInstance.name}] to delete series "${detail.title}" (TMDB ID: ${seerrMedia.tmdbId})`);
            result = await client.deleteMediaAndRequestsByTmdbId(seerrMedia.tmdbId, 'tv');
          } else {
            logger.warn(`Could not find TMDB ID for TVDB ID ${detail.tvdb_id} in Seerr [${seerrInstance.name}]`);
          }
        }

        if (result && result.success) {
          results.seerr.push({ instance: seerrInstance.name, ...result });
        }
      } catch (error) {
        logger.error(`Failed to delete from Seerr [${seerrInstance.name}]: ${error.message}`);
      }
    }

    // 3. Delete from download clients
    if (detail.downloads && detail.downloads.length > 0) {
      const qbtInstances = queries.getInstancesByType('qbittorrent');
      for (const qbtInstance of qbtInstances) {
        try {
          const client = new QBittorrentClient(qbtInstance);
          await client.connect();

          for (const dl of detail.downloads) {
            if (dl.torrent_hash) {
              logger.info(`Calling qBittorrent [${qbtInstance.name}] to delete torrent for "${detail.title}" (Hash: ${dl.torrent_hash})`);
              const result = await client.deleteTorrent(dl.torrent_hash, true);
              results.downloads.push({
                instance: qbtInstance.name,
                hash: dl.torrent_hash,
                ...result,
              });
            }
          }
        } catch (error) {
          logger.error(`Failed to delete from qBittorrent [${qbtInstance.name}]: ${error.message}`);
        }
      }
    }

    // 4. Log actions for statistics before deleting
    for (const inst of detail.instances) {
      queries.logAction({
        action_type: 'media_deleted',
        media_type: detail.media_type,
        media_title: detail.title,
        instance_id: inst.instance_id,
        size_freed_bytes: inst.size_bytes || 0,
        details: {
          imdb_id: detail.imdb_id,
          tvdb_id: detail.tvdb_id,
          tmdb_id: detail.tmdb_id,
          year: detail.year
        }
      });
    }

    // 5. Delete from local database
    queries.deleteMediaItem(mediaId);

    logger.info(`Nuclear delete completed for "${detail.title}" (ID: ${mediaId})`);
    res.json({ success: true, title: detail.title, results });
  } catch (error) {
    logger.error('Nuclear delete failed:', error);
    res.status(500).json({ error: 'Nuclear delete failed' });
  }
});

export default router;
