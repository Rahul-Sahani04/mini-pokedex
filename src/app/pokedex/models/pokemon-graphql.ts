export interface PokemonGraphqlError {
  message: string;
}

export interface PokemonGraphqlType {
  slot: number;
  pokemon_v2_type: {
    name: string;
  };
}

export interface PokemonGraphqlSpriteData {
  back_default: string | null;
  back_shiny: string | null;
  front_default: string | null;
  front_shiny: string | null;
  other?: {
    'official-artwork'?: {
      front_default: string | null;
      front_shiny?: string | null;
    };
  };
}

export interface PokemonGraphqlSprite {
  sprites: PokemonGraphqlSpriteData;
}

export interface PokemonGraphqlListItem {
  height: number;
  id: number;
  name: string;
  pokemon_v2_pokemonstats: PokemonGraphqlStat[];
  pokemon_v2_pokemonsprites: PokemonGraphqlSprite[];
  pokemon_v2_pokemontypes: PokemonGraphqlType[];
  weight: number;
}

export interface PokemonGraphqlAbility {
  is_hidden: boolean;
  slot: number;
  pokemon_v2_ability: {
    name: string;
    pokemon_v2_abilityeffecttexts?: {
      short_effect: string | null;
    }[];
  };
}

export interface PokemonGraphqlStat {
  base_stat: number;
  effort: number;
  pokemon_v2_stat: {
    name: string;
  };
}

export interface PokemonGraphqlDetail extends PokemonGraphqlListItem {
  base_experience: number | null;
  height: number;
  weight: number;
  pokemon_v2_pokemonabilities: PokemonGraphqlAbility[];
}

export interface PokemonListGraphqlData {
  pokemon_v2_pokemon: PokemonGraphqlListItem[];
}

export interface PokemonDetailGraphqlData {
  pokemon_v2_pokemon_by_pk: PokemonGraphqlDetail | null;
}

export interface PokemonListGraphqlResponse {
  data: PokemonListGraphqlData;
  errors?: PokemonGraphqlError[];
}

export interface PokemonDetailGraphqlResponse {
  data: PokemonDetailGraphqlData;
  errors?: PokemonGraphqlError[];
}

export type PokemonListResponse = PokemonListGraphqlResponse;
export type PokemonDetailResponse = PokemonDetailGraphqlResponse;
