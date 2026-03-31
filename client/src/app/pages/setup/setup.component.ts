import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService, Instance } from '../../services/api.service';
import { InstanceFormComponent } from '../../components/instance-form/instance-form.component';
import { PlexSetupComponent } from '../../components/plex-setup/plex-setup.component';

interface SetupStep {
  type: string;
  label: string;
  description: string;
  required: boolean;
}

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [CommonModule, InstanceFormComponent, PlexSetupComponent],
  template: `
    <div class="setup-container">
      <!-- Header -->
      <div style="text-align:center;margin-bottom:var(--space-2xl);">
        <div style="margin-bottom:var(--space-md);">
          <svg width="56" height="56" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="8" fill="url(#setup-grad)"/>
            <path d="M8 14h12M14 8v12M10 10l8 8M18 10l-8 8" stroke="white" stroke-width="2" stroke-linecap="round"/>
            <defs>
              <linearGradient id="setup-grad" x1="0" y1="0" x2="28" y2="28">
                <stop stop-color="#3ecbf0"/>
                <stop offset="1" stop-color="#a78bfa"/>
              </linearGradient>
            </defs>
          </svg>
        </div>
        <h1 class="page-title" style="font-size:2rem;">Welcome to ControlTowarr</h1>
        <p class="page-subtitle" style="max-width:500px;margin:auto;">
          Let's connect your media services. Add your instances step by step — you can always change these later in Settings.
        </p>
      </div>

      <!-- Progress dots -->
      <div class="setup-progress">
        <div
          *ngFor="let step of steps; let i = index"
          class="setup-progress-dot"
          [class.active]="currentStep === i"
          [class.completed]="currentStep > i"
        ></div>
      </div>

      <!-- Current step -->
      <div class="setup-step" *ngIf="currentStep < steps.length">
        <div class="setup-step-header">
          <div class="setup-step-number">{{ currentStep + 1 }}</div>
          <div>
            <div class="setup-step-title">
              {{ currentStepConfig.label }}
              <span *ngIf="!currentStepConfig.required" style="font-size:0.8rem;color:var(--text-muted);font-weight:400;"> (optional)</span>
            </div>
            <p style="font-size:0.85rem;color:var(--text-secondary);">{{ currentStepConfig.description }}</p>
          </div>
        </div>

        <!-- Added instances for this step -->
        <div *ngIf="getInstancesForStep(currentStepConfig.type).length > 0" style="margin-bottom:var(--space-md);">
          <div
            *ngFor="let inst of getInstancesForStep(currentStepConfig.type)"
            class="instance-item"
            style="margin-bottom:var(--space-sm);"
          >
            <div class="instance-item-info">
              <div
                class="instance-item-icon"
                [style.background]="getIconBg(inst.type)"
                [style.color]="getIconColor(inst.type)"
              >
                {{ getTypeAbbr(inst.type) }}
              </div>
              <div>
                <div style="font-weight:600;">{{ inst.name }}</div>
                <div style="font-size:0.8rem;color:var(--text-muted);">{{ inst.url }}</div>
              </div>
            </div>
            <span class="badge badge-success">✓ Added</span>
          </div>
        </div>

        <!-- Instance form (locked to current step type) -->
        <app-instance-form
          *ngIf="currentStepConfig.type !== 'plex'"
          [fixedType]="currentStepConfig.type"
          [showCancel]="false"
          (saved)="onInstanceSaved($event)"
        ></app-instance-form>

        <app-plex-setup
          *ngIf="currentStepConfig.type === 'plex'"
          [cardStyle]="false"
          [plexInstance]="getPlexInstance()"
          (instanceSaved)="onInstanceSaved($event)"
          (instanceDeleted)="onInstanceDeleted($event)"
        ></app-plex-setup>

        <!-- Navigation buttons -->
        <div style="display:flex;gap:var(--space-sm);margin-top:var(--space-md);justify-content:space-between;">
          <button *ngIf="currentStep > 0" class="btn btn-ghost" (click)="prevStep()">← Back</button>
          <div *ngIf="currentStep === 0" style="flex:1;"></div>

          <div style="display:flex;gap:var(--space-sm);">
            <button
              *ngIf="!currentStepConfig.required || hasInstancesForStep(currentStepConfig.type)"
              class="btn"
              [ngClass]="isLastStep ? 'btn-primary' : 'btn-secondary'"
              (click)="isLastStep ? finishSetup() : nextStep()"
            >
              {{ getNextButtonLabel() }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class SetupComponent {
  steps: SetupStep[] = [
    {
      type: 'radarr',
      label: 'Connect Radarr',
      description: 'Add your Radarr instances for movie tracking. You can add multiple instances (e.g. Radarr 4K, Radarr 1080p).',
      required: false,
    },
    {
      type: 'sonarr',
      label: 'Connect Sonarr',
      description: 'Add your Sonarr instances for TV show tracking. You can add multiple instances.',
      required: false,
    },
    {
      type: 'seerr',
      label: 'Connect Seerr / Overseerr',
      description: 'Connects to Seerr or Overseerr to clean up media requests when you delete content.',
      required: false,
    },
    {
      type: 'plex',
      label: 'Connect Plex',
      description: 'Connects to your Plex server for library data and watch activity.',
      required: false,
    },
    {
      type: 'tautulli',
      label: 'Connect Tautulli',
      description: 'Connects to Tautulli for detailed watch history and statistics.',
      required: false,
    },
    {
      type: 'qbittorrent',
      label: 'Connect qBittorrent',
      description: 'Track seeding status and automatically remove torrents when you delete content.',
      required: false,
    },
  ];

  currentStep = 0;
  addedInstances: Instance[] = [];

  constructor(
    private api: ApiService,
    private router: Router
  ) {}

  get currentStepConfig(): SetupStep {
    return this.steps[this.currentStep];
  }

  get isLastStep(): boolean {
    return this.currentStep === this.steps.length - 1;
  }

  hasInstancesForStep(type: string): boolean {
    return this.addedInstances.some(i => i.type === type);
  }

  getInstancesForStep(type: string): Instance[] {
    return this.addedInstances.filter(i => i.type === type);
  }

  getNextButtonLabel(): string {
    if (this.isLastStep) {
      return 'Finish Setup & Start Syncing';
    }
    if (this.hasInstancesForStep(this.currentStepConfig.type)) {
      return 'Continue →';
    }
    return 'Skip →';
  }

  onInstanceSaved(data: Partial<Instance>) {
    // If it's a plex update that already had an ID, update our local array
    if (data.id && this.addedInstances.some(i => i.id === data.id)) {
      this.addedInstances = this.addedInstances.map(i => i.id === data.id ? (data as Instance) : i);
      return;
    }

    if (!data.id && data.type !== 'plex') {
       this.api.createInstance(data).subscribe({
         next: (instance) => {
           this.addedInstances.push(instance);
         },
       });
       return;
    }
    
    // Plex from plex-setup already hits the API
    if (data.type === 'plex' && data.id) {
       this.addedInstances.push(data as Instance);
    }
  }

  onInstanceDeleted(id: number) {
    this.addedInstances = this.addedInstances.filter(i => i.id !== id);
  }

  getPlexInstance(): Instance | undefined {
    return this.addedInstances.find(i => i.type === 'plex');
  }

  nextStep() {
    if (this.currentStep < this.steps.length - 1) {
      this.currentStep++;
    }
  }

  prevStep() {
    if (this.currentStep > 0) {
      this.currentStep--;
    }
  }

  finishSetup() {
    this.api.updateSettings({ setup_completed: 'true' }).subscribe({
      next: () => {
        if (this.addedInstances.length > 0) {
          this.api.triggerSync().subscribe();
        }
        this.router.navigate(['/dashboard']);
      },
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

  getIconColor(type: string): string {
    const colors: Record<string, string> = {
      radarr: '#ffa500', sonarr: '#3ecbf0',
      seerr: '#a78bfa', plex: '#e5a00d',
      tautulli: '#c88232', qbittorrent: '#3498db',
    };
    return colors[type] || '#888';
  }
}
