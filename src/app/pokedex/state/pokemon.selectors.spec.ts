import { BehaviorSubject } from 'rxjs';

import type { PokemonListItem } from '../models';
import { selectPokemonView } from './pokemon.selectors';
import type { PokemonSort } from './pokemon.selectors';
import type { PokemonState } from './pokemon.store';

const base: Omit<PokemonListItem, 'id' | 'name' | 'stats' | 'types'> = {
  height: 1,
  weight: 1,
  sprite: {
    backDefault: null,
    backShiny: null,
    frontDefault: null,
    frontShiny: null,
    officialArtwork: null,
  },
};

describe('selectPokemonView', () => {
  it('filters, sorts stats, and paginates without changing cached items', () => {
    const items: PokemonListItem[] = [
      {
        ...base,
        id: 1,
        name: 'Charmander',
        types: [{ name: 'fire', slot: 1 }],
        stats: [{ name: 'attack', baseStat: 52, effort: 0 }],
      },
      {
        ...base,
        id: 2,
        name: 'Charizard',
        types: [{ name: 'fire', slot: 1 }],
        stats: [{ name: 'attack', baseStat: 84, effort: 0 }],
      },
      {
        ...base,
        id: 3,
        name: 'Bulbasaur',
        types: [{ name: 'grass', slot: 1 }],
        stats: [{ name: 'attack', baseStat: 49, effort: 0 }],
      },
    ];
    const state$ = new BehaviorSubject<PokemonState>({
      items,
      loading: false,
      error: null,
      detail: null,
      detailLoading: false,
      detailError: null,
    });
    const search$ = new BehaviorSubject('CHAR');
    const type$ = new BehaviorSubject<string | null>('fire');
    const sort$ = new BehaviorSubject<PokemonSort | null>({ field: 'attack', direction: 'desc' });
    const page$ = new BehaviorSubject(1);
    const pageSize$ = new BehaviorSubject(1);
    const results: { names: string[]; total: number }[] = [];

    const subscription = selectPokemonView(
      state$,
      search$,
      type$,
      sort$,
      page$,
      pageSize$,
    ).subscribe(({ items: visible, total }) =>
      results.push({ names: visible.map((pokemon) => pokemon.name), total }),
    );

    expect(results.at(-1)).toEqual({ names: ['Charizard'], total: 2 });
    page$.next(2);
    expect(results.at(-1)).toEqual({ names: ['Charmander'], total: 2 });
    expect(items.map((pokemon) => pokemon.name)).toEqual(['Charmander', 'Charizard', 'Bulbasaur']);
    type$.next('water');
    expect(results.at(-1)).toEqual({ names: [], total: 0 });
    subscription.unsubscribe();
  });
});
