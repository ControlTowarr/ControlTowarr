import { Component, Output, EventEmitter, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface FilterState {
  search: string;
  sort: string;
  order: string;
  mediaType: string;
  seedingStatus: string;
  watchStatus: string;
  requestedBy: string;
  rootFolder: string;
}

@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="filter-bar">
      <div class="search-box">
        <svg class="search-box-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          class="form-input"
          type="text"
          placeholder="Search media..."
          [(ngModel)]="filters.search"
          (ngModelChange)="onFilterChange()"
          id="search-input"
        />
      </div>

      <div class="btn-group">
        <button class="btn btn-secondary" (click)="toggleOrder()" id="order-toggle-btn" [title]="filters.order === 'asc' ? 'Ascending' : 'Descending'" style="padding: 10px; min-width: 42px;">
          <!-- Bars getting progressively longer (Ascending) -->
          <svg *ngIf="filters.order === 'asc'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="4" y1="6" x2="10" y2="6"></line>
            <line x1="4" y1="12" x2="15" y2="12"></line>
            <line x1="4" y1="18" x2="20" y2="18"></line>
          </svg>
          <!-- Bars getting progressively shorter (Descending) -->
          <svg *ngIf="filters.order === 'desc'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="4" y1="6" x2="20" y2="6"></line>
            <line x1="4" y1="12" x2="15" y2="12"></line>
            <line x1="4" y1="18" x2="10" y2="18"></line>
          </svg>
        </button>

        <select class="form-select" [(ngModel)]="filters.sort" (ngModelChange)="onFilterChange()" id="sort-select">
          <option value="title">Sort: Title</option>
          <option value="added_at">Sort: Date Added</option>
          <option value="last_watched_at">Sort: Last Watched</option>
          <option value="year">Sort: Year</option>
          <option value="size_bytes">Sort: Disk Space</option>
        </select>
      </div>
 
      <select class="form-select" [(ngModel)]="filters.requestedBy" (ngModelChange)="onFilterChange()" id="requested-by-select">
        <option value="">Requested By: All</option>
        <option *ngFor="let user of requesters" [value]="user.requested_by_name">
          {{ user.requested_by_name }}
        </option>
      </select>

      <select class="form-select" [(ngModel)]="filters.rootFolder" (ngModelChange)="onFilterChange()" id="root-folder-select">
        <option value="">Root Folder: All</option>
        <option *ngFor="let folder of rootFolders" [value]="folder">
          {{ folder }}
        </option>
      </select>

      <div class="btn-group">
        <button
          class="filter-chip"
          [class.active]="filters.mediaType === ''"
          (click)="setMediaType('')"
        >All</button>
        <button
          class="filter-chip"
          [class.active]="filters.mediaType === 'movie'"
          (click)="setMediaType('movie')"
        >Movies</button>
        <button
          class="filter-chip"
          [class.active]="filters.mediaType === 'series'"
          (click)="setMediaType('series')"
        >Series</button>
      </div>

      <div class="btn-group">
        <button
          class="filter-chip"
          [class.active]="filters.seedingStatus === ''"
          (click)="setSeedingStatus('')"
        >All</button>
        <button
          class="filter-chip"
          [class.active]="filters.seedingStatus === 'seeding'"
          (click)="setSeedingStatus('seeding')"
        >
          🌱 Seeding
        </button>
        <button
          class="filter-chip"
          [class.active]="filters.seedingStatus === 'done'"
          (click)="setSeedingStatus('done')"
        >
          🌳 Done
        </button>
        <button
          class="filter-chip"
          [class.active]="filters.seedingStatus === 'unknown'"
          (click)="setSeedingStatus('unknown')"
        >
          🍂 Unknown
        </button>
      </div>

      <div class="btn-group">
        <button
          class="filter-chip"
          [class.active]="filters.watchStatus === ''"
          (click)="setWatchStatus('')"
        >All</button>
        <button
          class="filter-chip"
          [class.active]="filters.watchStatus === 'unwatched'"
          (click)="setWatchStatus('unwatched')"
        >Never Watched</button>
      </div>
    </div>
  `,
})
export class FilterBarComponent {
  @Input() filters: FilterState = {
    search: '',
    sort: 'title',
    order: 'asc',
    mediaType: '',
    seedingStatus: '',
    watchStatus: '',
    requestedBy: '',
    rootFolder: '',
  };
  @Input() requesters: any[] = [];
  @Input() rootFolders: string[] = [];
  @Output() filtersChange = new EventEmitter<FilterState>();

  setMediaType(type: string) {
    this.filters.mediaType = type;
    this.onFilterChange();
  }

  setSeedingStatus(status: string) {
    this.filters.seedingStatus = status;
    this.onFilterChange();
  }

  setWatchStatus(status: string) {
    this.filters.watchStatus = status;
    this.onFilterChange();
  }

  toggleOrder() {
    this.filters.order = this.filters.order === 'asc' ? 'desc' : 'asc';
    this.onFilterChange();
  }

  onFilterChange() {
    this.filtersChange.emit({ ...this.filters });
  }
}
