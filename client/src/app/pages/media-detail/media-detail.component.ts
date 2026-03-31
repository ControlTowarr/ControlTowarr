import { Component, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService, MediaDetail } from '../../services/api.service';
import { InstanceBadgeComponent } from '../../components/instance-badge/instance-badge.component';
import { DeleteModalComponent } from '../../components/delete-modal/delete-modal.component';

@Component({
  selector: 'app-media-detail',
  standalone: true,
  imports: [CommonModule, InstanceBadgeComponent, DeleteModalComponent],
  template: `
    <div *ngIf="isLoading" style="display:flex;justify-content:center;padding:var(--space-2xl);">
      <span class="spinner" style="width:40px;height:40px;border-width:3px;"></span>
    </div>

    <div *ngIf="!isLoading && !media" class="empty-state">
      <h3 class="empty-state-title">Media not found</h3>
      <button class="btn btn-primary" (click)="goBack()">Go Back</button>
    </div>

    <div *ngIf="!isLoading && media">
      <!-- Back button -->
      <button class="btn btn-ghost btn-sm" (click)="goBack()" style="margin-bottom:var(--space-md);" id="back-btn">
        ← Back to Dashboard
      </button>

      <!-- Hero Section -->
      <div class="detail-hero">
        <img
          *ngIf="media.poster_url"
          [src]="media.poster_url"
          [alt]="media.title"
          class="detail-poster"
        />
        <div *ngIf="!media.poster_url" class="detail-poster" style="background:var(--bg-card);display:flex;align-items:center;justify-content:center;color:var(--text-muted);">
          No Poster
        </div>

        <div class="detail-info">
          <h1 class="detail-title">{{ media.title }}</h1>

          <div class="detail-meta">
            <span class="badge" [ngClass]="media.media_type === 'movie' ? 'badge-radarr' : 'badge-sonarr'">
              {{ media.media_type === 'movie' ? 'Movie' : 'Series' }}
            </span>
            <span class="badge" [ngClass]="seedingBadgeClass">{{ seedingLabel }}</span>
            <span *ngIf="media.year" class="badge badge-muted">{{ media.year }}</span>
            <span *ngIf="media.imdb_id" class="badge badge-info">{{ media.imdb_id }}</span>
          </div>

          <p class="detail-overview" *ngIf="media.overview">{{ media.overview }}</p>

          <div style="display:flex;flex-wrap:wrap;gap:var(--space-md);font-size:0.85rem;color:var(--text-secondary);margin-bottom:var(--space-lg);">
            <div *ngIf="media.added_at" [title]="getISODate(media.added_at)">
              <strong>Added:</strong> {{ formatFullDate(media.added_at) }}
            </div>
            <div *ngIf="media.last_watched_at" [title]="getISODate(media.last_watched_at)">
              <strong>Last Watched:</strong> {{ formatFullDate(media.last_watched_at) }}
            </div>
          </div>

          <button class="btn btn-danger" (click)="openDeleteModal()" id="delete-media-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            Delete Everywhere
          </button>
        </div>
      </div>

      <!-- Instances Section -->
      <div class="detail-section" *ngIf="media.instances.length > 0">
        <h3 class="detail-section-title">Instances ({{ media.instances.length }})</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>Instance</th>
              <th>Type</th>
              <th>Quality</th>
              <th>Size</th>
              <th>Has File</th>
              <th>Path</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let inst of media.instances">
              <td>
                <a [href]="getInstanceLink(inst)" target="_blank" style="font-weight:500;">
                  {{ inst.instance_name }}
                </a>
              </td>
              <td><app-instance-badge [name]="inst.instance_type" [type]="inst.instance_type"></app-instance-badge></td>
              <td>{{ inst.quality || '—' }}</td>
              <td>{{ formatSize(inst.size_bytes) }}</td>
              <td>
                <span [style.color]="inst.has_file ? 'var(--color-success)' : 'var(--color-danger)'">
                  {{ inst.has_file ? '✓' : '✕' }}
                </span>
              </td>
              <td style="color:var(--text-muted);font-size:0.8rem;max-width:300px;overflow:hidden;text-overflow:ellipsis;">
                {{ inst.path || '—' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Downloads Section -->
      <div class="detail-section" *ngIf="media.downloads.length > 0">
        <h3 class="detail-section-title">Downloads ({{ media.downloads.length }})</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>Torrent</th>
              <th>State</th>
              <th>Ratio</th>
              <th>Limit</th>
              <th>Seeding Time</th>
              <th>Done</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let dl of media.downloads">
              <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;" [title]="dl.torrent_name || ''">
                {{ dl.torrent_name || dl.torrent_hash || '—' }}
              </td>
              <td>
                <span class="badge" [ngClass]="getStateBadgeClass(dl.state)">
                  {{ dl.state === 'missing' ? 'Done (Removed)' : dl.state }}
                </span>
              </td>
              <td>{{ dl.ratio.toFixed(2) }}</td>
              <td>{{ dl.ratio_limit > 0 ? dl.ratio_limit.toFixed(2) : (dl.ratio_limit === -1 ? '∞' : 'Global') }}</td>
              <td>{{ formatDuration(dl.seeding_time_seconds) }}</td>
              <td>
                <span [style.color]="dl.done_seeding ? 'var(--color-success)' : 'var(--color-warning)'">
                  {{ dl.done_seeding ? '✓ Done' : '⟳ Seeding' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Watch History Section -->
      <div class="detail-section" *ngIf="media.watchHistory.length > 0">
        <h3 class="detail-section-title">Watch History ({{ media.watchHistory.length }})</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Watched</th>
              <th>Duration</th>
              <th>Progress</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let wh of media.watchHistory">
              <td>{{ wh.user_name }}</td>
              <td [title]="getISODate(wh.watched_at)">{{ formatFullDate(wh.watched_at) }}</td>
              <td>{{ formatDuration(wh.duration_seconds) }}</td>
              <td>{{ (wh.percent_complete * 100).toFixed(0) }}%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Delete Modal -->
    <app-delete-modal
      [isOpen]="showDeleteModal"
      [title]="media?.title || ''"
      [mediaType]="media?.media_type || 'media'"
      [deleteTargets]="deleteTargetList"
      [isDeleting]="isDeleting"
      (confirm)="confirmDelete()"
      (cancel)="showDeleteModal = false"
    ></app-delete-modal>
  `,
})
export class MediaDetailComponent implements OnInit {
  media: MediaDetail | null = null;
  isLoading = true;
  showDeleteModal = false;
  isDeleting = false;
  deleteTargetList: string[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: ApiService,
    private location: Location
  ) {}

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.api.getMediaDetail(id).subscribe({
      next: (detail) => {
        this.media = detail;
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
      },
    });
  }

  get seedingBadgeClass(): string {
    if (!this.media) return 'badge-muted';
    switch (this.media.seeding_status) {
      case 'seeding': return 'badge-warning';
      case 'done': return 'badge-success';
      default: return 'badge-muted';
    }
  }

  get seedingLabel(): string {
    if (!this.media) return 'Unknown';
    switch (this.media.seeding_status) {
      case 'seeding': return 'Seeding';
      case 'done': return 'Done Seeding';
      default: return 'Unknown';
    }
  }

  goBack() {
    if (this.api.cameFromDashboard) {
      this.api.cameFromDashboard = false;
      this.location.back();
    } else {
      this.router.navigate(['/dashboard'], { queryParamsHandling: 'preserve' });
    }
  }

  getInstanceLink(inst: any): string {
    const identifier = inst.external_slug || inst.external_id;
    if (inst.instance_type === 'radarr') {
      return `${inst.instance_url}/movie/${identifier}`;
    }
    if (inst.instance_type === 'sonarr') {
      return `${inst.instance_url}/series/${identifier}`;
    }
    return inst.instance_url;
  }

  getStateBadgeClass(state: string): string {
    switch (state) {
      case 'downloading': return 'badge-info';
      case 'seeding': case 'uploading': case 'stalledUP': return 'badge-warning';
      case 'pausedUP': case 'stoppedUP': case 'completed': return 'badge-success';
      case 'missing': return 'badge-danger';
      default: return 'badge-muted';
    }
  }

  formatSize(bytes: number): string {
    if (!bytes) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
    return `${size.toFixed(1)} ${units[i]}`;
  }

  formatDuration(seconds: number): string {
    if (!seconds) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  formatFullDate(dateStr: string): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  }

  getISODate(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  openDeleteModal() {
    if (!this.media) return;
    this.deleteTargetList = this.media.instances.map(i => `${i.instance_name} (${i.instance_type})`);
    this.deleteTargetList.push('Seerr / Overseerr requests');
    this.deleteTargetList.push('Download client torrents');
    this.showDeleteModal = true;
  }

  confirmDelete() {
    if (!this.media) return;
    this.isDeleting = true;
    this.api.deleteMedia(this.media.id).subscribe({
      next: () => {
        this.isDeleting = false;
        this.showDeleteModal = false;
        
        // Remove the deleted item from the dashboard cache so it vanishes immediately
        if (this.api.cachedDashboardState && this.api.cachedDashboardState.items) {
          this.api.cachedDashboardState.items = this.api.cachedDashboardState.items.filter(
            (item: any) => item.id !== this.media!.id
          );
          if (this.api.cachedDashboardState.total > 0) {
            this.api.cachedDashboardState.total--;
          }
        }
        
        this.goBack();
      },
      error: () => {
        this.isDeleting = false;
      },
    });
  }
}
