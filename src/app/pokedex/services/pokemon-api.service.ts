import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, retry, throwError } from 'rxjs';

import type {
  PokemonAbility,
  PokemonGraphqlAbility,
  PokemonGraphqlError,
  PokemonDetail,
  PokemonGraphqlDetail,
  PokemonGraphqlListItem,
  PokemonGraphqlStat,
  PokemonList,
  PokemonStat,
} from '../models';

export const POKEAPI_GRAPHQL_URL = 'https://beta.pokeapi.co/graphql/v1beta';

export const GET_POKEMON_QUERY = /* GraphQL */ `
  query GetPokemon($limit: Int, $offset: Int) {
    pokemon_v2_pokemon(limit: $limit, offset: $offset) {
      id
      name
      height
      weight
      pokemon_v2_pokemontypes {
        slot
        pokemon_v2_type {
          name
        }
      }
      pokemon_v2_pokemonstats {
        base_stat
        effort
        pokemon_v2_stat {
          name
        }
      }
      pokemon_v2_pokemonsprites {
        sprites
      }
    }
  }
`;

export const GET_POKEMON_DETAIL_QUERY = /* GraphQL */ `
  query GetPokemonDetail($id: Int!) {
    pokemon_v2_pokemon_by_pk(id: $id) {
      id
      name
      base_experience
      height
      weight
      pokemon_v2_pokemontypes {
        slot
        pokemon_v2_type {
          name
        }
      }
      pokemon_v2_pokemonstats {
        base_stat
        effort
        pokemon_v2_stat {
          name
        }
      }
      pokemon_v2_pokemonabilities {
        is_hidden
        slot
        pokemon_v2_ability {
          name
          pokemon_v2_abilityeffecttexts(where: { language_id: { _eq: 9 } }) {
            short_effect
          }
        }
      }
      pokemon_v2_pokemonsprites {
        sprites
      }
    }
  }
`;

export const GET_POKEMON_ABILITIES_QUERY = /* GraphQL */ `
  query GetAbilities($pokemonId: Int) {
    pokemon_v2_pokemonability(where: { pokemon_id: { _eq: $pokemonId } }) {
      is_hidden
      slot
      pokemon_v2_ability {
        name
        pokemon_v2_abilityeffecttexts(where: { language_id: { _eq: 9 } }) {
          short_effect
        }
      }
    }
  }
`;

interface GraphqlResponse<TData> {
  data?: TData | null;
  errors?: readonly PokemonGraphqlError[];
}

interface PokemonAbilitiesGraphqlData {
  pokemon_v2_pokemonability: PokemonGraphqlAbility[];
}

@Injectable({ providedIn: 'root' })
export class PokemonApiService {
  private readonly http = inject(HttpClient);

  /**
   * Loads one page of Pokémon from PokéAPI.
   *
   * @param limit Maximum number of Pokémon to return.
   * @param offset Number of Pokémon to skip.
   */
  getPokemonList$(limit = 20, offset = 0): Observable<PokemonList> {
    return this.request$<{ pokemon_v2_pokemon: PokemonGraphqlListItem[] }>(
      GET_POKEMON_QUERY,
      { limit, offset },
      'Unable to load Pokémon. Please try again.',
    ).pipe(
      map((data) => data.pokemon_v2_pokemon.map((pokemon) => this.toPokemonListItem(pokemon))),
    );
  }

  /**
   * Loads a Pokémon and its stats, types, sprite, and abilities by ID.
   *
   * @param id PokéAPI Pokémon ID.
   */
  getPokemonById$(id: number): Observable<PokemonDetail> {
    return this.request$<{ pokemon_v2_pokemon_by_pk: PokemonGraphqlDetail | null }>(
      GET_POKEMON_DETAIL_QUERY,
      { id },
      'Unable to load Pokémon details. Please try again.',
    ).pipe(
      map((data) => {
        if (!data.pokemon_v2_pokemon_by_pk) {
          throw new Error('Pokémon was not found.');
        }

        return this.toPokemonDetail(data.pokemon_v2_pokemon_by_pk);
      }),
    );
  }

  /**
   * Loads the abilities for one Pokémon, including hidden-ability metadata.
   *
   * @param pokemonId PokéAPI Pokémon ID.
   */
  getPokemonAbilities$(pokemonId: number): Observable<PokemonAbility[]> {
    return this.request$<PokemonAbilitiesGraphqlData>(
      GET_POKEMON_ABILITIES_QUERY,
      { pokemonId },
      'Unable to load Pokémon abilities. Please try again.',
    ).pipe(
      map((data) =>
        data.pokemon_v2_pokemonability.map((ability) => this.toPokemonAbility(ability)),
      ),
    );
  }

  private request$<TData>(
    query: string,
    variables: Record<string, number>,
    userMessage: string,
  ): Observable<TData> {
    return this.http.post<GraphqlResponse<TData>>(POKEAPI_GRAPHQL_URL, { query, variables }).pipe(
      retry({ count: 2, delay: 500 }),
      map((response) => {
        if (response.errors?.length) {
          throw new Error('The Pokémon service returned an error.');
        }

        if (response.data === null || response.data === undefined) {
          throw new Error('The Pokémon service returned no data.');
        }

        return response.data;
      }),
      catchError(() => throwError(() => new Error(userMessage))),
    );
  }

  private toPokemonListItem(pokemon: PokemonGraphqlListItem): PokemonList[number] {
    return {
      id: pokemon.id,
      name: pokemon.name,
      height: pokemon.height,
      weight: pokemon.weight,
      stats: pokemon.pokemon_v2_pokemonstats.map((stat) => this.toPokemonStat(stat)),
      sprite: this.toPokemonSprite(pokemon.pokemon_v2_pokemonsprites[0]?.sprites),
      types: pokemon.pokemon_v2_pokemontypes.map((type) => ({
        name: type.pokemon_v2_type.name,
        slot: type.slot,
      })),
    };
  }

  private toPokemonDetail(pokemon: PokemonGraphqlDetail): PokemonDetail {
    return {
      ...this.toPokemonListItem(pokemon),
      abilities: pokemon.pokemon_v2_pokemonabilities.map((ability) =>
        this.toPokemonAbility(ability),
      ),
      baseExperience: pokemon.base_experience,
    };
  }

  private toPokemonStat(stat: PokemonGraphqlStat): PokemonStat {
    return {
      name: stat.pokemon_v2_stat.name,
      baseStat: stat.base_stat,
      effort: stat.effort,
    };
  }

  private toPokemonAbility(ability: PokemonGraphqlAbility): PokemonAbility {
    return {
      name: ability.pokemon_v2_ability.name,
      isHidden: ability.is_hidden,
      shortEffect:
        ability.pokemon_v2_ability.pokemon_v2_abilityeffecttexts?.[0]?.short_effect ?? null,
      slot: ability.slot,
    };
  }

  private toPokemonSprite(
    sprite: PokemonGraphqlListItem['pokemon_v2_pokemonsprites'][number]['sprites'] | undefined,
  ) {
    return {
      backDefault: sprite?.back_default ?? null,
      backShiny: sprite?.back_shiny ?? null,
      frontDefault: sprite?.front_default ?? null,
      frontShiny: sprite?.front_shiny ?? null,
      officialArtwork: sprite?.other?.['official-artwork']?.front_default ?? null,
    };
  }
}
