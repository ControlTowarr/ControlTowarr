import axios from 'axios';
import { logger } from '../logger.js';

export class TautulliClient {
  constructor(instance) {
    this.instance = instance;
    this.baseUrl = instance.url;
    this.apiKey = instance.api_key;
  }

  _buildUrl(cmd, params = {}) {
    const url = new URL(`${this.baseUrl}/api/v2`);
    url.searchParams.set('apikey', this.apiKey);
    url.searchParams.set('cmd', cmd);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  async testConnection() {
    try {
      const response = await axios.get(this._buildUrl('get_tautulli_info'), { timeout: 15000 });
      const data = response.data?.response?.data;
      return {
        success: true,
        version: data?.tautulli_version,
      };
    } catch (error) {
      const status = error.response?.status || 'unknown';
      const data = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
      logger.error(`Tautulli test connection failed for ${this.instance.name} with status ${status}: ${data}. URL: ${error.config?.url}`);
      return { success: false, error: error.message };
    }
  }

  async getHistory({ length = 500, start = 0, mediaType, startDate } = {}) {
    try {
      const params = { length, start };
      if (mediaType) params.media_type = mediaType;
      if (startDate) params.start_date = startDate;

      const response = await axios.get(this._buildUrl('get_history', params), { timeout: 30000 });
      const data = response.data?.response?.data;
      return data?.data || [];
    } catch (error) {
      const status = error.response?.status || 'unknown';
      const data = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
      logger.error(`Tautulli getHistory failed for ${this.instance.name} (start=${start}) with status ${status}: ${data}. URL: ${error.config?.url}`);
      return [];
    }
  }

  async getLibraries() {
    try {
      const response = await axios.get(this._buildUrl('get_libraries'), { timeout: 15000 });
      return response.data?.response?.data || [];
    } catch (error) {
      const status = error.response?.status || 'unknown';
      const data = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
      logger.error(`Tautulli getLibraries failed for ${this.instance.name} with status ${status}: ${data}. URL: ${error.config?.url}`);
      return [];
    }
  }

  async getLibraryMediaInfo({ section_id, length = 10000, start = 0 } = {}) {
    try {
      const params = { section_id, length, start };
      const response = await axios.get(this._buildUrl('get_library_media_info', params), { timeout: 60000 });
      const data = response.data?.response?.data;
      // This command returns an array of media items in data.data or similar structure
      return data?.data || [];
    } catch (error) {
      const status = error.response?.status || 'unknown';
      const data = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
      logger.error(`Tautulli getLibraryMediaInfo failed for ${this.instance.name} (section=${section_id}) with status ${status}: ${data}. URL: ${error.config?.url}`);
      return [];
    }
  }

  async getMetadata(ratingKey) {
    try {
      const response = await axios.get(this._buildUrl('get_metadata', { rating_key: ratingKey }), { timeout: 15000 });
      return response.data?.response?.data || null;
    } catch (error) {
      const status = error.response?.status || 'unknown';
      const data = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
      logger.error(`Tautulli getMetadata failed with status ${status}: ${data}. URL: ${error.config?.url}`);
      return null;
    }
  }
}
