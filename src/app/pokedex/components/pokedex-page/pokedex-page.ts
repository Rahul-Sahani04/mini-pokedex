import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  EMPTY,
  Subject,
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  of,
  startWith,
  switchMap,
} from 'rxjs';

import { PokemonTable } from '../../components/pokemon-table/pokemon-table';
import { selectPokemonView } from '../../state/pokemon.selectors';
import type { PokemonSort } from '../../state/pokemon.selectors';
import { PokemonStore } from '../../state/pokemon.store';

const INITIAL_BATCH_SIZE = 150;
const PAGE_SIZES = [10, 25, 50] as const;

@Component({
  selector: 'app-pokedex-page',
  standalone: true,
  imports: [PokemonTable],
  templateUrl: './pokedex-page.html',
  styleUrl: './pokedex-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PokedexPage {
  private readonly store = inject(PokemonStore);
  private readonly loadTrigger$ = new Subject<boolean>();

  readonly page = signal(1);
  readonly pageSize = signal<number>(PAGE_SIZES[0]);
  readonly sort = signal<PokemonSort | null>(null);
  readonly searchText = signal('');
  readonly selectedType = signal<string | null>(null);
  readonly pageSizes = PAGE_SIZES;
  readonly skeletonRows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  readonly state = toSignal(this.store.state$, { requireSync: true });
  readonly types = computed(() =>
    [
      ...new Set(this.state().items.flatMap((pokemon) => pokemon.types.map((type) => type.name))),
    ].sort(),
  );
  private readonly searchedState$ = toObservable(this.searchText).pipe(
    map((text) => text.trim().toLocaleLowerCase()),
    debounceTime(300),
    distinctUntilChanged(),
    startWith(''),
    switchMap((search) =>
      this.store.state$.pipe(
        map((state) => ({
          ...state,
          items: state.items.filter((pokemon) => pokemon.name.toLocaleLowerCase().includes(search)),
        })),
      ),
    ),
  );
  readonly view = toSignal(
    selectPokemonView(
      this.searchedState$,
      of(''),
      toObservable(this.selectedType),
      toObservable(this.sort),
      toObservable(this.page),
      toObservable(this.pageSize),
    ),
    { initialValue: { items: [], total: 0, page: 1 } },
  );
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.view().total / this.pageSize())));
  readonly firstVisibleItem = computed(() => (this.page() - 1) * this.pageSize() + 1);
  readonly lastVisibleItem = computed(() =>
    Math.min(this.page() * this.pageSize(), this.view().total),
  );

  constructor() {
    this.loadTrigger$
      .pipe(
        startWith(false),
        switchMap((forceRefresh) =>
          this.store.loadPage$(INITIAL_BATCH_SIZE, 0, forceRefresh).pipe(catchError(() => EMPTY)),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((items) => {
        const lastPage = Math.max(1, Math.ceil(items.length / this.pageSize()));

        if (this.page() > lastPage) {
          this.page.set(lastPage);
        }
      });
  }

  retry(): void {
    this.loadTrigger$.next(true);
  }

  changeSearch(event: Event): void {
    this.searchText.set((event.target as HTMLInputElement).value);
    this.page.set(1);
  }

  changeType(event: Event): void {
    this.selectedType.set((event.target as HTMLSelectElement).value || null);
    this.page.set(1);
  }

  clearFilters(): void {
    this.searchText.set('');
    this.selectedType.set(null);
    this.page.set(1);
  }

  changeSort(sort: PokemonSort): void {
    this.sort.set(sort);
    this.page.set(1);
  }

  changePageSize(event: Event): void {
    const pageSize = Number((event.target as HTMLSelectElement).value);

    if (PAGE_SIZES.includes(pageSize as (typeof PAGE_SIZES)[number])) {
      this.pageSize.set(pageSize);
      this.page.set(1);
    }
  }

  goToPage(page: number): void {
    this.page.set(Math.min(Math.max(page, 1), this.pageCount()));
  }
}
