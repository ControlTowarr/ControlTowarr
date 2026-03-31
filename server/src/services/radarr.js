import axios from 'axios';
import { logger } from '../logger.js';

export class RadarrClient {
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
      if (response.data.appName && response.data.appName !== 'Radarr') {
        return { success: false, error: `Invalid instance type: Expected Radarr, connected to ${response.data.appName}` };
      }
      return {
        success: true,
        version: response.data.version,
        instanceName: response.data.instanceName,
      };
    } catch (error) {
      const status = error.response?.status || 'unknown';
      const data = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
      logger.error(`Radarr test connection failed for ${this.instance.name} with status ${status}: ${data}. URL: ${error.config?.url}`);
      return { success: false, error: error.message };
    }
  }

  async getMovies() {
    try {
      const response = await this.client.get('/movie');
      if (!Array.isArray(response.data)) {
        throw new Error('Invalid response from Radarr API (expected an array). Ensure the URL points to the Radarr root without /api at the end.');
      }
      return response.data.map(movie => ({
        externalId: movie.id,
        externalSlug: movie.tmdbId ? String(movie.tmdbId) : null,
        title: movie.title,
        imdbId: movie.imdbId || null,
        tmdbId: movie.tmdbId ? String(movie.tmdbId) : null,
        year: movie.year,
        overview: movie.overview,
        posterUrl: this._getPosterUrl(movie),
        path: movie.path,
        sizeBytes: movie.sizeOnDisk || 0,
        hasFile: movie.hasFile,
        quality: movie.movieFile?.quality?.quality?.name || null,
        status: movie.monitored ? 'monitored' : 'unmonitored',
        dateAdded: movie.added,
      }));
    } catch (error) {
      const status = error.response?.status || 'unknown';
      const data = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
      logger.error(`Radarr getMovies failed for ${this.instance.name} with status ${status}: ${data}. URL: ${error.config?.url}`);
      throw error;
    }
  }

  async deleteMovie(externalId, deleteFiles = true, addImportExclusion = false) {
    try {
      await this.client.delete(`/movie/${externalId}`, {
        params: { deleteFiles, addImportExclusion },
      });
      logger.info(`Successfully deleted movie ${externalId} from Radarr instance ${this.instance.name}`);
      return { success: true };
    } catch (error) {
      const status = error.response?.status || 'unknown';
      const data = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
      logger.error(`Radarr deleteMovie failed for ${this.instance.name} with status ${status}: ${data}. URL: ${error.config?.url}`);
      return { success: false, error: error.message };
    }
  }

  async getQueue() {
    try {
      const response = await this.client.get('/queue', {
        params: { pageSize: 1000, includeUnknownMovieItems: false },
      });
      return response.data.records || [];
    } catch (error) {
      const status = error.response?.status || 'unknown';
      const data = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
      logger.error(`Radarr getQueue failed for ${this.instance.name} with status ${status}: ${data}. URL: ${error.config?.url}`);
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
      logger.error(`Radarr getHistory failed for ${this.instance.name} with status ${status}: ${data}. URL: ${error.config?.url}`);
      return [];
    }
  }

  _getPosterUrl(movie) {
    const poster = movie.images?.find(img => img.coverType === 'poster');
    if (poster?.remoteUrl) return poster.remoteUrl;
    if (poster?.url) return `${this.instance.url}${poster.url}`;
    return null;
  }
}
