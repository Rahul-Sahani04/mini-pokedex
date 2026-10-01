import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'pokedex' },
  {
    path: 'pokedex',
    loadComponent: () =>
      import('./pokedex/components/pokedex-page/pokedex-page').then(
        ({ PokedexPage }) => PokedexPage,
      ),
  },
  {
    path: 'teams',
    loadComponent: () =>
      import('./teams/components/teams-page/teams-page').then(({ TeamsPage }) => TeamsPage),
  },
  { path: '**', redirectTo: 'pokedex' },
];
