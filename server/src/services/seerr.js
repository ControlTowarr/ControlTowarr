import axios from 'axios';
import { logger } from '../logger.js';

/**
 * Seerr/Overseerr API client.
 * Auto-detects whether the instance is Seerr (merged project) or legacy Overseerr.
 * The v1 API is identical for both, but this client tracks the variant for logging.
 */
export class SeerrClient {
  constructor(instance) {
    this.instance = instance;
    this.variant = 'unknown'; // 'seerr' or 'overseerr'
    this.client = axios.create({
      baseURL: `${instance.url}/api/v1`,
      headers: { 'X-Api-Key': instance.api_key },
      timeout: 30000,
    });
  }

  async testConnection() {
    try {
      const response = await this.client.get('/status');
      const data = response.data;

      // Detect variant — Seerr includes an "appTitle" or specific version format
      this.variant = data.appTitle?.toLowerCase().includes('seerr') && !data.appTitle?.toLowerCase().includes('overseerr')
        ? 'seerr'
        : 'overseerr';

      return {
        success: true,
        version: data.version,
        variant: this.variant,
        commitTag: data.commitTag,
      };
    } catch (error) {
      const status = error.response?.status || 'unknown';
      const data = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
      logger.error(`Seerr test connection failed for ${this.instance.name} with status ${status}: ${data}. URL: ${error.config?.url}`);
      return { success: false, error: error.message };
    }
  }

  async getTvByTvdbId(tvdbId) {
    try {
      // Overseerr search doesn't easily support direct tvdb: prefix in all versions
      // But we can use the /media endpoint with filters
      const response = await this.client.get('/media', {
        params: { tvdbId, take: 1 }
      });
      // The response structure for /media is { pageInfo: {}, results: [] }
      return response.data?.results?.[0] || null;
    } catch (error) {
      const status = error.response?.status || 'unknown';
      const data = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
      logger.error(`Seerr getTvByTvdbId failed with status ${status}: ${data}. URL: ${error.config?.url}`);
      return null;
    }
  }

  async deleteMediaAndRequestsByTmdbId(tmdbId, mediaType = 'movie') {
    try {
      const endpoint = mediaType === 'movie' ? `/movie/${tmdbId}` : `/tv/${tmdbId}`;
      const response = await this.client.get(endpoint);
      const mediaInfo = response.data?.mediaInfo;
      
      if (!mediaInfo) {
        return { success: true, message: 'Not in Seerr' };
      }

      let deletedRequests = 0;
      if (mediaInfo.requests && mediaInfo.requests.length > 0) {
        for (const req of mediaInfo.requests) {
          try {
            await this.client.delete(`/request/${req.id}`);
            logger.info(`Successfully deleted Seerr request ${req.id} for ${mediaType} ${tmdbId}`);
            deletedRequests++;
          } catch (e) {
            logger.warn(`Failed to delete Seerr request ${req.id}: ${e.message}`);
          }
        }
      }

      if (mediaInfo.id) {
        try {
          await this.client.delete(`/media/${mediaInfo.id}`);
          logger.info(`Successfully deleted Seerr media ${mediaInfo.id} for ${mediaType} ${tmdbId}`);
        } catch (e) {
          logger.warn(`Failed to delete Seerr media ${mediaInfo.id}: ${e.message}`);
        }
      }

      return { success: true, deletedRequests };
    } catch (error) {
      if (error.response?.status === 404) {
        return { success: true, message: 'Not found/already deleted' };
      }
      const status = error.response?.status || 'unknown';
      const data = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
      logger.error(`Seerr deleteMediaAndRequestsByTmdbId failed with status ${status}: ${data}. URL: ${error.config?.url}`);
      return { success: false, error: error.message };
    }
  }

  async getRequests(take = 100, skip = 0) {
    try {
      const response = await this.client.get('/request', {
        params: { take, skip, sort: 'added' }
      });
      return response.data; // { pageInfo: { page, pages, results, total }, results: [...] }
    } catch (error) {
      const status = error.response?.status || 'unknown';
      const data = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
      logger.error(`Seerr getRequests failed with status ${status}: ${data}. URL: ${error.config?.url}`);
      return { results: [], pageInfo: { total: 0 } };
    }
  }
}
