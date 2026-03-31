import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { ApiService, MediaItem, MediaListResponse } from '../../services/api.service';
import { MediaCardComponent } from '../../components/media-card/media-card.component';
import { FilterBarComponent, FilterState } from '../../components/filter-bar/filter-bar.component';
import { DeleteModalComponent } from '../../components/delete-modal/delete-modal.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, MediaCardComponent, FilterBarComponent, DeleteModalComponent],
  template: `
    <div class="top-header">
      <div>
        <h1 class="page-title">Media Dashboard</h1>
        <p class="page-subtitle">{{ totalItems }} items in your library</p>
      </div>
      <div style="display:flex;align-items:center;gap:var(--space-md);">
        <div class="sync-indicator">
          <span class="sync-dot" [class.syncing]="isSyncing"></span>
          {{ isSyncing ? 'Syncing...' : 'Synced' }}
        </div>
        <button class="btn btn-secondary btn-sm" (click)="triggerSync()" [disabled]="isSyncing" id="sync-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
          </svg>
          Sync
        </button>
        <button
          class="btn btn-danger btn-sm"
          *ngIf="selectedItems.size > 0"
          (click)="bulkDelete()"
          id="bulk-delete-btn"
        >
          Delete {{ selectedItems.size }} Selected
        </button>
      </div>
    </div>

    <app-filter-bar
      [filters]="filters"
      (filtersChange)="onFiltersChange($event)"
    ></app-filter-bar>

    <!-- Loading -->
    <div *ngIf="isInitialLoad" style="display:flex;justify-content:center;padding:var(--space-2xl);">
      <span class="spinner" style="width:40px;height:40px;border-width:3px;"></span>
    </div>

    <!-- Empty State -->
    <div *ngIf="!isInitialLoad && mediaItems.length === 0" class="empty-state">
      <div class="empty-state-icon">📺</div>
      <h3 class="empty-state-title">No media found</h3>
      <p class="empty-state-text">
        {{ hasFilters ? 'Try adjusting your filters.' : 'Connect your Radarr/Sonarr instances and run a sync to populate your library.' }}
      </p>
      <button *ngIf="!hasFilters" class="btn btn-primary" routerLink="/settings" id="goto-settings-btn">
        Configure Instances
      </button>
    </div>

    <!-- Media Grid -->
    <div class="media-grid" *ngIf="!isInitialLoad && mediaItems.length > 0">
      <app-media-card
        *ngFor="let media of mediaItems"
        [media]="media"
        [selectable]="true"
        [selected]="selectedItems.has(media.id)"
        [hasDownloadClient]="hasDownloadClient"
        (cardClick)="onMediaClick($event)"
        (selectChange)="onSelectChange(media.id, $event)"
      ></app-media-card>
    </div>

    <!-- Load More -->
    <div *ngIf="!isInitialLoad && mediaItems.length < totalItems" style="text-align:center;margin-top:var(--space-xl);">
      <button class="btn btn-secondary" (click)="loadMore()" [disabled]="isLoadingMore" id="load-more-btn">
        {{ isLoadingMore ? 'Loading...' : 'Load More (' + mediaItems.length + '/' + totalItems + ')' }}
      </button>
    </div>

    <!-- Delete Modal -->
    <app-delete-modal
      [isOpen]="showDeleteModal"
      [title]="deleteTarget?.title || ''"
      [mediaType]="deleteTarget?.media_type || 'media'"
      [deleteTargets]="deleteTargetList"
      [isDeleting]="isDeleting"
      (confirm)="confirmDelete()"
      (cancel)="showDeleteModal = false"
    ></app-delete-modal>
  `,
})
export class DashboardComponent implements OnInit {
  mediaItems: MediaItem[] = [];
  totalItems = 0;
  isInitialLoad = true;
  isLoadingMore = false;
  isSyncing = false;
  isDeleting = false;
  showDeleteModal = false;
  deleteTarget: MediaItem | null = null;
  deleteTargetList: string[] = [];
  selectedItems = new Set<number>();
  hasDownloadClient = false;

  filters: FilterState = {
    search: '',
    sort: 'title',
    order: 'asc',
    mediaType: '',
    seedingStatus: '',
    watchStatus: '',
  };

  private currentLimit = 100;

