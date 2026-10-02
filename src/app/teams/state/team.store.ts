import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, catchError, defer, finalize, tap, throwError } from 'rxjs';

import type { CreateTeamInput, Team } from '../models';
import { TeamApiService } from '../services/team-api.service';

const LOAD_ERROR = 'Unable to load teams. Please try again.';
const CREATE_ERROR = 'Unable to create team. Please try again.';
const DELETE_ERROR = 'Unable to delete team. Please try again.';

export interface TeamState {
  teams: Team[];
  loading: boolean;
  error: string | null;
  creating: boolean;
  deletingIds: string[];
}

@Injectable({ providedIn: 'root' })
export class TeamStore {
  private readonly api = inject(TeamApiService);
  private readonly pendingCreates = new Set<string>();
  private readonly pendingDeletes = new Map<symbol, string>();
  private nextTempId = 0;
  private loadRequest = 0;
  private deletedDuringLoad = new Set<string>();
  private readonly stateSubject = new BehaviorSubject<TeamState>({
    teams: [],
    loading: false,
    error: null,
    creating: false,
    deletingIds: [],
  });

  readonly state$: Observable<TeamState> = this.stateSubject.asObservable();

  /** Loads teams on subscription. Resubscribe to retry a failed read safely. */
  loadTeams$(): Observable<Team[]> {
    return defer(() => {
      const request = ++this.loadRequest;
      const initialTeams = new Map(this.stateSubject.value.teams.map((team) => [team.id, team]));
      this.deletedDuringLoad = new Set();
      this.updateState({ loading: true, error: null });

      return defer(() => this.api.getTeams$()).pipe(
        tap((teams) => {
          if (request !== this.loadRequest) return;

          // Keep pending entries and mutations completed since this read began.
          const currentTeams = this.stateSubject.value.teams;
          const currentIds = new Set(currentTeams.map((team) => team.id));
          const localTeams = currentTeams.filter(
            (team) => this.pendingCreates.has(team.id) || initialTeams.get(team.id) !== team,
          );
          const localIds = new Set(localTeams.map((team) => team.id));
          this.updateState({
            teams: [
              ...teams.filter(
                (team) =>
                  !localIds.has(team.id) &&
                  !this.deletedDuringLoad.has(team.id) &&
                  (!initialTeams.has(team.id) || currentIds.has(team.id)),
              ),
              ...localTeams,
            ],
            loading: false,
          });
        }),
        catchError(() => {
          if (request === this.loadRequest) {
            this.updateState({ loading: false, error: LOAD_ERROR });
          }
          return throwError(() => new Error(LOAD_ERROR));
        }),
        finalize(() => {
          if (request === this.loadRequest && this.stateSubject.value.loading) {
            this.updateState({ loading: false });
          }
        }),
      );
    });
  }

  /**
   * Inserts a temporary team on subscription, replacing it with the saved record.
   * Failure or cancellation rolls back only this insertion; mutations never auto-retry.
   * @param input Team fields accepted by the local mock server.
   */
  createTeam$(input: CreateTeamInput): Observable<Team> {
    return defer(() => {
      const tempId = `temp-team-${++this.nextTempId}`;
      const optimisticTeam: Team = {
        ...input,
        id: tempId,
        trainer_id: String(input.trainer_id),
        pokemon_ids: [...input.pokemon_ids],
      };
      this.pendingCreates.add(tempId);
      this.updateState({
        teams: [...this.stateSubject.value.teams, optimisticTeam],
        creating: true,
        error: null,
      });

      return defer(() => this.api.createTeam$(input)).pipe(
        tap((team) => this.finishCreate(tempId, team)),
        catchError(() => {
          this.finishCreate(tempId);
          this.updateState({ error: CREATE_ERROR });
          return throwError(() => new Error(CREATE_ERROR));
        }),
        finalize(() => this.finishCreate(tempId)),
      );
    });
  }

  /**
   * Marks a team as deleting on subscription and removes it only after success.
   * Failure or cancellation preserves the team; mutations never auto-retry.
   * @param id Saved team ID to delete.
   */
  deleteTeam$(id: string): Observable<Team> {
    return defer(() => {
      const request = Symbol(id);
      this.pendingDeletes.set(request, id);
      this.updateState({ deletingIds: [...new Set(this.pendingDeletes.values())], error: null });

      return defer(() => this.api.deleteTeam$(id)).pipe(
        tap(() => {
          this.finishDelete(request);
          if (this.stateSubject.value.loading) this.deletedDuringLoad.add(id);
          this.updateState({
            teams: this.stateSubject.value.teams.filter((team) => team.id !== id),
          });
        }),
        catchError(() => {
          this.finishDelete(request);
          this.updateState({ error: DELETE_ERROR });
          return throwError(() => new Error(DELETE_ERROR));
        }),
        finalize(() => this.finishDelete(request)),
      );
    });
  }

  private finishCreate(tempId: string, savedTeam?: Team): void {
    if (!this.pendingCreates.delete(tempId)) return;

    const teams = this.stateSubject.value.teams;
    this.updateState({
      teams: savedTeam
        ? teams
            .filter((team) => team.id !== savedTeam.id)
            .map((team) => (team.id === tempId ? savedTeam : team))
        : teams.filter((team) => team.id !== tempId),
      creating: this.pendingCreates.size > 0,
    });
  }

  private finishDelete(request: symbol): void {
    if (this.pendingDeletes.delete(request)) {
      this.updateState({ deletingIds: [...new Set(this.pendingDeletes.values())] });
    }
  }

  private updateState(update: Partial<TeamState>): void {
    this.stateSubject.next({ ...this.stateSubject.value, ...update });
  }
}
