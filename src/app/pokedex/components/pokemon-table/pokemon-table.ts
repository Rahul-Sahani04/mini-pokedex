import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { PokemonListItem } from '../../models';
import type { PokemonSort } from '../../state/pokemon.selectors';

@Component({
  selector: 'app-pokemon-table',
  standalone: true,
  templateUrl: './pokemon-table.html',
  styleUrl: './pokemon-table.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PokemonTable {
  readonly items = input.required<readonly PokemonListItem[]>();
  readonly sort = input<PokemonSort | null>(null);
  readonly sortChange = output<PokemonSort>();
  readonly selected = output<{ item: PokemonListItem; trigger: HTMLElement }>();

  protected readonly statColumns = [
    { field: 'hp', label: 'HP' },
    { field: 'attack', label: 'Attack' },
    { field: 'defense', label: 'Defense' },
    { field: 'special-attack', label: 'Sp. Atk' },
    { field: 'special-defense', label: 'Sp. Def' },
    { field: 'speed', label: 'Speed' },
  ] as const;

  protected changeSort(field: string): void {
    const current = this.sort();
    const direction = current?.field === field && current.direction === 'asc' ? 'desc' : 'asc';

    this.sortChange.emit({ field, direction });
  }

  protected select(pokemon: PokemonListItem, event: Event): void {
    if (event instanceof KeyboardEvent) {
      event.preventDefault();
    }
    this.selected.emit({ item: pokemon, trigger: event.currentTarget as HTMLElement });
  }

  protected ariaSort(field: string): 'ascending' | 'descending' | 'none' {
    const current = this.sort();

    if (current?.field !== field) {
      return 'none';
    }

    return current.direction === 'asc' ? 'ascending' : 'descending';
  }

  protected sortLabel(label: string, field: string): string {
    const current = this.sort();
    const nextDirection =
      current?.field === field && current.direction === 'asc' ? 'descending' : 'ascending';

    return `Sort by ${label} ${nextDirection}`;
  }

  protected sortIndicator(field: string): string {
    const current = this.sort();

    if (current?.field !== field) {
      return '↕';
    }

    return current.direction === 'asc' ? '↑' : '↓';
  }

  protected statValue(pokemon: PokemonListItem, field: string): number {
    return pokemon.stats.find((stat) => stat.name === field)?.baseStat ?? 0;
  }

  protected total(pokemon: PokemonListItem): number {
    return pokemon.stats.reduce((sum, stat) => sum + stat.baseStat, 0);
  }
}
