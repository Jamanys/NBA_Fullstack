// src/app/app.routes.ts

import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/home/home.component')
      .then(m => m.HomeComponent)
  },
  {
    path: 'scouting',
    loadComponent: () => import('./features/scouting/scouting.component')
      .then(m => m.ScoutingComponent)
  },
  {
    path: 'team',
    loadComponent: () => import('./features/team-profiles/team-profiles.component')
      .then(m => m.TeamProfilesComponent)
  },
  {
    path: 'player/:slug',
    loadComponent: () => import('./features/player-profile/player-profile.component')
      .then(m => m.PlayerProfileComponent)
  },
  {
    path: '**',
    redirectTo: ''
  }
];