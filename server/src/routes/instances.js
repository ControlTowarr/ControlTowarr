import { Router } from 'express';
import axios from 'axios';
import crypto from 'crypto';
import * as queries from '../database/queries.js';
import { RadarrClient } from '../services/radarr.js';
import { SonarrClient } from '../services/sonarr.js';
import { SeerrClient } from '../services/seerr.js';
import { TautulliClient } from '../services/tautulli.js';
import { PlexClient } from '../services/plex.js';
import { QBittorrentClient } from '../services/qbittorrent.js';
import { logger } from '../logger.js';

const router = Router();

// GET /api/instances — list all instances
router.get('/', (req, res) => {
  try {
    const instances = queries.getAllInstances();
    // Don't leak passwords
    const sanitized = instances.map(i => ({
      ...i,
      api_key: i.api_key ? '••••••••' : '',
      password: i.password ? '••••••••' : '',
    }));
    res.json(sanitized);
  } catch (error) {
    logger.error('Failed to get instances:', error);
    res.status(500).json({ error: 'Failed to get instances' });
  }
});

// POST /api/instances — create new instance
router.post('/', (req, res) => {
  try {
    const { type, name, url, api_key, username, password } = req.body;
    if (!type || !name || !url) {
      return res.status(400).json({ error: 'type, name, and url are required' });
    }

    const validTypes = ['radarr', 'sonarr', 'seerr', 'plex', 'tautulli', 'qbittorrent'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
    }

    const instance = queries.createInstance({ type, name, url, api_key, username, password });
    logger.info(`Successfully created new instance: ${name} (${type}) at ${url}`);

    // Mark setup as completed when first instance is added
    queries.setSetting('setup_completed', 'true');

    res.status(201).json(instance);
  } catch (error) {
    logger.error('Failed to create instance:', error);
    res.status(500).json({ error: 'Failed to create instance' });
  }
});

// --- PLEX OAUTH / PIN FLOW ---
function getPlexHeaders() {
  let clientId = queries.getSetting('plex_client_id');
  if (!clientId) {
    clientId = crypto.randomUUID();
    queries.setSetting('plex_client_id', clientId);
  }
  return {
    'X-Plex-Product': 'ControlTowarr',
    'X-Plex-Client-Identifier': clientId,
    'X-Plex-Device': 'Web',
    'X-Plex-Device-Name': 'ControlTowarr Dashboard',
    'Accept': 'application/json'
  };
}

// POST /api/instances/plex/pin — Generate a new Plex PIN
router.post('/plex/pin', async (req, res) => {
  try {
    const response = await axios.post('https://plex.tv/api/v2/pins?strong=true', null, {
      headers: getPlexHeaders()
    });
    res.json({
      id: response.data.id,
      code: response.data.code,
      clientIdentifier: getPlexHeaders()['X-Plex-Client-Identifier']
    });
  } catch (error) {
    logger.error('Failed to get Plex PIN:', error.message);
    res.status(500).json({ error: 'Failed to request Plex PIN' });
  }
});

// GET /api/instances/plex/pin/:id — Poll for PIN authorization status
router.get('/plex/pin/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const response = await axios.get(`https://plex.tv/api/v2/pins/${id}`, {
      headers: getPlexHeaders()
    });
    res.json({
      authToken: response.data.authToken || null
    });
  } catch (error) {
    logger.error(`Failed to poll Plex PIN ${req.params.id}:`, error.message);
    res.status(500).json({ error: 'Failed to poll Plex PIN' });
  }
});
// GET /api/instances/plex/servers?token=... — Fetch available servers for a user
router.get('/plex/servers', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'token is required' });

    const headers = getPlexHeaders();
    headers['X-Plex-Token'] = token;

    const response = await axios.get('https://plex.tv/api/v2/resources?includeHttps=1', { headers });
    const servers = response.data
      .filter(r => r.provides.includes('server'))
      .map(s => ({
        name: s.name,
        clientIdentifier: s.clientIdentifier,
        connections: s.connections.map(c => ({ uri: c.uri, local: c.local })),
      }));
    
    res.json(servers);
  } catch (error) {
    logger.error('Failed to get Plex servers:', error.message);
    res.status(500).json({ error: 'Failed to fetch Plex servers' });
  }
});
// -----------------------------

// PUT /api/instances/:id — update instance
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = queries.getInstanceById(id);
    if (!existing) return res.status(404).json({ error: 'Instance not found' });

    const updated = queries.updateInstance(id, req.body);
    logger.info(`Successfully updated instance: ${updated.name} (${updated.type})`);
    res.json(updated);
  } catch (error) {
    logger.error('Failed to update instance:', error);
    res.status(500).json({ error: 'Failed to update instance' });
  }
});

// DELETE /api/instances/:id — delete instance
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = queries.getInstanceById(id);
    if (!existing) return res.status(404).json({ error: 'Instance not found' });

    queries.deleteInstance(id);
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete instance:', error);
    res.status(500).json({ error: 'Failed to delete instance' });
  }
});

// POST /api/instances/:id/test — test connectivity
router.post('/:id/test', async (req, res) => {
  try {
    const { id } = req.params;
    const instance = queries.getInstanceById(id);
    if (!instance) return res.status(404).json({ error: 'Instance not found' });

    const result = await testInstance(instance);
    res.json(result);
  } catch (error) {
    logger.error('Failed to test instance:', error);
    res.status(500).json({ error: 'Failed to test instance' });
  }
});

// POST /api/instances/test — test connectivity without saving (for setup wizard)
router.post('/test', async (req, res) => {
  try {
    const { type, name, url, api_key, username, password } = req.body;
    if (!type || !url) {
      return res.status(400).json({ error: 'type and url are required' });
    }

    const instance = { type, name: name || 'Test Instance', url: url.replace(/\/+$/, ''), api_key: api_key || '', username: username || '', password: password || '' };
    const result = await testInstance(instance);
    res.json(result);
  } catch (error) {
    logger.error('Failed to test instance:', error);
    res.status(500).json({ error: 'Failed to test instance' });
  }
});

async function testInstance(instance) {
  switch (instance.type) {
    case 'radarr':
      return new RadarrClient(instance).testConnection();
    case 'sonarr':
      return new SonarrClient(instance).testConnection();
    case 'seerr':
      return new SeerrClient(instance).testConnection();
    case 'tautulli':
      return new TautulliClient(instance).testConnection();
    case 'plex':
      return new PlexClient(instance).testConnection();
    case 'qbittorrent':
      return new QBittorrentClient(instance).testConnection();
    default:
      return { success: false, error: 'Unknown instance type' };
  }
}

export default router;
