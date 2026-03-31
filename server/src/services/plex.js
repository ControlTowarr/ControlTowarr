import axios from 'axios';
import { logger } from '../logger.js';

export class PlexClient {
  constructor(instance) {
    this.instance = instance;
    this.client = axios.create({
      baseURL: instance.url,
      headers: { 'X-Plex-Token': instance.api_key, Accept: 'application/json' },
      timeout: 30000,
    });
  }

  async testConnection() {
    try {
      const response = await this.client.get('/');
      return {
        success: true,
        friendlyName: response.data?.MediaContainer?.friendlyName,
        version: response.data?.MediaContainer?.version,
      };
    } catch (error) {
      const status = error.response?.status || 'unknown';
      const data = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
      logger.error(`Plex test connection failed for ${this.instance.name} with status ${status}: ${data}. URL: ${error.config?.url}`);
      return { success: false, error: error.message };
    }
  }

  async getLibraries() {
    try {
      const response = await this.client.get('/library/sections');
      return (response.data?.MediaContainer?.Directory || []).map(lib => ({
        key: lib.key,
        title: lib.title,
        type: lib.type,
      }));
    } catch (error) {
      const status = error.response?.status || 'unknown';
      const data = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
      logger.error(`Plex getLibraries failed for ${this.instance.name} with status ${status}: ${data}. URL: ${error.config?.url}`);
      return [];
    }
  }

  async getRecentlyViewed(sectionId) {
    try {
      const response = await this.client.get(`/library/sections/${sectionId}/recentlyViewed`);
      return response.data?.MediaContainer?.Metadata || [];
    } catch (error) {
      const status = error.response?.status || 'unknown';
      const data = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
      logger.error(`Plex getRecentlyViewed failed with status ${status}: ${data}. URL: ${error.config?.url}`);
      return [];
    }
  }

  async getSessions() {
    try {
      const response = await this.client.get('/status/sessions');
      return response.data?.MediaContainer?.Metadata || [];
    } catch (error) {
      const status = error.response?.status || 'unknown';
      const data = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
      logger.error(`Plex getSessions failed with status ${status}: ${data}. URL: ${error.config?.url}`);
      return [];
    }
  }

  async getLibraryMetadata(sectionId) {
    try {
      // /library/sections/{id}/all returns all items in that library
      const response = await this.client.get(`/library/sections/${sectionId}/all`);
      return response.data?.MediaContainer?.Metadata || [];
    } catch (error) {
       const status = error.response?.status || 'unknown';
       const data = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
       logger.error(`Plex getLibraryMetadata failed for ${this.instance.name} (section=${sectionId}) with status ${status}: ${data}. URL: ${error.config?.url}`);
       return [];
    }
  }
}
