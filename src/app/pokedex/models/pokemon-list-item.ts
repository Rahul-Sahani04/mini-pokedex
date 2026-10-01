import { PokemonSprite } from './pokemon-sprite';
import { PokemonStat } from './pokemon-stat';
import { PokemonType } from './pokemon-type';

export interface PokemonListItem {
  id: number;
  name: string;
  height: number;
  stats: PokemonStat[];
  sprite: PokemonSprite;
  types: PokemonType[];
  weight: number;
}

export type PokemonList = PokemonListItem[];
