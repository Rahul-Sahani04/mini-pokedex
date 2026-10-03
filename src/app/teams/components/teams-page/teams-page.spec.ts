import { Component, input, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BehaviorSubject, Subject, defer, finalize, of, tap, throwError } from 'rxjs';

import type { PokemonListItem } from '../../../pokedex/models';
import { PokemonStore } from '../../../pokedex/state/pokemon.store';
import type { PokemonState } from '../../../pokedex/state/pokemon.store';
import type { Team } from '../../models';
import { TeamStore } from '../../state/team.store';
import type { TeamState } from '../../state/team.store';
import { TeamBuilder } from '../team-builder/team-builder';
import { TeamsPage } from './teams-page';

@Component({ selector: 'app-team-builder', template: '' })
class TeamBuilderStub {
  readonly items = input.required<readonly PokemonListItem[]>();
  readonly pokemonLoading = input(false);
  readonly pokemonError = input<string | null>(null);
  readonly pokemonRetry = output<void>();
}

const team: Team = {
  id: '1',
  trainer_id: '1',
  name: 'Kanto Starters',
  pokemon_ids: [25, 6, 9],
  created_at: '2024-01-15T10:00:00Z',
};

describe('TeamsPage', () => {
  let state$: BehaviorSubject<TeamState>;
  let loadTeams$: ReturnType<typeof vi.fn>;
  let deleteTeam$: ReturnType<typeof vi.fn>;
  let pokemonState$: BehaviorSubject<PokemonState>;
  let loadPage$: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    state$ = new BehaviorSubject<TeamState>({
      teams: [],
      loading: false,
      error: null,
      creating: false,
      deletingIds: [],
    });
    loadTeams$ = vi.fn(() => of([]));
    deleteTeam$ = vi.fn(() => of(team));
    pokemonState$ = new BehaviorSubject<PokemonState>({
      items: [],
      loading: false,
      error: null,
      detail: null,
      detailLoading: false,
      detailError: null,
    });
    loadPage$ = vi.fn(() => of([]));
    TestBed.configureTestingModule({
      imports: [TeamsPage],
      providers: [
        { provide: TeamStore, useValue: { state$, loadTeams$, deleteTeam$ } },
        { provide: PokemonStore, useValue: { state$: pokemonState$, loadPage$ } },
      ],
    });
    TestBed.overrideComponent(TeamsPage, {
      remove: { imports: [TeamBuilder] },
      add: { imports: [TeamBuilderStub] },
    });
  });

  it('shows loading, retries an error, and lists the returned teams', async () => {
    const first = new Subject<Team[]>();
    loadTeams$.mockImplementationOnce(() =>
      defer(() => {
        state$.next({ ...state$.value, loading: true, error: null });
        return first;
      }),
    );
    const fixture = TestBed.createComponent(TeamsPage);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Loading teams');
    expect(root.querySelectorAll('.teams-page__card--skeleton')).toHaveLength(3);
    expect(root.querySelector('app-team-builder')).not.toBeNull();

    state$.next({
      ...state$.value,
      loading: false,
      error: 'Unable to load teams. Please try again.',
    });
    first.error(new Error('offline'));
    await fixture.whenStable();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Couldn’t load teams');
    expect(root.querySelector('app-team-builder')).not.toBeNull();
    loadTeams$.mockImplementationOnce(() =>
      defer(() => {
        state$.next({ ...state$.value, loading: true, error: null });
        state$.next({ ...state$.value, teams: [team], loading: false });
        return of([team]);
      }),
    );
    (root.querySelector('.teams-page__state button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(loadTeams$).toHaveBeenCalledTimes(2);
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(root.querySelector('.teams-page__card')?.textContent).toContain('Kanto Starters');
    expect(root.querySelector('.teams-page__card')?.textContent).toContain('3');
  });

  it('shows an explicit empty state after a successful empty response', async () => {
    const fixture = TestBed.createComponent(TeamsPage);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('No teams yet');
    expect(fixture.nativeElement.querySelector('.teams-page__card')).toBeNull();
  });

  it('loads picker Pokémon independently and forwards loading, errors, and forced retries', async () => {
    const pending = new Subject<PokemonListItem[]>();
    loadPage$.mockImplementationOnce(() =>
      defer(() => {
        pokemonState$.next({ ...pokemonState$.value, loading: true });
        return pending;
      }),
    );
    const fixture = TestBed.createComponent(TeamsPage);
    await fixture.whenStable();
    const builder = fixture.debugElement.query(By.directive(TeamBuilderStub))
      .componentInstance as TeamBuilderStub;
    expect(loadPage$).toHaveBeenCalledExactlyOnceWith(150, 0);
    expect(builder.pokemonLoading()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('No teams yet');

    pokemonState$.next({
      ...pokemonState$.value,
      loading: false,
      error: 'Unable to load Pokémon.',
    });
    pending.error(new Error('offline'));
    await fixture.whenStable();
    expect(builder.pokemonError()).toBe('Unable to load Pokémon.');
    expect(builder.pokemonLoading()).toBe(false);

    const items: PokemonListItem[] = [
      {
        id: 25,
        name: 'pikachu',
        height: 4,
        weight: 60,
        stats: [],
        types: [],
        sprite: {
          backDefault: null,
          backShiny: null,
          frontDefault: null,
          frontShiny: null,
          officialArtwork: null,
        },
      },
    ];
    loadPage$.mockImplementationOnce(() =>
      defer(() => {
        pokemonState$.next({ ...pokemonState$.value, items, loading: false, error: null });
        return of(items);
      }),
    );
    builder.pokemonRetry.emit();
    await fixture.whenStable();
    expect(loadPage$).toHaveBeenLastCalledWith(150, 0, true);
    expect(loadPage$).toHaveBeenCalledTimes(2);
    expect(loadTeams$).toHaveBeenCalledTimes(1);
    expect(builder.items()).toEqual(items);
    expect(builder.pokemonError()).toBeNull();
  });

  it('cancels an in-flight picker load when leaving the page', () => {
    const cancelled = vi.fn();
    loadPage$.mockReturnValueOnce(new Subject<PokemonListItem[]>().pipe(finalize(cancelled)));
    const fixture = TestBed.createComponent(TeamsPage);
    fixture.destroy();
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it('keeps a team visible while deletion is pending, then removes it on success', async () => {
    state$.next({ ...state$.value, teams: [team] });
    const pending = new Subject<Team>();
    deleteTeam$.mockImplementationOnce(() =>
      defer(() => {
        state$.next({ ...state$.value, deletingIds: [team.id] });
        return pending.pipe(
          tap(() => state$.next({ ...state$.value, teams: [], deletingIds: [] })),
        );
      }),
    );
    const fixture = TestBed.createComponent(TeamsPage);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const button = root.querySelector('.teams-page__button--delete') as HTMLButtonElement;
    button.click();
    await fixture.whenStable();
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Deleting');
    expect(root.textContent).toContain(team.name);
    button.click();
    expect(deleteTeam$).toHaveBeenCalledTimes(1);
    pending.next(team);
    pending.complete();
    await fixture.whenStable();
    expect(root.textContent).toContain('No teams yet');
  });

  it('retains the team and permits another attempt after a failed delete', async () => {
    state$.next({ ...state$.value, teams: [team] });
    deleteTeam$.mockReturnValueOnce(throwError(() => new Error('backend detail')));
    const fixture = TestBed.createComponent(TeamsPage);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const button = root.querySelector('.teams-page__button--delete') as HTMLButtonElement;
    button.click();
    await fixture.whenStable();
    expect(root.querySelector('.teams-page__action-error')?.textContent).toContain(
      'Select Delete to try again',
    );
    expect(root.textContent).toContain(team.name);
    button.click();
    await fixture.whenStable();
    expect(deleteTeam$).toHaveBeenCalledTimes(2);
    expect(root.querySelector('.teams-page__action-error')).toBeNull();
  });
});
