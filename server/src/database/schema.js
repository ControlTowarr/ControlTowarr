import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let db = null;

export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

export function initializeDatabase(dbPath) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  createTables();
  seedDefaults();

  return db;
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS instances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('radarr', 'sonarr', 'seerr', 'plex', 'tautulli', 'qbittorrent')),
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      api_key TEXT NOT NULL DEFAULT '',
      username TEXT NOT NULL DEFAULT '',
      password TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      last_sync TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS media_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      media_type TEXT NOT NULL CHECK(media_type IN ('movie', 'series')),
      imdb_id TEXT,
      tvdb_id TEXT,
      tmdb_id TEXT,
      poster_url TEXT,
      overview TEXT,
      year INTEGER,
      status TEXT NOT NULL DEFAULT 'unknown',
      seeding_status TEXT NOT NULL DEFAULT 'unknown' CHECK(seeding_status IN ('seeding', 'done', 'unknown')),
      added_at TEXT,
      last_watched_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_media_items_imdb ON media_items(imdb_id) WHERE imdb_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_media_items_tvdb ON media_items(tvdb_id) WHERE tvdb_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_media_items_tmdb ON media_items(tmdb_id) WHERE tmdb_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_media_items_type ON media_items(media_type);
    CREATE INDEX IF NOT EXISTS idx_media_items_seeding ON media_items(seeding_status);

    CREATE TABLE IF NOT EXISTS media_instances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      media_item_id INTEGER NOT NULL,
      instance_id INTEGER NOT NULL,
      external_id INTEGER NOT NULL,
      external_slug TEXT,
      path TEXT,
      size_bytes INTEGER DEFAULT 0,
      has_file INTEGER DEFAULT 0,
      quality TEXT,
      date_added TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (media_item_id) REFERENCES media_items(id) ON DELETE CASCADE,
      FOREIGN KEY (instance_id) REFERENCES instances(id) ON DELETE CASCADE,
      UNIQUE(media_item_id, instance_id, external_id)
    );

    CREATE INDEX IF NOT EXISTS idx_media_instances_media ON media_instances(media_item_id);
    CREATE INDEX IF NOT EXISTS idx_media_instances_instance ON media_instances(instance_id);

    CREATE TABLE IF NOT EXISTS download_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      media_item_id INTEGER NOT NULL,
      instance_id INTEGER,
      torrent_hash TEXT,
      torrent_name TEXT,
      ratio REAL DEFAULT 0,
      ratio_limit REAL DEFAULT -1,
      state TEXT DEFAULT 'unknown',
      done_seeding INTEGER DEFAULT 0,
      seeding_time_seconds INTEGER DEFAULT 0,
      seeding_time_limit INTEGER DEFAULT -1,
      completed_at TEXT,
      last_checked TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (media_item_id) REFERENCES media_items(id) ON DELETE CASCADE,
      FOREIGN KEY (instance_id) REFERENCES instances(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_download_records_media ON download_records(media_item_id);
    CREATE INDEX IF NOT EXISTS idx_download_records_hash ON download_records(torrent_hash);

    CREATE TABLE IF NOT EXISTS watch_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      media_item_id INTEGER NOT NULL,
      user_name TEXT,
      watched_at TEXT NOT NULL,
      duration_seconds INTEGER DEFAULT 0,
      percent_complete REAL DEFAULT 0,
      source TEXT DEFAULT 'tautulli',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (media_item_id) REFERENCES media_items(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_watch_history_media ON watch_history(media_item_id);
    CREATE INDEX IF NOT EXISTS idx_watch_history_date ON watch_history(watched_at);

    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      instance_id INTEGER,
      sync_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'success', 'failure')),
      message TEXT,
      items_processed INTEGER DEFAULT 0,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (instance_id) REFERENCES instances(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS metrics_timeseries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      metric_name TEXT NOT NULL,
      instance_id INTEGER,
      root_folder TEXT,
      value REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (instance_id) REFERENCES instances(id) ON DELETE CASCADE,
      UNIQUE(date, metric_name, instance_id, root_folder)
    );

    CREATE INDEX IF NOT EXISTS idx_metrics_timeseries_date ON metrics_timeseries(date);

    CREATE TABLE IF NOT EXISTS action_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action_type TEXT NOT NULL,
      media_type TEXT,
      media_title TEXT,
      instance_id INTEGER,
      size_freed_bytes INTEGER DEFAULT 0,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (instance_id) REFERENCES instances(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS media_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      media_item_id INTEGER NOT NULL,
      external_id INTEGER,
      requested_by_name TEXT,
      requested_by_avatar TEXT,
      requested_by_id INTEGER,
      requested_at TEXT,
      type TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (media_item_id) REFERENCES media_items(id) ON DELETE CASCADE,
      UNIQUE(media_item_id, external_id)
    );

    CREATE INDEX IF NOT EXISTS idx_media_requests_media ON media_requests(media_item_id);
    CREATE INDEX IF NOT EXISTS idx_media_requests_external ON media_requests(external_id);
  `);

  // Migration: add external_slug if missing
  try {
    db.prepare('ALTER TABLE media_instances ADD COLUMN external_slug TEXT').run();
  } catch (err) {
    // Ignore error if column already exists
  }

  // Migration: add details to action_logs if missing
  try {
    db.prepare('ALTER TABLE action_logs ADD COLUMN details TEXT').run();
  } catch (err) { }

  // Migration: add root_folder to metrics_timeseries if missing
  try {
    db.prepare('ALTER TABLE metrics_timeseries ADD COLUMN root_folder TEXT').run();
  } catch (err) { }
}

function seedDefaults() {
  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)
  `);

  insertSetting.run('sync_interval_minutes', '60');
  insertSetting.run('setup_completed', 'false');
}
