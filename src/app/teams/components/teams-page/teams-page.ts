import { DatePipe, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { EMPTY, catchError } from 'rxjs';

import { PokemonStore } from '../../../pokedex/state/pokemon.store';
import { TeamStore } from '../../state/team.store';
import { TeamBuilder } from '../team-builder/team-builder';

const SELECTED_TEAM_KEY = 'mini-pokedex:selected-team-id';

@Component({
  selector: 'app-teams-page',
  standalone: true,
  imports: [DatePipe, TeamBuilder],
  templateUrl: './teams-page.html',
  styleUrl: './teams-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamsPage {
  private readonly store = inject(TeamStore);
  private readonly pokemonStore = inject(PokemonStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly storage = this.getStorage();
  private readonly restoredTeamId = this.readSelectedTeamId();
  private readonly teamsLoaded = signal(false);
  private readonly selectionChanged = signal(false);

  readonly state = toSignal(this.store.state$, { requireSync: true });
  readonly pokemonState = toSignal(this.pokemonStore.state$, { requireSync: true });
  readonly loadError = signal<string | null>(null);
  readonly deleteErrors = signal<Record<string, string>>({});
  readonly skeletonCards = [1, 2, 3];
  readonly selectedTeamId = linkedSignal({
    source: computed(() => ({ state: this.state(), loaded: this.teamsLoaded() })),
    computation: ({ state, loaded }, previous): string | null => {
      const id = previous ? previous.value : this.restoredTeamId;
      // An empty initial store (or failed refresh) does not invalidate a saved selection.
      if (!loaded || state.loading || state.error || state.teams.some((team) => team.id === id)) {
        return id;
      }
      return null;
    },
  });
  readonly selectedTeam = computed(
    () => this.state().teams.find((team) => team.id === this.selectedTeamId()) ?? null,
  );
  readonly selectedMembers = computed(() => {
    const pokemonById = new Map(this.pokemonState().items.map((pokemon) => [pokemon.id, pokemon]));
    return (this.selectedTeam()?.pokemon_ids ?? []).map((id) => ({
      id,
      pokemon: pokemonById.get(id),
    }));
  });
  readonly selectedSummary = computed(() => {
    const known = this.selectedMembers().flatMap((member) =>
      member.pokemon ? [member.pokemon] : [],
    );
    const stats: Record<string, number> = {};
    const types: Record<string, number> = {};
    for (const pokemon of known) {
      for (const stat of pokemon.stats) stats[stat.name] = (stats[stat.name] ?? 0) + stat.baseStat;
      for (const type of pokemon.types) types[type.name] = (types[type.name] ?? 0) + 1;
    }
    return {
      knownCount: known.length,
      totalBaseStats: Object.values(stats).reduce((total, value) => total + value, 0),
      stats: Object.entries(stats).map(([name, total]) => ({ name, total })),
      types: Object.entries(types).map(([name, count]) => ({ name, count })),
    };
  });

  constructor() {
    effect(() => {
      const id = this.selectedTeamId();
      const team = this.selectedTeam();
      const loaded = this.teamsLoaded();
      const changed = this.selectionChanged();
      try {
        if (id && team) this.storage?.setItem(SELECTED_TEAM_KEY, id);
        else if (!id && (loaded || changed)) this.storage?.removeItem(SELECTED_TEAM_KEY);
      } catch {
        // Selection still works when browser storage is blocked or full.
      }
    });
    this.retry();
    this.loadPokemon();
  }

  selectTeam(id: string): void {
    if (!this.state().teams.some((team) => team.id === id)) return;
    this.selectedTeamId.set(id);
    this.selectionChanged.set(true);
  }

  private getStorage(): Storage | null {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return null;
    try {
      return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
      return null;
    }
  }

  private readSelectedTeamId(): string | null {
    try {
      return this.storage?.getItem(SELECTED_TEAM_KEY) || null;
    } catch {
      return null;
    }
  }

  retryPokemon(): void {
    this.loadPokemon(true);
  }

  private loadPokemon(forceRefresh = false): void {
    const request$ = forceRefresh
      ? this.pokemonStore.loadPage$(150, 0, true)
      : this.pokemonStore.loadPage$(150, 0);

    request$
      .pipe(
        catchError(() => EMPTY),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  retry(): void {
    if (this.state().loading) return;

    this.loadError.set(null);
    this.store
      .loadTeams$()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.teamsLoaded.set(true),
        error: () => this.loadError.set('Unable to load teams. Please try again.'),
      });
  }

  deleteTeam(id: string): void {
    if (
      this.state().deletingIds.includes(id) ||
      !this.state().teams.some((team) => team.id === id)
    ) {
      return;
    }

    this.deleteErrors.update((errors) => {
      const remaining = { ...errors };
      delete remaining[id];
      return remaining;
    });
    this.store
      .deleteTeam$(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          if (this.selectedTeamId() === id) {
            this.selectedTeamId.set(null);
            this.selectionChanged.set(true);
          }
        },
        error: () =>
          this.deleteErrors.update((errors) => ({
            ...errors,
            [id]: 'Unable to delete this team. Select Delete to try again.',
          })),
      });
  }
}
