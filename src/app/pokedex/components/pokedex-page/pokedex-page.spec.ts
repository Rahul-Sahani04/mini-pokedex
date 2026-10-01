import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';

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

  it('shows loading, failure with retry, and an empty response', async () => {
    const fixture = TestBed.createComponent(PokedexPage);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role="status"]')?.textContent).toContain(
      'Loading Pokémon',
    );
    expect(loadPage$).toHaveBeenCalledWith(150, 0, false);

    state$.next({ ...state$.value, loading: false, error: 'Unable to load Pokémon.' });
    fixture.detectChanges();
    const retry = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      'Unable to load Pokémon.',
    );
    retry.click();
    expect(loadPage$).toHaveBeenCalledWith(150, 0, true);

    state$.next({ ...state$.value, error: null });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('The loaded batch is empty.');
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

  it('debounces name search and filters by type', async () => {
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

    input.value = 'char';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(2);

    await new Promise((resolve) => setTimeout(resolve, 350));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(1);
    expect(fixture.nativeElement.querySelector('tbody')?.textContent).toContain('charmander');

    type.value = 'fire';
    type.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(1);

    input.value = 'missing';
    input.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 350));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No matching Pokémon');
  });
});
