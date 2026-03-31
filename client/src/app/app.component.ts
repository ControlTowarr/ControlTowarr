import { Component, OnInit } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { ApiService } from './services/api.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, SidebarComponent],
  template: `
    <div class="app-layout" *ngIf="!isSetupRoute">
      <app-sidebar></app-sidebar>
      <main class="main-content">
        <router-outlet></router-outlet>
      </main>
    </div>
    <div *ngIf="isSetupRoute">
      <router-outlet></router-outlet>
    </div>
  `,
  styles: [],
})
export class AppComponent implements OnInit {
  isSetupRoute = false;

  constructor(
    private router: Router,
    private api: ApiService
  ) {
    this.router.events.subscribe(() => {
      this.isSetupRoute = this.router.url.startsWith('/setup');
    });
  }

  ngOnInit() {
    // Check if setup is completed
    this.api.getSettings().subscribe({
      next: (settings) => {
        if (settings['setup_completed'] !== 'true') {
          this.router.navigate(['/setup']);
        }
      },
      error: () => {
        // API not reachable; stay on current page
      },
    });
  }
}
