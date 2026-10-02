import { Injectable, inject } from '@angular/core';
import {
  BehaviorSubject,
  Observable,
  catchError,
  defer,
  finalize,
  of,
  tap,
  throwError,
} from 'rxjs';

import type { PokemonDetail, PokemonList } from '../models';
import { PokemonApiService } from '../services/pokemon-api.service';

const LIST_ERROR_MESSAGE = 'Unable to load Pokémon. Please try again.';
const DETAIL_ERROR_MESSAGE = 'Unable to load Pokémon details. Please try again.';

export interface PokemonState {
  items: PokemonList;
  loading: boolean;
  error: string | null;
  detail: PokemonDetail | null;
  detailLoading: boolean;
  detailError: string | null;
}

@Injectable({ providedIn: 'root' })
export class PokemonStore {
  private readonly api = inject(PokemonApiService);
  private readonly pageCache = new Map<string, PokemonList>();
  private readonly detailCache = new Map<number, PokemonDetail>();
  private pageRequest = 0;
  private detailRequest = 0;
  private readonly stateSubject = new BehaviorSubject<PokemonState>({
    items: [],
    loading: false,
    error: null,
    detail: null,
    detailLoading: false,
    detailError: null,
  });

  readonly state$: Observable<PokemonState> = this.stateSubject.asObservable();

  /**
   * Loads a page on subscription, reusing a successful cached response unless refreshed.
   *
   * @param limit Maximum number of Pokémon to load.
   * @param offset Number of Pokémon to skip.
   * @param forceRefresh Whether to bypass the page cache.
   */
  loadPage$(limit: number, offset: number, forceRefresh = false): Observable<PokemonList> {
    return defer(() => {
      const request = ++this.pageRequest;
      const cacheKey = `${limit}:${offset}`;
      const cachedItems = this.pageCache.get(cacheKey);

      if (cachedItems && !forceRefresh) {
        this.updateState({ items: cachedItems, loading: false, error: null });
        return of(cachedItems);
      }

      this.updateState({ loading: true, error: null });

      return this.api.getPokemonList$(limit, offset).pipe(
        tap((items) => {
          if (request === this.pageRequest) {
            this.pageCache.set(cacheKey, items);
            this.updateState({ items, loading: false, error: null });
          }
        }),
        catchError(() => {
          if (request === this.pageRequest) {
            this.updateState({ loading: false, error: LIST_ERROR_MESSAGE });
          }
          return throwError(() => new Error(LIST_ERROR_MESSAGE));
        }),
        finalize(() => {
          if (request === this.pageRequest && this.stateSubject.value.loading) {
            this.updateState({ loading: false });
          }
        }),
      );
    });
  }

  /**
   * Loads a Pokémon detail on subscription, reusing a successful cached response.
   *
   * @param id PokéAPI Pokémon ID.
   */
  loadDetail$(id: number): Observable<PokemonDetail> {
    return defer(() => {
      const request = ++this.detailRequest;
      const cachedDetail = this.detailCache.get(id);

      if (cachedDetail) {
        this.updateState({ detail: cachedDetail, detailLoading: false, detailError: null });
        return of(cachedDetail);
      }

      this.updateState({ detail: null, detailLoading: true, detailError: null });
      return this.api.getPokemonById$(id).pipe(
        tap((detail) => {
          if (request === this.detailRequest) {
            this.detailCache.set(id, detail);
            this.updateState({ detail, detailLoading: false, detailError: null });
          }
        }),
        catchError(() => {
          if (request === this.detailRequest) {
            this.updateState({ detailLoading: false, detailError: DETAIL_ERROR_MESSAGE });
          }
          return throwError(() => new Error(DETAIL_ERROR_MESSAGE));
        }),
        finalize(() => {
          if (request === this.detailRequest && this.stateSubject.value.detailLoading) {
            this.updateState({ detailLoading: false });
          }
        }),
      );
    });
  }

  private updateState(update: Partial<PokemonState>): void {
    this.stateSubject.next({ ...this.stateSubject.value, ...update });
  }
}
