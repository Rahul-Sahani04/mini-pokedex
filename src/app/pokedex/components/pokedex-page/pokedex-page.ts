import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, of, startWith, switchMap } from 'rxjs';

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
  readonly pageSizes = PAGE_SIZES;
  readonly skeletonRows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  readonly state = toSignal(this.store.state$, { requireSync: true });
  readonly view = toSignal(
    selectPokemonView(
      this.store.state$,
      of(''),
      of(null),
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