  constructor(
    private api: ApiService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    if (this.api.cachedDashboardState) {
      this.mediaItems = this.api.cachedDashboardState.items;
      this.totalItems = this.api.cachedDashboardState.total;
      this.currentLimit = this.api.cachedDashboardState.limit;
      this.isInitialLoad = false;
    }

    this.route.queryParams.subscribe(params => {
      const lsSort = localStorage.getItem('ct_sort');
      const lsOrder = localStorage.getItem('ct_order');
      this.filters = {
        search: params['search'] || '',
        sort: params['sort'] || lsSort || 'title',
        order: params['order'] || lsOrder || 'asc',
        mediaType: params['mediaType'] || '',
        seedingStatus: params['seedingStatus'] || '',
        watchStatus: params['watchStatus'] || '',
      };
      this.loadMedia();
    });
    this.checkSyncStatus();
    this.checkDownloadClient();
  }

  checkDownloadClient() {
    this.api.getInstances().subscribe(instances => {
      this.hasDownloadClient = instances.some(i => i.type === 'qbittorrent');
    });
  }

  get hasFilters(): boolean {
    return !!(this.filters.search || this.filters.mediaType || this.filters.seedingStatus);
  }

  loadMedia() {
    const isReset = this.currentLimit === 100;
    if (isReset && this.mediaItems.length === 0) {
      this.isInitialLoad = true;
    } else {
      this.isLoadingMore = true;
    }

    this.api.getMedia({
      sort: this.filters.sort,
      order: this.filters.order,
      mediaType: this.filters.mediaType || undefined,
      seedingStatus: this.filters.seedingStatus || undefined,
      watchStatus: this.filters.watchStatus || undefined,
      search: this.filters.search || undefined,
      limit: this.currentLimit,
      offset: 0,
    }).subscribe({
      next: (response) => {
        this.mediaItems = response.items;
        this.totalItems = response.total;
        
        this.isInitialLoad = false;
        this.isLoadingMore = false;
        
        this.api.cachedDashboardState = {
          items: response.items,
          total: response.total,
          limit: this.currentLimit
        };
      },
      error: () => {
        this.isInitialLoad = false;
        this.isLoadingMore = false;
      },
    });
  }

  loadMore() {
    this.currentLimit += 100;
    this.loadMedia();
  }

  onFiltersChange(filters: FilterState) {
    this.currentLimit = 100;
    localStorage.setItem('ct_sort', filters.sort);
    localStorage.setItem('ct_order', filters.order);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        search: filters.search || null,
        sort: filters.sort === 'title' ? null : filters.sort,
        order: filters.order === 'asc' ? null : filters.order,
        mediaType: filters.mediaType || null,
        seedingStatus: filters.seedingStatus || null,
        watchStatus: filters.watchStatus || null,
      },
      queryParamsHandling: 'merge',
    });
  }

  onMediaClick(media: MediaItem) {
    this.api.cameFromDashboard = true;
    this.router.navigate(['/media', media.id], { queryParamsHandling: 'preserve' });
  }

  onSelectChange(id: number, selected: boolean) {
    if (selected) {
      this.selectedItems.add(id);
    } else {
      this.selectedItems.delete(id);
    }
  }

  triggerSync() {
    this.isSyncing = true;
    this.api.triggerSync().subscribe({
      next: () => {
        this.isSyncing = false;
        this.loadMedia();
      },
      error: () => {
        this.isSyncing = false;
      },
    });
  }

  checkSyncStatus() {
    this.api.getSyncStatus().subscribe({
      next: (status) => {
        this.isSyncing = status.isSyncing;
      },
    });
  }

  bulkDelete() {
    // For simplicity, delete first selected item (expand later for true bulk)
    const firstId = this.selectedItems.values().next().value;
    if (firstId !== undefined) {
      const item = this.mediaItems.find(m => m.id === firstId);
      if (item) {
        this.prepareDelete(item);
      }
    }
  }

  prepareDelete(media: MediaItem) {
    this.deleteTarget = media;
    this.deleteTargetList = [];
    if (media.instance_names) {
      media.instance_names.split(',').forEach(name => {
        this.deleteTargetList.push(name.trim());
      });
    }
    this.deleteTargetList.push('Seerr / Overseerr requests');
    this.deleteTargetList.push('Download client torrents');
    this.showDeleteModal = true;
  }

  confirmDelete() {
    if (!this.deleteTarget) return;
    this.isDeleting = true;
    this.api.deleteMedia(this.deleteTarget.id).subscribe({
      next: () => {
        this.isDeleting = false;
        this.showDeleteModal = false;
        this.selectedItems.delete(this.deleteTarget!.id);
        this.deleteTarget = null;
        this.loadMedia();
      },
      error: () => {
        this.isDeleting = false;
      },
    });
  }
}
