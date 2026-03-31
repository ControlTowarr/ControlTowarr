import axios from 'axios';
import { logger } from '../logger.js';

export class SonarrClient {
  constructor(instance) {
    this.instance = instance;
    this.client = axios.create({
      baseURL: `${instance.url}/api/v3`,
      headers: { 'X-Api-Key': instance.api_key },
      timeout: 30000,
    });
  }

  async testConnection() {
    try {
      const response = await this.client.get('/system/status');
      if (response.data.appName && response.data.appName !== 'Sonarr') {
        return { success: false, error: `Invalid instance type: Expected Sonarr, connected to ${response.data.appName}` };
      }
      return {
        success: true,
        version: response.data.version,
        instanceName: response.data.instanceName,
      };
    } catch (error) {
      const status = error.response?.status || 'unknown';
      const data = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
      logger.error(`Sonarr test connection failed for ${this.instance.name} with status ${status}: ${data}. URL: ${error.config?.url}`);
      return { success: false, error: error.message };
    }
  }

  async getSeries() {
    try {
      const response = await this.client.get('/series');
      if (!Array.isArray(response.data)) {
        throw new Error('Invalid response from Sonarr API (expected an array). Ensure the URL points to the Sonarr root without /api at the end.');
      }
      return response.data.map(series => ({
        externalId: series.id,
        externalSlug: series.titleSlug || null,
        title: series.title,
        imdbId: series.imdbId || null,
        tvdbId: series.tvdbId ? String(series.tvdbId) : null,
        tmdbId: series.tmdbId ? String(series.tmdbId) : null,
        year: series.year,
        overview: series.overview,
        posterUrl: this._getPosterUrl(series),
        path: series.path,
        sizeBytes: series.statistics?.sizeOnDisk || 0,
        hasFile: (series.statistics?.episodeFileCount || 0) > 0,
        quality: null,
        status: series.monitored ? 'monitored' : 'unmonitored',
        dateAdded: series.added,
      }));
    } catch (error) {
      const status = error.response?.status || 'unknown';
      const data = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
      logger.error(`Sonarr getSeries failed for ${this.instance.name} with status ${status}: ${data}. URL: ${error.config?.url}`);
      throw error;
    }
  }

  async deleteSeries(externalId, deleteFiles = true) {
    try {
      await this.client.delete(`/series/${externalId}`, {
        params: { deleteFiles },
      });
      logger.info(`Successfully deleted series ${externalId} from Sonarr instance ${this.instance.name}`);
      return { success: true };
    } catch (error) {
      const status = error.response?.status || 'unknown';
      const data = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
      logger.error(`Sonarr deleteSeries failed for ${this.instance.name} with status ${status}: ${data}. URL: ${error.config?.url}`);
      return { success: false, error: error.message };
    }
  }

  async getQueue() {
    try {
      const response = await this.client.get('/queue', {
        params: { pageSize: 1000, includeUnknownSeriesItems: false },
      });
      return response.data.records || [];
    } catch (error) {
      const status = error.response?.status || 'unknown';
      const data = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
      logger.error(`Sonarr getQueue failed for ${this.instance.name} with status ${status}: ${data}. URL: ${error.config?.url}`);
      return [];
    }
  }

  async getHistory() {
    try {
      const response = await this.client.get('/history', {
        params: { page: 1, pageSize: 10000, sortKey: 'date', sortDirection: 'descending' },
      });
      return response.data.records || [];
    } catch (error) {
      const status = error.response?.status || 'unknown';
      const data = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
      logger.error(`Sonarr getHistory failed for ${this.instance.name} with status ${status}: ${data}. URL: ${error.config?.url}`);
      return [];
    }
  }

  _getPosterUrl(series) {
    const poster = series.images?.find(img => img.coverType === 'poster');
    if (poster?.remoteUrl) return poster.remoteUrl;
    if (poster?.url) return `${this.instance.url}${poster.url}`;
    return null;
  }
}
