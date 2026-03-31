import { logger } from '../logger.js';
import * as queries from '../database/queries.js';

/**
 * Matches media from Radarr/Sonarr to unified media_items records.
 * Groups by IMDB/TVDB/TMDB ID to deduplicate across instances.
 */
export function matchAndUpsertMedia(items, instanceId, mediaType) {
  let created = 0;
  let updated = 0;

  for (const item of items) {
    try {
      // Try to find existing media item by external IDs
      let mediaItem = queries.findMediaByExternalId({
        imdb_id: item.imdbId,
        tvdb_id: item.tvdbId,
        tmdb_id: item.tmdbId,
      });

      if (!mediaItem) {
        // Create new media item
        mediaItem = queries.createMediaItem({
          title: item.title,
          media_type: mediaType,
          imdb_id: item.imdbId,
          tvdb_id: item.tvdbId,
          tmdb_id: item.tmdbId,
          poster_url: item.posterUrl,
          overview: item.overview,
          year: item.year,
          status: item.status,
          added_at: item.dateAdded,
        });
        created++;
      } else {
        // Update existing with latest info (prefer non-null values)
        const updateFields = {};
        if (item.posterUrl && !mediaItem.poster_url) updateFields.poster_url = item.posterUrl;
        if (item.overview && !mediaItem.overview) updateFields.overview = item.overview;
        if (item.imdbId && !mediaItem.imdb_id) updateFields.imdb_id = item.imdbId;
        if (item.tvdbId && !mediaItem.tvdb_id) updateFields.tvdb_id = item.tvdbId;
        if (item.tmdbId && !mediaItem.tmdb_id) updateFields.tmdb_id = item.tmdbId;

        // Use the earliest added_at date
        if (item.dateAdded && (!mediaItem.added_at || item.dateAdded < mediaItem.added_at)) {
          updateFields.added_at = item.dateAdded;
        }

        if (Object.keys(updateFields).length > 0) {
          queries.updateMediaItem(mediaItem.id, updateFields);
          updated++;
        }
      }

      // Upsert the junction record (which instance has this media)
      queries.upsertMediaInstance({
        media_item_id: mediaItem.id,
        instance_id: instanceId,
        external_id: item.externalId,
        external_slug: item.externalSlug,
        path: item.path,
        size_bytes: item.sizeBytes,
        has_file: item.hasFile,
        quality: item.quality,
        date_added: item.dateAdded,
      });
    } catch (error) {
      logger.error(`Failed to match media "${item.title}": ${error.message}`);
    }
  }

  return { created, updated, total: items.length };
}
