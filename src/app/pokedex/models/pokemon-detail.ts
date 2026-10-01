import { PokemonAbility } from './pokemon-ability';
import { PokemonListItem } from './pokemon-list-item';

export interface PokemonDetail extends PokemonListItem {
  abilities: PokemonAbility[];
  baseExperience: number | null;
}
