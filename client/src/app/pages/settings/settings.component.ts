import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Instance } from '../../services/api.service';
import { InstanceFormComponent } from '../../components/instance-form/instance-form.component';
import { PlexSetupComponent } from '../../components/plex-setup/plex-setup.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, InstanceFormComponent, PlexSetupComponent],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Settings</h1>
        <p class="page-subtitle">Manage your connected services and app configuration</p>
      </div>
    </div>

    <!-- Instances -->
    <div class="card" style="margin-bottom:var(--space-xl);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-lg);">
        <h3 style="font-weight:600;font-size:1.1rem;">Connected Instances</h3>
        <button class="btn btn-primary btn-sm" (click)="showAddForm = true" *ngIf="!showAddForm" id="add-instance-btn">
          + Add Instance
        </button>
      </div>

      <!-- Add Form -->
      <app-instance-form
        *ngIf="showAddForm"
        [showCancel]="true"
        (saved)="onInstanceSaved($event)"
        (cancel)="showAddForm = false"
      ></app-instance-form>

      <!-- Instance List -->
      <div *ngIf="instances.length === 0 && !showAddForm" class="empty-state" style="padding:var(--space-lg);">
        <p class="empty-state-text">No instances configured yet.</p>
        <button class="btn btn-primary" (click)="showAddForm = true">Add Your First Instance</button>
      </div>

      <div class="instance-list">
        <div class="instance-item" *ngFor="let inst of standardInstances">
          <div class="instance-item-info">
            <div
              class="instance-item-icon"
              [ngClass]="'badge-' + inst.type"
              [style.background]="getIconBg(inst.type)"
            >
              {{ getTypeAbbr(inst.type) }}
            </div>
            <div>
              <div style="font-weight:600;">{{ inst.name }}</div>
              <div style="font-size:0.8rem;color:var(--text-muted);">{{ inst.url }}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);" *ngIf="inst.last_sync" [title]="getISODate(inst.last_sync)">
                Last sync: {{ formatDate(inst.last_sync) }}
              </div>
            </div>
          </div>
          <div class="instance-item-actions">
            <button class="btn btn-ghost btn-sm" (click)="testInstance(inst)" [disabled]="testingId === inst.id" [id]="'test-' + inst.id">
              {{ testingId === inst.id ? '...' : 'Test' }}
            </button>
            <button class="btn btn-ghost btn-sm" style="color:var(--color-danger);" (click)="deleteInstance(inst)" [id]="'delete-' + inst.id">
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Plex Integration -->
    <app-plex-setup
      [plexInstance]="plexInstance"
      (instanceSaved)="loadInstances()"
      (instanceDeleted)="loadInstances()"
    ></app-plex-setup>

    <!-- Sync Settings -->
    <div class="card" style="margin-bottom:var(--space-xl);">
      <h3 style="font-weight:600;font-size:1.1rem;margin-bottom:var(--space-lg);">Sync Settings</h3>

      <div class="form-group">
        <label class="form-label">Sync Interval (minutes)</label>
        <input
          class="form-input"
          type="number"
          [(ngModel)]="syncInterval"
          min="1"
          max="1440"
          style="max-width:200px;"
          id="sync-interval-input"
        />
      </div>

      <button class="btn btn-primary btn-sm" (click)="saveSyncInterval()" id="save-sync-btn">
        Save Settings
      </button>
    </div>

    <!-- Sync Status -->
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-lg);">
        <h3 style="font-weight:600;font-size:1.1rem;">Recent Sync Activity</h3>
        <button class="btn btn-secondary btn-sm" (click)="triggerSync()" [disabled]="isSyncing" id="manual-sync-btn">
          {{ isSyncing ? 'Syncing...' : 'Sync Now' }}
        </button>
      </div>

      <table class="data-table" *ngIf="syncLogs.length > 0">
        <thead>
          <tr>
            <th>Instance</th>
            <th>Type</th>
            <th>Status</th>
            <th>Items</th>
            <th>Message</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let log of syncLogs">
            <td>{{ log.instance_name || '—' }}</td>
            <td>{{ log.sync_type }}</td>
            <td>
              <span class="badge" [ngClass]="{
                'badge-success': log.status === 'success',
                'badge-danger': log.status === 'failure',
                'badge-warning': log.status === 'running'
              }">{{ log.status }}</span>
            </td>
            <td>{{ log.items_processed }}</td>
            <td style="font-size:0.8rem;color:var(--text-muted);max-width:300px;overflow:hidden;text-overflow:ellipsis;">
              {{ log.message || '—' }}
            </td>
            <td style="font-size:0.8rem;" [title]="getISODate(log.started_at)">{{ formatDate(log.started_at) }}</td>
          </tr>
        </tbody>
      </table>

      <div *ngIf="syncLogs.length === 0" style="color:var(--text-muted);font-size:0.85rem;">
        No sync activity yet.
      </div>
    </div>
  `,
})
export class SettingsComponent implements OnInit {
  instances: Instance[] = [];
  syncLogs: any[] = [];
  showAddForm = false;
  isSyncing = false;
  testingId: number | null = null;
  syncInterval = 60;

  constructor(private api: ApiService) {}

  get standardInstances(): Instance[] {
    return this.instances.filter(i => i.type !== 'plex');
  }

  get plexInstance(): Instance | undefined {
    return this.instances.find(i => i.type === 'plex');
  }

  ngOnInit() {
    this.loadInstances();
    this.loadSyncStatus();
    this.loadSettings();
  }

  loadInstances() {
    this.api.getInstances().subscribe({
      next: (instances) => this.instances = instances,
    });
  }

  loadSyncStatus() {
    this.api.getSyncStatus().subscribe({
      next: (status) => {
        this.isSyncing = status.isSyncing;
        this.syncLogs = status.recentLogs;
      },
    });
  }

  loadSettings() {
    this.api.getSettings().subscribe({
      next: (settings) => {
        this.syncInterval = parseInt(settings['sync_interval_minutes'] || '60', 10);
      },
    });
  }

  onInstanceSaved(data: Partial<Instance>) {
    this.api.createInstance(data).subscribe({
      next: () => {
        this.showAddForm = false;
        this.loadInstances();
      },
    });
  }

  deleteInstance(inst: Instance) {
    if (confirm(`Delete "${inst.name}"? This will remove the instance configuration.`)) {
      this.api.deleteInstance(inst.id!).subscribe({
        next: () => this.loadInstances(),
      });
    }
  }

  testInstance(inst: Instance) {
    this.testingId = inst.id!;
    this.api.testInstance(inst.id!).subscribe({
      next: (result) => {
        this.testingId = null;
        alert(result.success ? `✓ Connected (v${result.version})` : `✕ Failed: ${result.error}`);
      },
      error: () => {
        this.testingId = null;
        alert('Connection test failed');
      },
    });
  }

  triggerSync() {
    this.isSyncing = true;
    this.api.triggerSync().subscribe({
      next: () => {
        this.isSyncing = false;
        this.loadSyncStatus();
      },
      error: () => {
        this.isSyncing = false;
      },
    });
  }

  saveSyncInterval() {
    this.api.updateSettings({ sync_interval_minutes: String(this.syncInterval) }).subscribe({
      next: () => alert('Settings saved'),
    });
  }

  getTypeAbbr(type: string): string {
    const abbrs: Record<string, string> = {
      radarr: 'R', sonarr: 'S', seerr: 'Se', plex: 'P', tautulli: 'T', qbittorrent: 'qB',
    };
    return abbrs[type] || '?';
  }

  getIconBg(type: string): string {
    const colors: Record<string, string> = {
      radarr: 'rgba(255,165,0,0.2)', sonarr: 'rgba(62,203,240,0.2)',
      seerr: 'rgba(167,139,250,0.2)', plex: 'rgba(229,160,13,0.2)',
      tautulli: 'rgba(200,130,50,0.2)', qbittorrent: 'rgba(52,152,219,0.2)',
    };
    return colors[type] || 'rgba(100,100,100,0.2)';
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString();
  }

  getISODate(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }
}
