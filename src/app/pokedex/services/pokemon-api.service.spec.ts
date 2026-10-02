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

  afterEach(() => {
    httpTesting.verify();
    vi.useRealTimers();
  });

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

  it('retries transient HTTP errors twice after a delay', () => {
    vi.useFakeTimers();
    let result: unknown;
    service.getPokemonList$(1, 0).subscribe((items) => (result = items));

    httpTesting.expectOne(POKEAPI_GRAPHQL_URL).flush('unavailable', {
      status: 503,
      statusText: 'Service Unavailable',
    });
    vi.advanceTimersByTime(499);
    httpTesting.expectNone(POKEAPI_GRAPHQL_URL);
    vi.advanceTimersByTime(1);
    httpTesting.expectOne(POKEAPI_GRAPHQL_URL).flush('rate limited', {
      status: 429,
      statusText: 'Too Many Requests',
    });
    vi.advanceTimersByTime(500);
    httpTesting.expectOne(POKEAPI_GRAPHQL_URL).flush({ data: { pokemon_v2_pokemon: [] } });

    expect(result).toEqual([]);
    httpTesting.expectNone(POKEAPI_GRAPHQL_URL);
  });

  it('retries an offline request and reports a safe error after retries are exhausted', () => {
    vi.useFakeTimers();
    let errorMessage: string | undefined;
    service
      .getPokemonList$()
      .subscribe({ error: (error: Error) => (errorMessage = error.message) });

    for (let attempt = 0; attempt < 3; attempt++) {
      httpTesting.expectOne(POKEAPI_GRAPHQL_URL).flush('offline', {
        status: 0,
        statusText: 'Unknown Error',
      });
      if (attempt < 2) vi.advanceTimersByTime(500);
    }

    expect(errorMessage).toBe('Unable to load Pokémon. Please try again.');
    httpTesting.expectNone(POKEAPI_GRAPHQL_URL);
  });

  it('does not retry a non-transient HTTP error and hides its message', () => {
    vi.useFakeTimers();
    let errorMessage: string | undefined;
    service
      .getPokemonList$()
      .subscribe({ error: (error: Error) => (errorMessage = error.message) });

    httpTesting.expectOne(POKEAPI_GRAPHQL_URL).flush('private transport detail', {
      status: 400,
      statusText: 'Bad Request',
    });
    vi.advanceTimersByTime(1000);

    expect(errorMessage).toBe('Unable to load Pokémon. Please try again.');
    httpTesting.expectNone(POKEAPI_GRAPHQL_URL);
  });

  it('reports GraphQL errors without retrying or exposing server messages', () => {
    vi.useFakeTimers();
    let errorMessage: string | undefined;
    service
      .getPokemonList$()
      .subscribe({ error: (error: Error) => (errorMessage = error.message) });

    httpTesting.expectOne(POKEAPI_GRAPHQL_URL).flush({
      data: { pokemon_v2_pokemon: [] },
      errors: [{ message: 'private GraphQL detail' }],
    });
    vi.advanceTimersByTime(1000);

    expect(errorMessage).toBe('Unable to load Pokémon. Please try again.');
    httpTesting.expectNone(POKEAPI_GRAPHQL_URL);
  });

  it('reports missing or malformed response data without exposing mapping errors', () => {
    const errors: string[] = [];
    service.getPokemonList$().subscribe({ error: (error: Error) => errors.push(error.message) });
    httpTesting.expectOne(POKEAPI_GRAPHQL_URL).flush({ data: null });

    service.getPokemonList$().subscribe({ error: (error: Error) => errors.push(error.message) });
    httpTesting.expectOne(POKEAPI_GRAPHQL_URL).flush({ data: {} });

    expect(errors).toEqual([
      'Unable to load Pokémon. Please try again.',
      'Unable to load Pokémon. Please try again.',
    ]);
  });

  it('preserves the not-found detail message but hides malformed detail errors', () => {
    const errors: string[] = [];
    service.getPokemonById$(999).subscribe({ error: (error: Error) => errors.push(error.message) });
    httpTesting.expectOne(POKEAPI_GRAPHQL_URL).flush({
      data: { pokemon_v2_pokemon_by_pk: null },
    });

    service.getPokemonById$(1).subscribe({ error: (error: Error) => errors.push(error.message) });
    httpTesting.expectOne(POKEAPI_GRAPHQL_URL).flush({
      data: { pokemon_v2_pokemon_by_pk: { id: 1, name: 'broken' } },
    });

    expect(errors).toEqual([
      'Pokémon was not found.',
      'Unable to load Pokémon details. Please try again.',
    ]);
  });

  it('cancels a scheduled retry when unsubscribed', () => {
    vi.useFakeTimers();
    const subscription = service.getPokemonList$().subscribe();
    httpTesting.expectOne(POKEAPI_GRAPHQL_URL).flush('unavailable', {
      status: 503,
      statusText: 'Service Unavailable',
    });

    subscription.unsubscribe();
    vi.advanceTimersByTime(1000);
    httpTesting.expectNone(POKEAPI_GRAPHQL_URL);
  });
});
