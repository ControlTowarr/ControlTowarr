import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent),
  },
  {
    path: 'media/:id',
    loadComponent: () =>
      import('./pages/media-detail/media-detail.component').then(m => m.MediaDetailComponent),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./pages/settings/settings.component').then(m => m.SettingsComponent),
  },
  {
    path: 'stats',
    loadComponent: () =>
      import('./pages/stats/stats.component').then(m => m.StatsComponent),
  },
  {
    path: 'deletions',
    loadComponent: () =>
      import('./pages/deletions/deletions.component').then(m => m.DeletionsComponent),
  },
  {
    path: 'setup',
    loadComponent: () =>
      import('./pages/setup/setup.component').then(m => m.SetupComponent),
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
