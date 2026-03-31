import { Component, Input, Output, EventEmitter, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Instance, ApiService, TestConnectionResult } from '../../services/api.service';

@Component({
  selector: 'app-instance-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="card" style="margin-bottom:var(--space-md);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-md);">
        <h4 style="font-weight:600;">{{ isEditing ? 'Edit' : 'Add' }} {{ typeLabel }} Instance</h4>
        <button class="btn btn-ghost btn-sm" (click)="cancel.emit()" *ngIf="showCancel">✕</button>
      </div>

      <!-- Type selector — only shown when fixedType is not set -->
      <div class="form-group" *ngIf="!fixedType">
        <label class="form-label" for="instance-type">Type</label>
        <select class="form-select" [(ngModel)]="formData.type" id="instance-type" [disabled]="isEditing">
          <option value="">Select type...</option>
          <option value="radarr">Radarr</option>
          <option value="sonarr">Sonarr</option>
          <option value="seerr">Seerr / Overseerr</option>
          <option value="tautulli">Tautulli</option>
          <option value="qbittorrent">qBittorrent</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" for="instance-name">Name</label>
        <input class="form-input" [(ngModel)]="formData.name" id="instance-name" [placeholder]="namePlaceholder" />
      </div>

      <!-- Standard: URL + API Key (radarr, sonarr, seerr, tautulli) -->
      <ng-container *ngIf="isStandardApiType">
        <div class="form-group">
          <label class="form-label" for="instance-url">URL</label>
          <input class="form-input" [(ngModel)]="formData.url" id="instance-url" [placeholder]="urlPlaceholder" />
        </div>
        <div class="form-group">
          <label class="form-label" for="instance-apikey">API Key</label>
          <input class="form-input" [(ngModel)]="formData.api_key" id="instance-apikey" placeholder="Your API key" />
        </div>
      </ng-container>

      <!-- qBittorrent: URL + (username/password OR API key) -->
      <ng-container *ngIf="formData.type === 'qbittorrent'">
        <div class="form-group">
          <label class="form-label" for="instance-url">qBittorrent WebUI URL</label>
          <input class="form-input" [(ngModel)]="formData.url" id="instance-url" placeholder="http://192.168.1.100:8080" />
        </div>

        <!-- Auth mode toggle -->
        <div style="display:flex;gap:var(--space-sm);margin-bottom:var(--space-md);">
          <button
            class="filter-chip"
            [class.active]="qbtAuthMode === 'credentials'"
            (click)="qbtAuthMode = 'credentials'"
          >Username & Password</button>
          <button
            class="filter-chip"
            [class.active]="qbtAuthMode === 'apikey'"
            (click)="qbtAuthMode = 'apikey'"
          >API Key (v5.2+)</button>
        </div>

        <ng-container *ngIf="qbtAuthMode === 'credentials'">
          <div class="form-group">
            <label class="form-label" for="instance-username">Username</label>
            <input class="form-input" [(ngModel)]="formData.username" id="instance-username" placeholder="admin" />
          </div>
          <div class="form-group">
            <label class="form-label" for="instance-password">Password</label>
            <input class="form-input" type="password" [(ngModel)]="formData.password" id="instance-password" placeholder="Password" />
          </div>
        </ng-container>

        <ng-container *ngIf="qbtAuthMode === 'apikey'">
          <div class="form-group">
            <label class="form-label" for="instance-apikey">API Key</label>
            <input class="form-input" [(ngModel)]="formData.api_key" id="instance-apikey" placeholder="qBittorrent API key" />
            <p style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">
              Available in qBittorrent 5.2.0+. Found in Settings → Web UI → Authentication.
            </p>
          </div>
        </ng-container>
      </ng-container>

      <!-- Test result -->
      <div *ngIf="testResult" class="connection-test" [ngClass]="testResult.success ? 'success' : 'failure'">
        <span *ngIf="testResult.success">✓ Connected</span>
        <span *ngIf="testResult.success && testResult.version"> — v{{ testResult.version }}</span>
        <span *ngIf="testResult.success && testResult.friendlyName"> ({{ testResult.friendlyName }})</span>
        <span *ngIf="testResult.success && testResult.variant"> ({{ testResult.variant }})</span>
        <span *ngIf="!testResult.success">✕ Failed: {{ testResult.error }}</span>
      </div>

      <div *ngIf="isTesting" class="connection-test testing">
        <span class="spinner"></span> Testing connection...
      </div>

      <!-- Actions -->
      <div style="display:flex;gap:var(--space-sm);margin-top:var(--space-lg);">
        <button class="btn btn-secondary" (click)="testConnection()" [disabled]="isTesting || !hasMinFields" id="test-connection-btn">
          Test Connection
        </button>
        <button class="btn btn-primary" (click)="save()" [disabled]="!isValid" id="save-instance-btn">
          {{ isEditing ? 'Update' : 'Add' }} Instance
        </button>
      </div>
    </div>
  `,
})
export class InstanceFormComponent {
  @Input() isEditing = false;
  @Input() showCancel = true;

  /** Lock the type — when set, hides the type dropdown and pre-fills the type */
  @Input() set fixedType(val: string | undefined) {
    this._fixedType = val;
    if (val) {
      this.formData.type = val;
    }
  }
  get fixedType(): string | undefined {
    return this._fixedType;
  }
  private _fixedType: string | undefined;

  @Input() set instance(val: Instance | null) {
    if (val) {
      this.formData = { ...val };
      this.isEditing = true;
      if (val.type === 'qbittorrent' && val.api_key) {
        this.qbtAuthMode = 'apikey';
      }
    }
  }

  @Output() saved = new EventEmitter<Partial<Instance>>();
  @Output() cancel = new EventEmitter<void>();

  formData: Partial<Instance> = {
    type: '',
    name: '',
    url: '',
    api_key: '',
    username: '',
    password: '',
  };

  testResult: TestConnectionResult | null = null;
  isTesting = false;
  qbtAuthMode: 'credentials' | 'apikey' = 'credentials';

  constructor(private api: ApiService) {}

  get isStandardApiType(): boolean {
    return ['radarr', 'sonarr', 'seerr', 'tautulli'].includes(this.formData.type || '');
  }

  get isValid(): boolean {
    if (!this.formData.type || !this.formData.name) return false;

    if (this.formData.type === 'qbittorrent') {
      if (!this.formData.url) return false;
      if (this.qbtAuthMode === 'credentials') {
        return !!(this.formData.username);
      }
      return !!(this.formData.api_key);
    }

    return !!(this.formData.url);
  }

  get hasMinFields(): boolean {
    return !!(this.formData.type && this.formData.url);
  }

  get typeLabel(): string {
    const labels: Record<string, string> = {
      radarr: 'Radarr',
      sonarr: 'Sonarr',
      seerr: 'Seerr',
      tautulli: 'Tautulli',
      qbittorrent: 'qBittorrent',
    };
    return labels[this.formData.type || ''] || '';
  }

  get namePlaceholder(): string {
    const placeholders: Record<string, string> = {
      radarr: 'e.g. Radarr 4K',
      sonarr: 'e.g. Sonarr Anime',
      seerr: 'e.g. Seerr',
      tautulli: 'e.g. Tautulli',
      qbittorrent: 'e.g. qBittorrent',
    };
    return placeholders[this.formData.type || ''] || 'Instance name';
  }

  get urlPlaceholder(): string {
    const placeholders: Record<string, string> = {
      radarr: 'http://192.168.1.100:7878',
      sonarr: 'http://192.168.1.100:8989',
      seerr: 'http://192.168.1.100:5055',
      tautulli: 'http://192.168.1.100:8181',
    };
    return placeholders[this.formData.type || ''] || 'http://hostname:port';
  }

  testConnection() {
    this.isTesting = true;
    this.testResult = null;

    this.api.testInstanceUnsaved(this.formData).subscribe({
      next: (result) => {
        this.testResult = result;
        this.isTesting = false;
      },
      error: (err) => {
        this.testResult = { success: false, error: err.message || 'Connection failed' };
        this.isTesting = false;
      },
    });
  }

  save() {
    if (!this.isValid) return;

    this.isTesting = true;
    this.testResult = null;

    this.api.testInstanceUnsaved(this.formData).subscribe({
      next: (result) => {
        this.isTesting = false;
        this.testResult = result;
        
        if (result.success) {
          this.saved.emit({ ...this.formData });
          // Reset form for adding another instance
          this.formData = {
            type: this.fixedType || '',
            name: '',
            url: '',
            api_key: '',
            username: '',
            password: '',
          };
          this.testResult = null;
        }
      },
      error: (err) => {
        this.isTesting = false;
        this.testResult = { success: false, error: err.message || 'Connection failed' };
      },
    });
  }
}
