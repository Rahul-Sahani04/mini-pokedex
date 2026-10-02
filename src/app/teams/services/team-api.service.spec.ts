import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';

import type { CreateTeamInput } from '../models';
import {
  CREATE_TEAM_MUTATION,
  DELETE_TEAM_MUTATION,
  GET_TEAMS_QUERY,
  TEAMS_GRAPHQL_URL,
  TeamApiService,
} from './team-api.service';

describe('TeamApiService', () => {
  let service: TeamApiService;
  let httpTesting: HttpTestingController;

  const input: CreateTeamInput = {
    trainer_id: 1,
    name: 'Kanto Starters',
    pokemon_ids: [25, 6, 9],
    created_at: '2024-01-15T10:00:00Z',
  };
  const team = { id: '1', ...input, trainer_id: '1' };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TeamApiService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('fetches all team fields and normalizes numeric GraphQL IDs to strings', async () => {
    const result = firstValueFrom(service.getTeams$());
    const request = httpTesting.expectOne(TEAMS_GRAPHQL_URL);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ query: GET_TEAMS_QUERY, variables: {} });
    for (const field of ['id', 'trainer_id', 'name', 'pokemon_ids', 'created_at']) {
      expect(request.request.body.query).toContain(field);
    }
    request.flush({ data: { allTeams: [{ ...team, id: 1, trainer_id: 1 }] } });

    await expect(result).resolves.toEqual([team]);
  });

  it('preserves opaque string IDs without converting them to numbers', async () => {
    const result = firstValueFrom(service.getTeams$());
    httpTesting.expectOne(TEAMS_GRAPHQL_URL).flush({
      data: { allTeams: [{ ...team, id: 'team-one', trainer_id: 'trainer-one' }] },
    });
    await expect(result).resolves.toEqual([{ ...team, id: 'team-one', trainer_id: 'trainer-one' }]);
  });

  it('returns an empty array for a successful empty list', async () => {
    const result = firstValueFrom(service.getTeams$());
    httpTesting.expectOne(TEAMS_GRAPHQL_URL).flush({ data: { allTeams: [] }, errors: [] });
    await expect(result).resolves.toEqual([]);
  });

  it('creates a team using the installed schema field arguments and returns the saved team', async () => {
    const result = firstValueFrom(service.createTeam$(input));
    const request = httpTesting.expectOne(TEAMS_GRAPHQL_URL);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      query: CREATE_TEAM_MUTATION,
      variables: { ...input, trainer_id: '1' },
    });
    expect(request.request.body.query).toContain('createTeam(');
    expect(request.request.body.query).toContain('$pokemon_ids: [Int]!');
    expect(request.request.body.query).not.toContain('data:');
    request.flush({ data: { createTeam: { ...team, id: '4' } } });
    await expect(result).resolves.toEqual({ ...team, id: '4' });
  });

  it.each([1, '1'])(
    'deletes ID %s through an ID! variable and returns the deleted team',
    async (id) => {
      const result = firstValueFrom(service.deleteTeam$(id));
      const request = httpTesting.expectOne(TEAMS_GRAPHQL_URL);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({
        query: DELETE_TEAM_MUTATION,
        variables: { id: '1' },
      });
      expect(request.request.body.query).toContain('deleteTeam(id: $id)');
      expect(request.request.body.query).toContain('$id: ID!');
      request.flush({ data: { deleteTeam: team } });
      await expect(result).resolves.toEqual(team);
    },
  );

  const operations = [
    { operation: 'fetch', field: 'allTeams', message: 'Unable to load teams. Please try again.' },
    {
      operation: 'create',
      field: 'createTeam',
      message: 'Unable to create team. Please try again.',
    },
    {
      operation: 'delete',
      field: 'deleteTeam',
      message: 'Unable to delete team. Please try again.',
    },
  ] as const;

  describe.each(operations)('$operation errors', ({ operation, field, message }) => {
    const call = (): Observable<unknown> => {
      if (operation === 'fetch') return service.getTeams$();
      if (operation === 'create') return service.createTeam$(input);
      return service.deleteTeam$('1');
    };

    it.each([0, 400, 503])('hides HTTP status %s details without retrying', async (status) => {
      const result = firstValueFrom(call());
      const assertion = expect(result).rejects.toThrow(message);
      httpTesting.expectOne(TEAMS_GRAPHQL_URL).flush('private backend error', {
        status,
        statusText: 'Private backend status',
      });
      await assertion;
      httpTesting.expectNone(TEAMS_GRAPHQL_URL);
    });

    it('rejects GraphQL errors even alongside partial data without exposing server messages', async () => {
      const result = firstValueFrom(call());
      const assertion = expect(result).rejects.toThrow(message);
      httpTesting.expectOne(TEAMS_GRAPHQL_URL).flush({
        data: { [field]: operation === 'fetch' ? [team] : team },
        errors: [{ message: 'private GraphQL detail' }],
      });
      await assertion;
      httpTesting.expectNone(TEAMS_GRAPHQL_URL);
    });

    it.each([null, {}, { data: null }, { data: {} }])(
      'reports a safe error for missing response data: %j',
      async (response) => {
        const result = firstValueFrom(call());
        const assertion = expect(result).rejects.toThrow(message);
        httpTesting.expectOne(TEAMS_GRAPHQL_URL).flush(response);
        await assertion;
      },
    );

    it.each([
      null,
      'not a team',
      {},
      { ...team, id: null },
      { ...team, trainer_id: {} },
      { ...team, pokemon_ids: ['25'] },
      { ...team, pokemon_ids: [null] },
      { ...team, created_at: 'not a date' },
      { ...team, name: null },
    ])('reports a safe error for malformed team data: %j', async (malformed) => {
      const result = firstValueFrom(call());
      const assertion = expect(result).rejects.toThrow(message);
      httpTesting.expectOne(TEAMS_GRAPHQL_URL).flush({
        data: { [field]: operation === 'fetch' ? [malformed] : malformed },
      });
      await assertion;
    });
  });

  it('rejects a non-array allTeams value instead of treating it as empty', async () => {
    const result = firstValueFrom(service.getTeams$());
    const assertion = expect(result).rejects.toThrow('Unable to load teams. Please try again.');
    httpTesting.expectOne(TEAMS_GRAPHQL_URL).flush({ data: { allTeams: team } });
    await assertion;
  });

  it('cancels the request when the subscriber unsubscribes', () => {
    const subscription = service.getTeams$().subscribe();
    const request = httpTesting.expectOne(TEAMS_GRAPHQL_URL);
    subscription.unsubscribe();
    expect(request.cancelled).toBe(true);
  });
});
