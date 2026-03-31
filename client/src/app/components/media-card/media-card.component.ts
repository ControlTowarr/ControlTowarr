import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MediaItem } from '../../services/api.service';

@Component({
  selector: 'app-media-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="media-card" (click)="cardClick.emit(media)">
      <input
        *ngIf="selectable"
        type="checkbox"
        class="media-card-checkbox"
        [checked]="selected"
        (click)="$event.stopPropagation()"
        (change)="selectChange.emit(!selected)"
      />

      <div class="media-card-badges">
        <span class="badge badge-vibrant" [ngClass]="media.media_type === 'movie' ? 'badge-radarr' : 'badge-sonarr'">
          {{ media.media_type === 'movie' ? 'Movie' : 'Series' }}
        </span>
      </div>

      <div class="media-card-requesters" *ngIf="media.requests && media.requests.length > 0">
        <div 
          *ngFor="let req of media.requests | slice:0:3" 
          class="requester-avatar-mini"
          [title]="'Requested by ' + req.name"
        >
          <img *ngIf="req.avatar" [src]="req.avatar" [alt]="req.name" />
          <div *ngIf="!req.avatar" class="avatar-placeholder">{{ req.name.charAt(0).toUpperCase() }}</div>
        </div>
        <div *ngIf="media.requests.length > 3" class="requester-avatar-mini more">
          +{{ media.requests.length - 3 }}
        </div>
      </div>

      <img
        *ngIf="media.poster_url"
        [src]="media.poster_url"
        [alt]="media.title"
        class="media-card-poster"
        loading="lazy"
      />
      <div *ngIf="!media.poster_url" class="media-card-poster" style="display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:0.8rem;">
        No Poster
      </div>

      <div class="media-card-info" style="display:flex; flex-direction:column; flex:1;">
        <div class="media-card-title" [title]="media.title">{{ media.title }}</div>
        
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px; margin-top:2px;">
          <span *ngIf="media.year" style="color:var(--text-secondary);font-size:0.75rem;font-weight:500;">{{ media.year }}</span>
          <span *ngIf="media.total_size_bytes" style="color:var(--accent-primary);opacity:0.7;font-size:0.75rem;font-weight:600;">{{ formatSize(media.total_size_bytes) }}</span>
          <span *ngIf="hasDownloadClient" class="badge" [ngClass]="seedingBadgeClass" [title]="'Seeding Status: ' + seedingLabel" style="font-size:0.65rem; margin-left:auto;">
            {{ seedingIcon }}
          </span>
        </div>

        <div style="font-size:0.72rem; color:var(--text-muted); display:flex; flex-direction:column; gap:2px;">
          <div [title]="media.added_at ? getISODate(media.added_at) : ''">
            Added: {{ media.added_at ? formatDate(media.added_at) : 'Unknown' }}
          </div>
          <div [title]="media.last_watched_at ? getISODate(media.last_watched_at) : ''">
            Last watched: {{ media.last_watched_at ? formatDate(media.last_watched_at) : 'Never' }}
          </div>
        </div>

        <div style="margin-top:auto; padding-top:10px;" *ngIf="instanceList.length > 0">
          <div 
             style="font-size:0.72rem; color:var(--text-secondary); font-weight:500;"
             [title]="getInstanceNamesString()"
          >
            {{ instanceList.length === 1 ? instanceList[0].name : 'Available in ' + instanceList.length + ' places' }}
          </div>
        </div>
      </div>
    </div>
  `,
})
export class MediaCardComponent {
  @Input() media!: MediaItem;
  @Input() selectable = false;
  @Input() selected = false;
  @Input() hasDownloadClient = false;
  @Output() cardClick = new EventEmitter<MediaItem>();
  @Output() selectChange = new EventEmitter<boolean>();

  get seedingBadgeClass(): string {
    switch (this.media.seeding_status) {
      case 'seeding': return 'badge-warning';
      case 'done': return 'badge-success';
      default: return 'badge-muted';
    }
  }

  get seedingLabel(): string {
    switch (this.media.seeding_status) {
      case 'seeding': return 'Seeding';
      case 'done': return 'Done';
      default: return 'Unknown';
    }
  }

  get seedingIcon(): string {
    switch (this.media.seeding_status) {
      case 'seeding': return '🌱';
      case 'done': return '🌳';
      default: return '🍂';
    }
  }

  get instanceList(): { name: string; type: string }[] {
    if (!this.media.instance_names) return [];
    const names = this.media.instance_names.split(',');
    const types = (this.media.instance_types || '').split(',');
    return names.map((name, i) => ({ name: name.trim(), type: types[i]?.trim() || 'muted' }));
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 30) return `${diffDays}d ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
    return `${Math.floor(diffDays / 365)}y ago`;
  }

  formatSize(bytes: number): string {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
    return `${size.toFixed(1)} ${units[i]}`;
  }

  getISODate(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  getInstanceNamesString(): string {
    return this.instanceList.map(i => i.name).join('\n');
  }
}
