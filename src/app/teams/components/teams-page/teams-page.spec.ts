import { Component, PLATFORM_ID, input, output } from '@angular/core';
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

const selectionKey = 'mini-pokedex:selected-team-id';

function pokemon(id: number, name: string, stats: number[], types: string[]): PokemonListItem {
  return {
    id,
    name,
    height: 4,
    weight: 60,
    stats: stats.map((baseStat, index) => ({ name: ['hp', 'attack'][index], baseStat, effort: 0 })),
    types: types.map((name, index) => ({ name, slot: index + 1 })),
    sprite: {
      backDefault: null,
      backShiny: null,
      frontDefault: null,
      frontShiny: null,
      officialArtwork: null,
    },
  };
}

describe('TeamsPage', () => {
  let state$: BehaviorSubject<TeamState>;
  let loadTeams$: ReturnType<typeof vi.fn>;
  let deleteTeam$: ReturnType<typeof vi.fn>;
  let pokemonState$: BehaviorSubject<PokemonState>;
  let loadPage$: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.removeItem(selectionKey);
    state$ = new BehaviorSubject<TeamState>({
      teams: [],
      loading: false,
      loadError: null,
      mutationError: null,
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

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem(selectionKey);
  });

  it('lets the user select a team, persists it, and restores it when the page remounts', async () => {
    const other = { ...team, id: '2', name: 'Second team' };
    state$.next({ ...state$.value, teams: [team, other] });
    const fixture = TestBed.createComponent(TeamsPage);
    await fixture.whenStable();
    expect(fixture.componentInstance.selectedTeam()).toBeNull();
    const buttons = fixture.nativeElement.querySelectorAll('.teams-page__button--view');
    buttons[0].click();
    await fixture.whenStable();
    expect(fixture.componentInstance.selectedTeam()).toEqual(team);
    expect(buttons[0].getAttribute('aria-label')).toBe('View Kanto Starters');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem(selectionKey)).toBe(team.id);

    buttons[1].click();
    await fixture.whenStable();
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
    expect(localStorage.getItem(selectionKey)).toBe(other.id);
    fixture.destroy();

    const remounted = TestBed.createComponent(TeamsPage);
    await remounted.whenStable();
    expect(remounted.componentInstance.selectedTeam()).toEqual(other);
    expect(remounted.nativeElement.textContent).toContain('Selected team: Second team');
  });

  it('preserves a restored ID during the initial load and an error, then restores the arriving team', async () => {
    localStorage.setItem(selectionKey, team.id);
    const pending = new Subject<Team[]>();
    loadTeams$.mockImplementationOnce(() =>
      defer(() => {
        state$.next({ ...state$.value, loading: true });
        return pending;
      }),
    );
    const fixture = TestBed.createComponent(TeamsPage);
    await fixture.whenStable();
    expect(fixture.componentInstance.selectedTeamId()).toBe(team.id);
    expect(fixture.componentInstance.selectedTeam()).toBeNull();
    expect(localStorage.getItem(selectionKey)).toBe(team.id);
    state$.next({ ...state$.value, loading: false, loadError: 'offline' });
    pending.error(new Error('offline'));
    await fixture.whenStable();
    expect(localStorage.getItem(selectionKey)).toBe(team.id);

    loadTeams$.mockImplementationOnce(() =>
      defer(() => {
        state$.next({ ...state$.value, teams: [team], loadError: null });
        return of([team]);
      }),
    );
    fixture.componentInstance.retry();
    await fixture.whenStable();
    expect(fixture.componentInstance.selectedTeam()).toEqual(team);
    expect(localStorage.getItem(selectionKey)).toBe(team.id);
  });

  it('clears an unavailable persisted team only after a successful load without choosing a fallback', async () => {
    localStorage.setItem(selectionKey, 'missing');
    state$.next({ ...state$.value, teams: [team] });
    const fixture = TestBed.createComponent(TeamsPage);
    await fixture.whenStable();
    expect(fixture.componentInstance.selectedTeamId()).toBeNull();
    expect(fixture.componentInstance.selectedTeam()).toBeNull();
    expect(localStorage.getItem(selectionKey)).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('No team selected');
    expect(fixture.nativeElement.textContent).toContain(team.name);
  });

  it('clears a stale persisted ID after a successful empty response', async () => {
    localStorage.setItem(selectionKey, 'missing');
    const fixture = TestBed.createComponent(TeamsPage);
    await fixture.whenStable();
    expect(localStorage.getItem(selectionKey)).toBeNull();
    expect(fixture.componentInstance.selectedTeamId()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('No teams yet');
  });

  it('clears a deleted selection even while the initial team load is pending', async () => {
    localStorage.setItem(selectionKey, team.id);
    state$.next({ ...state$.value, teams: [team] });
    loadTeams$.mockImplementationOnce(() =>
      defer(() => {
        state$.next({ ...state$.value, loading: true });
        return new Subject<Team[]>();
      }),
    );
    deleteTeam$.mockImplementationOnce(() =>
      defer(() => {
        state$.next({ ...state$.value, teams: [] });
        return of(team);
      }),
    );
    const fixture = TestBed.createComponent(TeamsPage);
    await fixture.whenStable();
    fixture.componentInstance.deleteTeam(team.id);
    await fixture.whenStable();
    expect(localStorage.getItem(selectionKey)).toBeNull();
    expect(fixture.componentInstance.selectedTeamId()).toBeNull();
  });

  it('computes partial stats and dual-type counts from live Pokémon data and displays unknown IDs', async () => {
    const selected = { ...team, pokemon_ids: [25, 6, 999] };
    state$.next({ ...state$.value, teams: [selected] });
    pokemonState$.next({
      ...pokemonState$.value,
      items: [
        pokemon(25, 'pikachu', [35, 55], ['electric']),
        pokemon(6, 'charizard', [78, 84], ['fire', 'flying']),
        pokemon(9, 'blastoise', [79, 83], ['water']),
      ],
    });
    const fixture = TestBed.createComponent(TeamsPage);
    fixture.componentInstance.selectTeam(selected.id);
    await fixture.whenStable();
    expect(fixture.componentInstance.selectedSummary()).toEqual({
      knownCount: 2,
      totalBaseStats: 252,
      stats: [
        { name: 'hp', total: 113 },
        { name: 'attack', total: 139 },
      ],
      types: [
        { name: 'electric', count: 1 },
        { name: 'fire', count: 1 },
        { name: 'flying', count: 1 },
      ],
    });
    const text = fixture.nativeElement.querySelector('.teams-page__selection').textContent;
    expect(text).toContain('#25 — pikachu');
    expect(text).toContain('#999 — Details unavailable');
    expect(text).toContain('Data available for 2 of 3');
    expect(text).toContain('first 150');
    expect(text).toContain('Partial coverage');
    expect(text).toContain('Total base stats: 252');

    state$.next({
      ...state$.value,
      teams: [{ ...selected, name: 'Updated', pokemon_ids: [6, 9] }],
    });
    pokemonState$.next({
      ...pokemonState$.value,
      items: [
        pokemon(6, 'charizard', [78, 84], ['fire', 'flying']),
        pokemon(9, 'blastoise', [79, 83], ['water']),
      ],
    });
    await fixture.whenStable();
    expect(fixture.componentInstance.selectedSummary().totalBaseStats).toBe(324);
    expect(fixture.componentInstance.selectedSummary().knownCount).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('Selected team: Updated');
    expect(fixture.nativeElement.textContent).not.toContain('Partial coverage');
  });

  it('counts a shared type per Pokémon and reports zero available data honestly', async () => {
    state$.next({ ...state$.value, teams: [{ ...team, pokemon_ids: [1, 2] }] });
    pokemonState$.next({
      ...pokemonState$.value,
      items: [
        pokemon(1, 'bulbasaur', [45, 49], ['grass', 'poison']),
        pokemon(2, 'ivysaur', [60, 62], ['grass', 'poison']),
      ],
    });
    const fixture = TestBed.createComponent(TeamsPage);
    fixture.componentInstance.selectTeam(team.id);
    await fixture.whenStable();
    expect(fixture.componentInstance.selectedSummary().types).toEqual([
      { name: 'grass', count: 2 },
      { name: 'poison', count: 2 },
    ]);
    pokemonState$.next({ ...pokemonState$.value, items: [] });
    await fixture.whenStable();
    expect(fixture.componentInstance.selectedSummary().totalBaseStats).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('Data available for 0 of 2');
    expect(fixture.nativeElement.textContent).toContain('No loaded Pokémon data');
  });

  it('does not access browser storage on the server', async () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: 'server' });
    const read = vi.spyOn(Storage.prototype, 'getItem');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    state$.next({ ...state$.value, teams: [team] });
    const fixture = TestBed.createComponent(TeamsPage);
    fixture.componentInstance.selectTeam(team.id);
    await fixture.whenStable();
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(fixture.componentInstance.selectedTeam()).toEqual(team);
  });

  it('still selects teams when storage access is blocked', async () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('blocked');
    });
    state$.next({ ...state$.value, teams: [team] });
    const fixture = TestBed.createComponent(TeamsPage);
    fixture.componentInstance.selectTeam(team.id);
    await fixture.whenStable();
    expect(fixture.componentInstance.selectedTeam()).toEqual(team);
  });

  it('tolerates storage read, quota, and removal errors', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    state$.next({ ...state$.value, teams: [team] });
    const fixture = TestBed.createComponent(TeamsPage);
    fixture.componentInstance.selectTeam(team.id);
    await fixture.whenStable();
    expect(fixture.componentInstance.selectedTeam()).toEqual(team);
    state$.next({ ...state$.value, teams: [] });
    await fixture.whenStable();
    expect(fixture.componentInstance.selectedTeam()).toBeNull();
  });

  it('shows loading, retries an error, and lists the returned teams', async () => {
    const first = new Subject<Team[]>();
    loadTeams$.mockImplementationOnce(() =>
      defer(() => {
        state$.next({ ...state$.value, loading: true, loadError: null });
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
      loadError: 'Unable to load teams. Please try again.',
    });
    first.error(new Error('offline'));
    await fixture.whenStable();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Couldn’t load teams');
    expect(root.querySelector('app-team-builder')).not.toBeNull();
    loadTeams$.mockImplementationOnce(() =>
      defer(() => {
        state$.next({ ...state$.value, loading: true, loadError: null });
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

  it('cancels a superseded picker load before retrying', async () => {
    const first = new Subject<PokemonListItem[]>();
    const second = new Subject<PokemonListItem[]>();
    loadPage$.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const fixture = TestBed.createComponent(TeamsPage);
    await fixture.whenStable();

    expect(first.observed).toBe(true);
    fixture.componentInstance.retryPokemon();
    await fixture.whenStable();

    expect(first.observed).toBe(false);
    expect(second.observed).toBe(true);
    fixture.destroy();
    expect(second.observed).toBe(false);
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
    fixture.componentInstance.selectTeam(team.id);
    await fixture.whenStable();
    button.click();
    await fixture.whenStable();
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Deleting');
    expect(root.textContent).toContain(team.name);
    expect(localStorage.getItem(selectionKey)).toBe(team.id);
    button.click();
    expect(deleteTeam$).toHaveBeenCalledTimes(1);
    pending.next(team);
    pending.complete();
    await fixture.whenStable();
    expect(root.textContent).toContain('No teams yet');
    expect(fixture.componentInstance.selectedTeamId()).toBeNull();
    expect(localStorage.getItem(selectionKey)).toBeNull();
  });

  it('disables deletion while a team creation is pending', async () => {
    state$.next({ ...state$.value, teams: [team], creating: true });
    const fixture = TestBed.createComponent(TeamsPage);
    await fixture.whenStable();

    const button = fixture.nativeElement.querySelector(
      '.teams-page__button--delete',
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fixture.componentInstance.deleteTeam(team.id);
    expect(deleteTeam$).not.toHaveBeenCalled();
  });

  it('retains the team and permits another attempt after a failed delete', async () => {
    state$.next({ ...state$.value, teams: [team] });
    deleteTeam$.mockReturnValueOnce(throwError(() => new Error('backend detail')));
    const fixture = TestBed.createComponent(TeamsPage);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const button = root.querySelector('.teams-page__button--delete') as HTMLButtonElement;
    fixture.componentInstance.selectTeam(team.id);
    await fixture.whenStable();
    button.click();
    await fixture.whenStable();
    expect(root.querySelector('.teams-page__action-error')?.textContent).toContain(
      'Select Delete to try again',
    );
    expect(root.textContent).toContain(team.name);
    expect(fixture.componentInstance.selectedTeam()).toEqual(team);
    expect(localStorage.getItem(selectionKey)).toBe(team.id);
    button.click();
    await fixture.whenStable();
    expect(deleteTeam$).toHaveBeenCalledTimes(2);
    expect(root.querySelector('.teams-page__action-error')).toBeNull();
  });
});
