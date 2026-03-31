import axios from 'axios';
import { DownloadClientBase } from './downloadClientBase.js';
import { logger } from '../logger.js';

/**
 * qBittorrent WebUI API client.
 * Uses per-torrent ratio/seeding time limits from qBittorrent itself.
 */
export class QBittorrentClient extends DownloadClientBase {
  constructor(instance) {
    super(instance);
    this.cookieJar = null;
    this.globalPrefs = null;
    this.client = axios.create({
      baseURL: `${instance.url}/api/v2`,
      timeout: 15000,
      withCredentials: true,
    });
  }

  async testConnection() {
    try {
      await this.connect();
      const response = await this.client.get('/app/version', {
        headers: { Cookie: this.cookieJar },
      });
      return { success: true, version: response.data };
    } catch (error) {
      const status = error.response?.status || 'unknown';
      const data = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
      logger.error(`qBittorrent test connection failed for ${this.instance.name} with status ${status}: ${data}. URL: ${error.config?.url}`);
      return { success: false, error: error.message };
    }
  }

  async connect() {
    try {
      const response = await this.client.post('/auth/login',
        `username=${encodeURIComponent(this.instance.username)}&password=${encodeURIComponent(this.instance.password)}`,
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          maxRedirects: 0,
          validateStatus: (status) => status < 500,
        }
      );

      const cookies = response.headers['set-cookie'];
      if (cookies) {
        this.cookieJar = cookies.map(c => c.split(';')[0]).join('; ');
      }

      if (response.data === 'Fails.') {
        throw new Error('Authentication failed — check username/password');
      }

      // Fetch global preferences for fallback ratio/time limits
      await this._loadGlobalPrefs();
    } catch (error) {
      const status = error.response?.status || 'unknown';
      const data = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
      logger.error(`qBittorrent connect failed for ${this.instance.name} with status ${status}: ${data}. URL: ${error.config?.url}`);
      throw error;
    }
  }

  async _loadGlobalPrefs() {
    try {
      const response = await this.client.get('/app/preferences', {
        headers: { Cookie: this.cookieJar },
      });
      this.globalPrefs = response.data;
    } catch (error) {
      const status = error.response?.status || 'unknown';
      const data = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
      logger.warn(`qBittorrent failed to load global preferences with status ${status}: ${data}. URL: ${error.config?.url}`);
      this.globalPrefs = {};
    }
  }

  async getTorrents() {
    try {
      if (!this.cookieJar) await this.connect();

      const response = await this.client.get('/torrents/info', {
        headers: { Cookie: this.cookieJar },
      });

      return response.data.map(t => this._mapTorrent(t));
    } catch (error) {
      // Retry once on auth failure
      if (error.response?.status === 403) {
        await this.connect();
        const response = await this.client.get('/torrents/info', {
          headers: { Cookie: this.cookieJar },
        });
        return response.data.map(t => this._mapTorrent(t));
      }
      const status = error.response?.status || 'unknown';
      const data = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
      logger.error(`qBittorrent getTorrents failed for ${this.instance.name} with status ${status}: ${data}. URL: ${error.config?.url}`);
      throw error;
    }
  }

  async getTorrentByHash(hash) {
    try {
      if (!this.cookieJar) await this.connect();

      const response = await this.client.get('/torrents/info', {
        headers: { Cookie: this.cookieJar },
        params: { hashes: hash.toLowerCase() },
      });

      if (!response.data || response.data.length === 0) return null;
      return this._mapTorrent(response.data[0]);
    } catch (error) {
      const status = error.response?.status || 'unknown';
      const data = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
      logger.error(`qBittorrent getTorrentByHash failed with status ${status}: ${data}. URL: ${error.config?.url}`);
      return null;
    }
  }

  async deleteTorrent(hash, deleteFiles = true) {
    try {
      if (!this.cookieJar) await this.connect();

      await this.client.post('/torrents/delete',
        `hashes=${hash.toLowerCase()}&deleteFiles=${deleteFiles}`,
        {
          headers: {
            Cookie: this.cookieJar,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );
      logger.info(`Successfully deleted torrent ${hash} from qBittorrent instance ${this.instance.name}`);
      return { success: true };
    } catch (error) {
      const status = error.response?.status || 'unknown';
      const data = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
      logger.error(`qBittorrent deleteTorrent failed with status ${status}: ${data}. URL: ${error.config?.url}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if a torrent is done seeding using qBittorrent's own per-torrent limits.
   * qBittorrent uses special values:
   *   ratio_limit = -2 means "use global setting"
   *   ratio_limit = -1 means "no limit"
   *   ratio_limit > 0 means a specific limit
   * Same pattern for seeding_time_limit.
   */
  isDoneSeeding(torrent) {
    // If torrent is missing from the client, consider it done
    if (!torrent) return true;

    // Completed and paused/stopped states
    const doneStates = ['pausedUP', 'stoppedUP', 'uploading', 'stalledUP', 'forcedUP', 'queuedUP', 'checkingUP'];
    const isCompleted = torrent.progress >= 1;

    if (!isCompleted) return false;

    // Determine effective ratio limit
    let effectiveRatioLimit = torrent.ratioLimit;
    if (effectiveRatioLimit === -2 && this.globalPrefs) {
      // Use global setting
      effectiveRatioLimit = this.globalPrefs.max_ratio_enabled
        ? this.globalPrefs.max_ratio
        : -1;
    }

    // Determine effective seeding time limit (in minutes in qBt, we convert)
    let effectiveTimeLimit = torrent.seedingTimeLimit;
    if (effectiveTimeLimit === -2 && this.globalPrefs) {
      effectiveTimeLimit = this.globalPrefs.max_seeding_time_enabled
        ? this.globalPrefs.max_seeding_time
        : -1;
    }

    // Check ratio limit
    if (effectiveRatioLimit > 0 && torrent.ratio >= effectiveRatioLimit) {
      return true;
    }

    // Check seeding time limit (qBt stores in minutes, torrent.seedingTimeSeconds is seconds)
    if (effectiveTimeLimit > 0) {
      const seedingMinutes = torrent.seedingTimeSeconds / 60;
      if (seedingMinutes >= effectiveTimeLimit) {
        return true;
      }
    }

    // If both limits are -1 (no limit), it's never "done" by config
    // but if it's paused after upload, treat as done
    if (torrent.state === 'pausedUP' || torrent.state === 'stoppedUP') {
      return true;
    }

    return false;
  }

  _mapTorrent(t) {
    const mapped = {
      hash: t.hash,
      name: t.name,
      state: t.state,
      ratio: t.ratio,
      ratioLimit: t.ratio_limit ?? -2,
      seedingTimeSeconds: t.seeding_time ?? 0,
      seedingTimeLimit: t.max_seeding_time ?? -2,
      size: t.total_size ?? t.size,
      progress: t.progress,
      savePath: t.save_path || t.content_path,
    };
    mapped.doneSeeding = this.isDoneSeeding(mapped);
    return mapped;
  }
}
