import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import type { CreateTeamInput, Team } from '../models';

export const TEAMS_GRAPHQL_URL = 'http://127.0.0.1:4000/graphql';

export const GET_TEAMS_QUERY = /* GraphQL */ `
  query GetTeams {
    allTeams {
      id
      trainer_id
      name
      pokemon_ids
      created_at
    }
  }
`;

// json-graphql-server 3.3.2 generates field arguments, not the README's data: String.
export const CREATE_TEAM_MUTATION = /* GraphQL */ `
  mutation CreateTeam(
    $trainer_id: ID!
    $name: String!
    $pokemon_ids: [Int]!
    $created_at: String!
  ) {
    createTeam(
      trainer_id: $trainer_id
      name: $name
      pokemon_ids: $pokemon_ids
      created_at: $created_at
    ) {
      id
      trainer_id
      name
      pokemon_ids
      created_at
    }
  }
`;

export const DELETE_TEAM_MUTATION = /* GraphQL */ `
  mutation DeleteTeam($id: ID!) {
    deleteTeam(id: $id) {
      id
      trainer_id
      name
      pokemon_ids
      created_at
    }
  }
`;

@Injectable({ providedIn: 'root' })
export class TeamApiService {
  private readonly http = inject(HttpClient);

  /** Loads all saved teams, emitting an empty array when there are none. */
  getTeams$(): Observable<Team[]> {
    return this.request$(
      GET_TEAMS_QUERY,
      {},
      'allTeams',
      (value) => {
        if (!Array.isArray(value)) throw new Error('Invalid team list.');
        return value.map((team: unknown) => this.toTeam(team));
      },
      'Unable to load teams. Please try again.',
    );
  }

  /**
   * Creates a team and returns the saved record with its server-assigned ID.
   * Mutations are not automatically retried, avoiding duplicate creations.
   * @param input Team name, trainer ID, Pokémon IDs, and creation timestamp.
   */
  createTeam$(input: CreateTeamInput): Observable<Team> {
    return this.request$(
      CREATE_TEAM_MUTATION,
      {
        trainer_id: String(input.trainer_id),
        name: input.name,
        pokemon_ids: [...input.pokemon_ids],
        created_at: input.created_at,
      },
      'createTeam',
      (value) => this.toTeam(value),
      'Unable to create team. Please try again.',
    );
  }

  /**
   * Deletes a team and returns the deleted record without automatic retries.
   * @param id Saved team ID, accepting numeric fixture IDs or GraphQL strings.
   */
  deleteTeam$(id: string | number): Observable<Team> {
    return this.request$(
      DELETE_TEAM_MUTATION,
      { id: String(id) },
      'deleteTeam',
      (value) => this.toTeam(value),
      'Unable to delete team. Please try again.',
    );
  }

  private request$<T>(
    query: string,
    variables: Record<string, unknown>,
    field: string,
    parse: (value: unknown) => T,
    userMessage: string,
  ): Observable<T> {
    return this.http.post<unknown>(TEAMS_GRAPHQL_URL, { query, variables }).pipe(
      map((response) => {
        if (
          !isRecord(response) ||
          (response['errors'] != null &&
            (!Array.isArray(response['errors']) || response['errors'].length > 0)) ||
          !isRecord(response['data'])
        ) {
          throw new Error('Invalid GraphQL response.');
        }

        return parse(response['data'][field]);
      }),
      catchError(() => throwError(() => new Error(userMessage))),
    );
  }

  private toTeam(value: unknown): Team {
    if (
      !isRecord(value) ||
      typeof value['name'] !== 'string' ||
      !value['name'].trim() ||
      typeof value['created_at'] !== 'string' ||
      !Number.isFinite(Date.parse(value['created_at'])) ||
      !Array.isArray(value['pokemon_ids']) ||
      !value['pokemon_ids'].every(
        (id: unknown) => typeof id === 'number' && Number.isSafeInteger(id) && id > 0,
      )
    ) {
      throw new Error('Invalid team record.');
    }

    return {
      id: this.toId(value['id']),
      trainer_id: this.toId(value['trainer_id']),
      name: value['name'],
      pokemon_ids: [...value['pokemon_ids']],
      created_at: value['created_at'],
    };
  }

  private toId(value: unknown): string {
    if (
      (typeof value === 'string' && value.trim().length > 0) ||
      (typeof value === 'number' && Number.isSafeInteger(value))
    ) {
      return String(value);
    }

    throw new Error('Invalid GraphQL ID.');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
