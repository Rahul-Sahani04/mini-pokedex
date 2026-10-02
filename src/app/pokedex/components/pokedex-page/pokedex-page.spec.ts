import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject, catchError, defer, of, tap, throwError } from 'rxjs';

import type { PokemonListItem } from '../../models';
import { PokemonStore } from '../../state/pokemon.store';
import type { PokemonState } from '../../state/pokemon.store';
import { PokedexPage } from './pokedex-page';

const base: PokemonListItem = {
  id: 1,
  name: 'bulbasaur',
  height: 7,
  weight: 69,
  stats: [
    { name: 'hp', baseStat: 45, effort: 0 },
    { name: 'attack', baseStat: 49, effort: 0 },
  ],
  sprite: {
    frontDefault: null,
    backDefault: null,
    frontShiny: null,
    backShiny: null,
    officialArtwork: null,
  },
  types: [{ name: 'grass', slot: 1 }],
};

describe('PokedexPage', () => {
  let state$: BehaviorSubject<PokemonState>;
  let loadPage$: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    state$ = new BehaviorSubject<PokemonState>({
      items: [],
      loading: true,
      error: null,
      detail: null,
      detailLoading: false,
      detailError: null,
    });
    loadPage$ = vi.fn(() => of([]));
    TestBed.configureTestingModule({
      imports: [PokedexPage],
      providers: [{ provide: PokemonStore, useValue: { state$, loadPage$ } }],
    });
  });

  it('keeps the skeleton visible while pending, then retries a failed request', async () => {
    const first = new Subject<PokemonListItem[]>();
    const second = new Subject<PokemonListItem[]>();
    const requests = [first, second];
    loadPage$.mockImplementation(() =>
      defer(() => {
        state$.next({ ...state$.value, loading: true, error: null });
        return requests.shift()!.pipe(
          tap((items) => state$.next({ ...state$.value, items, loading: false, error: null })),
          catchError((error: unknown) => {
            state$.next({ ...state$.value, loading: false, error: 'Unable to load Pokémon.' });
            return throwError(() => error);
          }),
        );
      }),
    );
    const fixture = TestBed.createComponent(PokedexPage);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Loading Pokémon');
    expect(
      root.querySelector('[aria-busy="true"] .pokedex-page__skeleton-row--header'),
    ).not.toBeNull();
    expect(
      root.querySelectorAll('.pokedex-page__skeleton-row:not(.pokedex-page__skeleton-row--header)'),
    ).toHaveLength(10);
    expect(loadPage$).toHaveBeenCalledWith(150, 0, false);
    expect(root.querySelector('app-pokemon-table')).toBeNull();

    first.error(new Error('network failure'));
    await fixture.whenStable();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Unable to load Pokémon.');
    expect(root.querySelector('[role="status"]')).toBeNull();
    (root.querySelector('button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(loadPage$).toHaveBeenCalledWith(150, 0, true);
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Loading Pokémon');
    expect(root.querySelector('[role="alert"]')).toBeNull();

    second.next([base]);
    second.complete();
    await fixture.whenStable();
    expect(root.querySelector('tbody')?.textContent).toContain('bulbasaur');
    expect(root.querySelector('[role="status"]')).toBeNull();
  });

  it('explains an empty loaded batch and offers a fresh attempt', async () => {
    const fixture = TestBed.createComponent(PokedexPage);
    state$.next({ ...state$.value, loading: false });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('No Pokémon were returned for this batch');
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    expect(loadPage$).toHaveBeenCalledWith(150, 0, true);
  });

  it('unsubscribes from an unfinished load on destroy', async () => {
    const pending = new Subject<PokemonListItem[]>();
    loadPage$.mockReturnValue(pending);
    const fixture = TestBed.createComponent(PokedexPage);
    await fixture.whenStable();
    expect(pending.observed).toBe(true);
    fixture.destroy();
    expect(pending.observed).toBe(false);
  });

  it('renders, sorts, and paginates the loaded batch', async () => {
    const items = Array.from({ length: 26 }, (_, index): PokemonListItem => ({
      ...base,
      id: index + 1,
      name: `pokemon-${String(index + 1).padStart(2, '0')}`,
      stats: [{ name: 'hp', baseStat: index + 1, effort: 0 }],
    }));
    const fixture = TestBed.createComponent(PokedexPage);
    state$.next({ ...state$.value, loading: false, items });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const rows = () =>
      fixture.nativeElement.querySelectorAll('tbody tr') as NodeListOf<HTMLTableRowElement>;
    expect(rows().length).toBe(10);
    expect(rows()[0].textContent).toContain('pokemon-01');

    const next = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.trim() === 'Next')!;
    next.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(rows()[0].textContent).toContain('pokemon-11');

    const size = fixture.nativeElement.querySelector(
      '.pokedex-page__page-size select',
    ) as HTMLSelectElement;
    size.value = '25';
    size.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(rows().length).toBe(25);
    expect(rows()[0].textContent).toContain('pokemon-01');

    const sort = fixture.nativeElement.querySelector(
      '[aria-label="Sort by HP ascending"]',
    ) as HTMLButtonElement;
    sort.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(rows()[0].textContent).toContain('pokemon-01');
    sort.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(rows()[0].textContent).toContain('pokemon-26');

    size.value = '50';
    size.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(rows().length).toBe(26);
  });

  it('keeps filters and input focus through debounce and no-match, then clears both filters', async () => {
    const items = [
      { ...base, id: 1, name: 'bulbasaur' },
      { ...base, id: 2, name: 'charmander', types: [{ name: 'fire', slot: 1 }] },
    ];
    const fixture = TestBed.createComponent(PokedexPage);
    state$.next({ ...state$.value, loading: false, items });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;
    const type = fixture.nativeElement.querySelector(
      '.pokedex-page__filter select',
    ) as HTMLSelectElement;

    input.focus();
    input.value = 'char';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(2);
    expect(document.activeElement).toBe(input);

    await new Promise((resolve) => setTimeout(resolve, 350));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(1);
    expect(fixture.nativeElement.querySelector('tbody')?.textContent).toContain('charmander');
    expect(document.activeElement).toBe(input);

    type.value = 'fire';
    type.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(1);

    input.value = 'missing';
    input.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 350));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No matching Pokémon');
    expect(fixture.nativeElement.querySelector('input[type="search"]')).toBe(input);
    expect(fixture.nativeElement.querySelector('.pokedex-page__filter select')).toBe(type);
    expect(input.value).toBe('missing');
    expect(type.value).toBe('fire');
    expect(document.activeElement).toBe(input);

    (
      fixture.nativeElement.querySelector('.pokedex-page__state button') as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('input[type="search"]')).toBe(input);
    expect(input.value).toBe('');
    expect(type.value).toBe('');
    await new Promise((resolve) => setTimeout(resolve, 350));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(2);
    expect(fixture.nativeElement.textContent).not.toContain('No matching Pokémon');
  });
});
