/**
 * Abstract base class for download clients.
 * Implement this interface to add support for new download clients (Transmission, Deluge, etc.)
 */
export class DownloadClientBase {
  constructor(instance) {
    this.instance = instance;
  }

  /**
   * Test connectivity to the download client.
   * @returns {Promise<{success: boolean, version?: string, error?: string}>}
   */
  async testConnection() {
    throw new Error('testConnection() must be implemented');
  }

  /**
   * Establish a session / authenticate with the download client.
   * @returns {Promise<void>}
   */
  async connect() {
    throw new Error('connect() must be implemented');
  }

  /**
   * Retrieve all torrents with their status, ratio, and seeding info.
   * @returns {Promise<Array<{
   *   hash: string,
   *   name: string,
   *   state: string,
   *   ratio: number,
   *   ratioLimit: number,
   *   seedingTimeSeconds: number,
   *   seedingTimeLimit: number,
   *   size: number,
   *   progress: number,
   *   doneSeedng: boolean,
   *   savePath: string,
   * }>>}
   */
  async getTorrents() {
    throw new Error('getTorrents() must be implemented');
  }

  /**
   * Get a specific torrent by its hash.
   * @param {string} hash
   * @returns {Promise<object|null>}
   */
  async getTorrentByHash(hash) {
    throw new Error('getTorrentByHash() must be implemented');
  }

  /**
   * Delete a torrent.
   * @param {string} hash
   * @param {boolean} deleteFiles - Whether to delete downloaded files too
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async deleteTorrent(hash, deleteFiles = true) {
    throw new Error('deleteTorrent() must be implemented');
  }

  /**
   * Check if a torrent has finished seeding based on its own configured limits.
   * Uses per-torrent ratio_limit/seeding_time_limit, falling back to global config.
   * @param {object} torrent
   * @returns {boolean}
   */
  isDoneSeeding(torrent) {
    throw new Error('isDoneSeeding() must be implemented');
  }
}
