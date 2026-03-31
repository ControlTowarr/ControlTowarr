<h1 align="center">ControlTowarr</h1>

<p align="center">
  <strong>Centralized media management dashboard for the *arr ecosystem</strong>
</p>

> [!WARNING]
> **WIP: This repository is currently a work in progress.** Content may change frequently and might not be stable.  
> A big part of this app was written using AI tools (Vibe coding). It is not thoroughly tested in its current state.
>
> Use at your own risk and peril.


---

## What is ControlTowarr?

ControlTowarr is a self-hosted web app that connects to your Radarr, Sonarr, Seerr, Plex, Tautulli, and qBittorrent instances and gives you a unified view of your entire media library. It deduplicates content across multiple instances, tracks seeding status, monitors watch history, and lets you delete content across all connected services in a single action.

## Features

- **Multi-instance support** — Connect multiple Radarr and Sonarr instances and see everything in one place
- **Content deduplication** — Media is grouped by IMDB/TVDB/TMDB ID, so the same movie in two Radarr instances shows as one entry
- **Seeding status** — See which downloads are still seeding, which are done, and which are missing from your download client
- **Watch history** — Know when content was last watched by anyone (via Tautulli or Plex)
- **Smart sorting & filtering** — Sort by oldest download, last watched, seeding status, media type, and more
- **Nuclear delete** — Remove a movie or show from every connected Radarr/Sonarr instance, clear the Seerr/Overseerr request, and delete the torrent from qBittorrent — all in one click
- **Background sync** — Your database stays up to date with all connected services on a configurable schedule
- **Docker ready** — Single `docker compose up` to get running
- **Dark UI** — Modern dark theme inspired by the *arr ecosystem

## Supported Services

| Service | Status | Notes |
|---------|--------|-------|
| Radarr | ✅ Supported | API v3 — movies |
| Sonarr | ✅ Supported | API v3 — TV shows |
| Seerr | ✅ Supported | Request management (successor to Overseerr) |
| Overseerr | ✅ Supported | Legacy support via auto-detection |
| Plex | ✅ Supported | Library data & watch activity |
| Tautulli | ✅ Supported | Watch history & statistics |
| qBittorrent | ✅ Supported | Seeding status, torrent management (username/password or API key) |

## Getting Started

### Docker Compose (recommended)

1. Create a `docker-compose.yml`:

```yaml
services:
  controltowarr:
    image: controltowarr:latest
    container_name: controltowarr
    ports:
      - "3377:3377"
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
    restart: unless-stopped
```

2. Start the container:

```bash
docker compose up -d
```

3. Open [http://localhost:3377](http://localhost:3377) in your browser. The setup wizard will walk you through connecting your services.

### Build from Source with Docker

```bash
git clone https://github.com/Moustachauve/ControlTowarr.git
cd ControlTowarr
docker build -t controltowarr .
docker run -d -p 3377:3377 -v ./data:/app/data controltowarr
```

### Run Locally (Development)

**Requirements:** Node.js 20+, npm 9+

```bash
git clone https://github.com/Moustachauve/ControlTowarr.git
cd ControlTowarr
npm run install:all
npm run dev
```

This starts the Express backend on port `3377` and the Angular dev server on port `4200` with a proxy to the backend. Open [http://localhost:4200](http://localhost:4200).

### Dev Container

The repo includes a `.devcontainer` configuration. Open it in VS Code with the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) and it will set up the full development environment automatically.

Once inside the container:

```bash
npm run install:all
npm run dev
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3377` | Server port |
| `DB_PATH` | `./data/controltowarr.db` | Path to the SQLite database file |
| `SYNC_INTERVAL_MINUTES` | `15` | How often to sync with connected services (in minutes) |
| `LOG_LEVEL` | `info` | Log verbosity (`error`, `warn`, `info`, `debug`) |

### Setup Wizard

On first launch, the setup wizard guides you through connecting your services step by step:

1. **Radarr** — Add one or more Radarr instances (URL + API key)
2. **Sonarr** — Add one or more Sonarr instances (URL + API key)
3. **Seerr / Overseerr** — For cleaning up requests when you delete content (URL + API key)
4. **Plex** — For watch history data (URL + token)
5. **Tautulli** — For detailed watch history & statistics (URL + API key)
6. **qBittorrent** — For seeding status tracking (URL + username/password or API key)

Every step is optional except that you need at least one Radarr or Sonarr instance to have anything to show. You can always add more instances later from the Settings page.

## Project Structure

```
ControlTowarr/
├── client/                 # Angular 19 frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── components/ # Reusable UI components
│   │   │   ├── pages/      # Route pages (dashboard, detail, settings, setup)
│   │   │   └── services/   # API service
│   │   ├── styles.css      # Global design system
│   │   └── index.html
│   ├── proxy.conf.json     # Dev server proxy config
│   └── package.json
├── server/                 # Node.js / Express backend
│   ├── src/
│   │   ├── database/       # SQLite schema & query helpers
│   │   ├── routes/         # REST API routes
│   │   ├── services/       # Service API clients (Radarr, Sonarr, etc.)
│   │   └── sync/           # Background sync engine & media matcher
│   └── package.json
├── .devcontainer/          # VS Code dev container config
├── Dockerfile              # Multi-stage production build
├── docker-compose.yml      # Production compose file
└── package.json            # Root scripts (dev, build, install:all)
```

## API Reference

All endpoints are under `/api`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/instances` | List configured instances |
| `POST` | `/api/instances` | Add a new instance |
| `PUT` | `/api/instances/:id` | Update an instance |
| `DELETE` | `/api/instances/:id` | Remove an instance |
| `POST` | `/api/instances/:id/test` | Test connection to a saved instance |
| `POST` | `/api/instances/test` | Test connection without saving (setup wizard) |
| `GET` | `/api/media` | List media (supports `sort`, `order`, `mediaType`, `seedingStatus`, `search`, `limit`, `offset`) |
| `GET` | `/api/media/:id` | Media detail (includes instances, downloads, watch history) |
| `DELETE` | `/api/media/:id` | Nuclear delete from all services |
| `POST` | `/api/sync` | Trigger a manual sync |
| `GET` | `/api/sync/status` | Current sync status & recent logs |
| `GET` | `/api/settings` | Get app settings |
| `PUT` | `/api/settings` | Update app settings |

## Roadmap

- [ ] Transmission download client support
- [ ] Deluge download client support
- [ ] Auto-cleanup rules (remove content not watched in X days)
- [ ] Webhook notifications
- [ ] Import/export configuration

## Tech Stack

- **Frontend:** Angular 19 (standalone components, lazy-loaded routes)
- **Backend:** Node.js + Express
- **Database:** SQLite via better-sqlite3
- **Containerization:** Docker (multi-stage build)

## License

[GNU General Public License v3.0](LICENSE)
