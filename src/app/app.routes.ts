import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'lock/:group',
    loadComponent: () =>
      import('./features/lock/lock.component').then(m => m.LockComponent)
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
    canActivate: [authGuard],
    data: { authGroup: 'meta' }
  },
  {
    path: 'ad/:adId',
    loadComponent: () =>
      import('./features/ad-detail/ad-detail.component').then(m => m.AdDetailComponent),
    canActivate: [authGuard],
    data: { authGroup: 'meta' }
  },
  {
    path: 'attribution',
    loadComponent: () =>
      import('./features/attribution/attribution.component').then(m => m.AttributionComponent),
    canActivate: [authGuard],
    data: { authGroup: 'meta' }
  },
  {
    path: 'maturation',
    loadComponent: () =>
      import('./features/maturation/maturation.component').then(m => m.MaturationComponent),
    canActivate: [authGuard],
    data: { authGroup: 'meta' }
  },
  {
    path: 'frequency',
    loadComponent: () =>
      import('./features/frequency/frequency.component').then(m => m.FrequencyComponent),
    canActivate: [authGuard],
    data: { authGroup: 'meta' }
  },
  {
    path: 'duplicates',
    loadComponent: () =>
      import('./features/duplicates/duplicates.component').then(m => m.DuplicatesComponent),
    canActivate: [authGuard],
    data: { authGroup: 'meta' }
  },
  {
    path: 'health',
    loadComponent: () =>
      import('./features/health/health.component').then(m => m.HealthComponent),
    canActivate: [authGuard],
    data: { authGroup: 'meta' }
  },
  { path: '**', redirectTo: 'dashboard' }
];
