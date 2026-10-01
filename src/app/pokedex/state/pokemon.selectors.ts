import { combineLatest, distinctUntilChanged, map, shareReplay } from 'rxjs';

import type { Observable } from 'rxjs';

import type { PokemonListItem } from '../models';
import type { PokemonState } from './pokemon.store';

/** Sort configuration for a Pokémon name or stat. */
export interface PokemonSort {
  /** `name` or the name of a Pokémon stat. */
  field: string;
  direction: 'asc' | 'desc';
}

/** Filtered and paginated Pokémon data for the list UI. */
export interface PokemonView {
  items: PokemonListItem[];
  total: number;
  page: number;
}

/**
 * Derives the visible Pokémon list from store state and list controls.
 *
 * Pagination is one-based, and `total` is the count before pagination.
 */
export function selectPokemonView(
  state$: Observable<PokemonState>,
  search$: Observable<string>,
  type$: Observable<string | null>,
  sort$: Observable<PokemonSort | null>,
  page$: Observable<number>,
  pageSize$: Observable<number>,
): Observable<PokemonView> {
  return combineLatest([
    state$.pipe(distinctUntilChanged((previous, current) => previous.items === current.items)),
    search$.pipe(
      map((search) => search.toLocaleLowerCase()),
      distinctUntilChanged(),
    ),
    type$.pipe(distinctUntilChanged()),
    sort$.pipe(
      distinctUntilChanged(
        (previous, current) =>
          previous?.field === current?.field && previous?.direction === current?.direction,
      ),
    ),
    page$.pipe(distinctUntilChanged()),
    pageSize$.pipe(distinctUntilChanged()),
  ]).pipe(
    map(([state, search, type, sort, page, pageSize]) => {
      const filtered = state.items.filter(
        (pokemon) =>
          pokemon.name.toLocaleLowerCase().includes(search) &&
          (type === null || pokemon.types.some((pokemonType) => pokemonType.name === type)),
      );
      const sorted = sort === null ? filtered : [...filtered].sort(comparePokemon(sort));
      const start = (page - 1) * pageSize;

      return {
        items: sorted.slice(start, start + pageSize),
        total: filtered.length,
        page,
      };
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
}

function comparePokemon(
  sort: PokemonSort,
): (left: PokemonListItem, right: PokemonListItem) => number {
  const direction = sort.direction === 'asc' ? 1 : -1;

  if (sort.field === 'name') {
    return (left, right) => direction * left.name.localeCompare(right.name);
  }

  return (left, right) => {
    const leftValue = left.stats.find((stat) => stat.name === sort.field)?.baseStat ?? 0;
    const rightValue = right.stats.find((stat) => stat.name === sort.field)?.baseStat ?? 0;

    return direction * (leftValue - rightValue);
  };
}
