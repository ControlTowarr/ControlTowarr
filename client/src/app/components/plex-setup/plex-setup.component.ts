import { Component, Input, Output, EventEmitter, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Instance, ApiService } from '../../services/api.service';

@Component({
  selector: 'app-plex-setup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div [class.card]="cardStyle" [style.margin-bottom]="cardStyle ? 'var(--space-xl)' : '0'">
      <h3 *ngIf="cardStyle" style="font-weight:600;font-size:1.1rem;margin-bottom:var(--space-md);display:flex;align-items:center;gap:8px;">
        <span class="badge-plex" style="width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;border-radius:4px;color:#e5a00d;background:rgba(229,160,13,0.2);">P</span>
        Plex Integration
      </h3>

      <!-- State: Connected -->
      <div *ngIf="plexInstance" class="setup-state connected">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <div style="font-weight:600;color:var(--color-success);display:flex;align-items:center;gap:6px;">
              ✓ Connected to Plex
            </div>
            <div style="font-size:0.85rem;color:var(--text-muted);margin-top:4px;">
              Server: {{ plexInstance.url }}
            </div>
          </div>
          <button class="btn btn-ghost btn-sm" style="color:var(--color-danger);" (click)="disconnect()">Disconnect</button>
        </div>
      </div>

      <!-- State: Not Connected -->
      <div *ngIf="!plexInstance">
        <!-- Step 1: Auth -->
        <div *ngIf="!authToken" class="setup-state auth">
          <p style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:var(--space-md);">
            Sign in with your Plex account to discover your servers and synchronize watch history.
          </p>
          <button class="btn btn-primary" (click)="authenticatePlex()" [disabled]="plexPinId !== null" style="width:100%;">
            {{ plexPinId ? 'Waiting for authorization...' : 'Sign in with Plex' }}
          </button>
          <p style="font-size:0.75rem;color:var(--text-muted);margin-top:8px;text-align:center;" *ngIf="plexPinId">
            A popup window has been opened. Please sign in there.
          </p>
          <div *ngIf="authError" style="color:var(--color-danger);font-size:0.85rem;margin-top:8px;text-align:center;">
            {{ authError }}
          </div>
        </div>

        <!-- Step 2: Select Server -->
        <div *ngIf="authToken" class="setup-state select-server">
          <div style="display:flex;align-items:center;gap:8px;color:var(--color-success);margin-bottom:var(--space-md);padding:12px;background:#1a4d2e33;border-radius:4px;border:1px solid #1a4d2e;">
            ✓ Successfully authenticated
          </div>
          
          <div class="form-group">
            <label class="form-label">Select Plex Server</label>
            <div *ngIf="isLoadingServers" style="font-size:0.85rem;color:var(--text-muted);">Finding servers...</div>
            <select *ngIf="!isLoadingServers && servers.length > 0" class="form-select" [(ngModel)]="selectedServerUrl">
              <option value="">-- Choose a server --</option>
              <optgroup *ngFor="let srv of servers" [label]="srv.name">
                <option *ngFor="let conn of srv.connections" [value]="conn.uri">
                  {{ conn.local ? 'Local' : 'Remote' }} - {{ conn.uri }}
                </option>
              </optgroup>
            </select>
            <div *ngIf="!isLoadingServers && servers.length === 0" style="font-size:0.85rem;color:var(--color-warning);">
              No servers found on this account. You can manually enter the URL below.
            </div>
          </div>

          <div class="form-group" style="margin-top:var(--space-md);">
            <label class="form-label">Manual URL Override</label>
            <input class="form-input" [(ngModel)]="selectedServerUrl" placeholder="http://192.168.1.100:32400" />
            <p style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">
              Only needed if the auto-discovered URLs above do not work. Ensure there is no trailing slash.
            </p>
          </div>

          <div style="display:flex;gap:var(--space-sm);justify-content:flex-end;margin-top:var(--space-lg);">
            <button class="btn btn-ghost" (click)="reset()">Cancel</button>
            <button class="btn btn-primary" (click)="saveServer()" [disabled]="!selectedServerUrl || isSaving">
              {{ isSaving ? 'Saving...' : 'Connect Server' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class PlexSetupComponent implements OnDestroy {
  @Input() plexInstance: Instance | undefined;
  @Input() cardStyle = true;
  @Output() instanceSaved = new EventEmitter<Instance>();
  @Output() instanceDeleted = new EventEmitter<number>();

  plexPinId: number | null = null;
  plexPollingInterval: any;
  authToken: string | null = null;
  authError: string | null = null;

  isLoadingServers = false;
  servers: any[] = [];
  selectedServerUrl = '';
  isSaving = false;

  constructor(private api: ApiService) {}

  ngOnDestroy() {
    this.stopPlexPolling();
  }

  authenticatePlex() {
    this.authError = null;
    this.api.getPlexPin().subscribe({
      next: (pinData) => {
        this.plexPinId = pinData.id;
        const authUrl = `https://app.plex.tv/auth/#!?clientID=${pinData.clientIdentifier}&code=${pinData.code}&context[device][product]=ControlTowarr`;
        window.open(authUrl, '_blank', 'width=600,height=700');
        this.startPlexPolling();
      },
      error: () => {
        this.authError = 'Failed to request Plex PIN';
      }
    });
  }

  startPlexPolling() {
    this.stopPlexPolling();
    this.plexPollingInterval = setInterval(() => {
      if (!this.plexPinId) return;
      this.api.pollPlexPin(this.plexPinId).subscribe({
        next: (result) => {
          if (result.authToken) {
            this.authToken = result.authToken;
            this.stopPlexPolling();
            this.fetchServers();
          }
        }
      });
    }, 2000);
  }

  stopPlexPolling() {
    if (this.plexPollingInterval) {
      clearInterval(this.plexPollingInterval);
      this.plexPollingInterval = null;
    }
  }

  fetchServers() {
    if (!this.authToken) return;
    this.isLoadingServers = true;
    this.api.getPlexServers(this.authToken).subscribe({
      next: (servers) => {
        this.servers = servers;
        this.isLoadingServers = false;
        // Auto-select first local connection if available
        if (servers.length > 0) {
           const local = servers[0].connections.find((c: any) => c.local);
           if (local) this.selectedServerUrl = local.uri;
           else if (servers[0].connections.length > 0) this.selectedServerUrl = servers[0].connections[0].uri;
        }
      },
      error: () => {
        this.isLoadingServers = false;
        this.authError = 'Failed to fetch servers. You can enter the URL manually.';
      }
    });
  }

  saveServer() {
    if (!this.selectedServerUrl || !this.authToken) return;
    this.isSaving = true;

    const newInstance: Partial<Instance> = {
      type: 'plex',
      name: 'Plex',
      url: this.selectedServerUrl,
      api_key: this.authToken,
      username: '',
      password: ''
    };

    if (this.plexInstance && this.plexInstance.id) {
      // shouldn't happen usually from this UI flow since the form is hidden when connected, 
      // but just in case we allow updating. The current UI hides the form when connected.
      this.api.updateInstance(this.plexInstance.id, newInstance).subscribe({
        next: (res) => {
          this.isSaving = false;
          this.instanceSaved.emit(res);
        },
        error: () => {
          this.isSaving = false;
        }
      });
    } else {
      this.api.createInstance(newInstance).subscribe({
        next: (res) => {
          this.isSaving = false;
          this.instanceSaved.emit(res);
        },
        error: () => {
          this.isSaving = false;
        }
      });
    }
  }

  disconnect() {
    if (!this.plexInstance || !this.plexInstance.id) return;
    if (confirm('Disconnect Plex?')) {
      this.api.deleteInstance(this.plexInstance.id).subscribe({
        next: () => {
          this.instanceDeleted.emit(this.plexInstance!.id!);
          this.reset();
        }
      });
    }
  }

  reset() {
    this.stopPlexPolling();
    this.plexPinId = null;
    this.authToken = null;
    this.servers = [];
    this.selectedServerUrl = '';
    this.authError = null;
    this.isSaving = false;
  }
}
