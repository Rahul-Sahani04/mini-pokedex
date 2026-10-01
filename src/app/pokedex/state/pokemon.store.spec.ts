import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, Subject } from 'rxjs';

import type { PokemonDetail, PokemonListItem } from '../models';
import { PokemonApiService } from '../services/pokemon-api.service';
import { PokemonStore } from './pokemon.store';

const pikachu: PokemonListItem = {
  id: 25,
  name: 'pikachu',
  height: 4,
  weight: 60,
  sprite: {
    backDefault: null,
    backShiny: null,
    frontDefault: null,
    frontShiny: null,
    officialArtwork: null,
  },
  stats: [],
  types: [{ name: 'electric', slot: 1 }],
};

describe('PokemonStore', () => {
  let store: PokemonStore;
  let api: Pick<PokemonApiService, 'getPokemonList$' | 'getPokemonById$'>;

  beforeEach(() => {
    api = {
      getPokemonList$: vi.fn(() => of([pikachu])),
      getPokemonById$: vi.fn(() => of({ ...pikachu, abilities: [], baseExperience: 112 })),
    };
    TestBed.configureTestingModule({
      providers: [PokemonStore, { provide: PokemonApiService, useValue: api }],
    });
    store = TestBed.inject(PokemonStore);
  });

  it('publishes loading and caches a successfully fetched page', async () => {
    const response = new Subject<PokemonListItem[]>();
    vi.mocked(api.getPokemonList$).mockReturnValueOnce(response);
    const states: { loading: boolean; items: PokemonListItem[] }[] = [];
    const subscription = store.state$.subscribe((state) => states.push(state));
    const received: PokemonListItem[][] = [];

    store.loadPage$(20, 0).subscribe((items) => received.push(items));
    expect(states.at(-1)?.loading).toBe(true);
    response.next([pikachu]);
    response.complete();

    expect(received).toEqual([[pikachu]]);
    expect(states.at(-1)).toEqual(
      expect.objectContaining({ items: [pikachu], loading: false, error: null }),
    );
    expect(await firstValueFrom(store.loadPage$(20, 0))).toEqual([pikachu]);
    expect(api.getPokemonList$).toHaveBeenCalledTimes(1);
    subscription.unsubscribe();
  });

  it('keeps previous items and allows retry after a failed page', () => {
    store.loadPage$(20, 0).subscribe();
    const response = new Subject<PokemonListItem[]>();
    vi.mocked(api.getPokemonList$).mockReturnValueOnce(response);
    const errors: string[] = [];

    store.loadPage$(20, 20).subscribe({ error: (error: Error) => errors.push(error.message) });
    response.error(new Error('private transport details'));

    expect(errors).toEqual(['Unable to load Pokémon. Please try again.']);
    const states: { items: PokemonListItem[]; loading: boolean; error: string | null }[] = [];
    const subscription = store.state$.subscribe((state) => states.push(state));
    expect(states.at(-1)).toEqual(
      expect.objectContaining({ items: [pikachu], loading: false, error: errors[0] }),
    );
    store.loadPage$(20, 20).subscribe();
    expect(api.getPokemonList$).toHaveBeenCalledTimes(3);
    expect(states.at(-1)?.error).toBeNull();
    subscription.unsubscribe();
  });

  it('does not leave loading active when a page request is cancelled', async () => {
    vi.mocked(api.getPokemonList$).mockReturnValueOnce(new Subject<PokemonListItem[]>());
    const subscription = store.loadPage$(20, 0).subscribe();
    expect((await firstValueFrom(store.state$)).loading).toBe(true);
    subscription.unsubscribe();
    expect((await firstValueFrom(store.state$)).loading).toBe(false);
  });

  it('does not let an older response replace a newer page', async () => {
    const first = new Subject<PokemonListItem[]>();
    vi.mocked(api.getPokemonList$).mockReturnValueOnce(first);
    const older = store.loadPage$(20, 0).subscribe();

    await firstValueFrom(store.loadPage$(20, 20));
    first.next([]);
    first.complete();

    expect((await firstValueFrom(store.state$)).items).toEqual([pikachu]);
    older.unsubscribe();
  });

  it('caches a detail by ID', async () => {
    const first = await firstValueFrom(store.loadDetail$(25));
    expect(first).toEqual(
      expect.objectContaining({ id: 25, baseExperience: 112 } satisfies Partial<PokemonDetail>),
    );
    await firstValueFrom(store.loadDetail$(25));
    expect(api.getPokemonById$).toHaveBeenCalledTimes(1);
    const state = await firstValueFrom(store.state$);
    expect(state.detail).toEqual(first);
    expect(state.detailLoading).toBe(false);
  });

  it('clears stale detail and exposes a retryable detail error', () => {
    const response = new Subject<PokemonDetail>();
    vi.mocked(api.getPokemonById$).mockReturnValueOnce(response);
    const errors: string[] = [];

    store.loadDetail$(25).subscribe({ error: (error: Error) => errors.push(error.message) });
    const states: {
      detail: PokemonDetail | null;
      detailLoading: boolean;
      detailError: string | null;
    }[] = [];
    const subscription = store.state$.subscribe((state) => states.push(state));
    expect(states.at(-1)).toEqual(expect.objectContaining({ detail: null, detailLoading: true }));
    response.error(new Error('private transport details'));

    expect(errors).toEqual(['Unable to load Pokémon details. Please try again.']);
    expect(states.at(-1)).toEqual(
      expect.objectContaining({ detail: null, detailLoading: false, detailError: errors[0] }),
    );
    store.loadDetail$(25).subscribe();
    expect(api.getPokemonById$).toHaveBeenCalledTimes(2);
    subscription.unsubscribe();
  });
});
