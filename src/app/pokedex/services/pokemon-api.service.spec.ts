import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { POKEAPI_GRAPHQL_URL, PokemonApiService } from './pokemon-api.service';

describe('PokemonApiService', () => {
  let service: PokemonApiService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PokemonApiService, provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(PokemonApiService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('maps a Pokémon list response into domain models', () => {
    let result: unknown;

    service.getPokemonList$(1, 0).subscribe((pokemon) => (result = pokemon));

    const request = httpTesting.expectOne(POKEAPI_GRAPHQL_URL);
    expect(request.request.method).toBe('POST');
    expect(request.request.body.variables).toEqual({ limit: 1, offset: 0 });

    request.flush({
      data: {
        pokemon_v2_pokemon: [
          {
            id: 25,
            name: 'pikachu',
            height: 4,
            weight: 60,
            pokemon_v2_pokemontypes: [{ slot: 1, pokemon_v2_type: { name: 'electric' } }],
            pokemon_v2_pokemonstats: [
              {
                base_stat: 35,
                effort: 0,
                pokemon_v2_stat: { name: 'hp' },
              },
            ],
            pokemon_v2_pokemonsprites: [
              {
                sprites: {
                  back_default: null,
                  back_shiny: null,
                  front_default: 'front.png',
                  front_shiny: null,
                },
              },
            ],
          },
        ],
      },
    });

    expect(result).toEqual([
      expect.objectContaining({
        id: 25,
        name: 'pikachu',
        stats: [{ name: 'hp', baseStat: 35, effort: 0 }],
        types: [{ name: 'electric', slot: 1 }],
      }),
    ]);
  });

  it('maps detail abilities and their descriptions', () => {
    let result: unknown;

    service.getPokemonById$(1).subscribe((pokemon) => (result = pokemon));

    const request = httpTesting.expectOne(POKEAPI_GRAPHQL_URL);
    request.flush({
      data: {
        pokemon_v2_pokemon_by_pk: {
          id: 1,
          name: 'bulbasaur',
          base_experience: 64,
          height: 7,
          weight: 69,
          pokemon_v2_pokemontypes: [],
          pokemon_v2_pokemonstats: [],
          pokemon_v2_pokemonabilities: [
            {
              is_hidden: false,
              slot: 1,
              pokemon_v2_ability: {
                name: 'overgrow',
                pokemon_v2_abilityeffecttexts: [{ short_effect: 'Powers up Grass-type moves.' }],
              },
            },
          ],
          pokemon_v2_pokemonsprites: [],
        },
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        name: 'bulbasaur',
        abilities: [
          {
            name: 'overgrow',
            isHidden: false,
            shortEffect: 'Powers up Grass-type moves.',
            slot: 1,
          },
        ],
      }),
    );
  });
});
