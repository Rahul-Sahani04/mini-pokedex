import { TestBed } from '@angular/core/testing';
import { Subject, firstValueFrom, of, throwError } from 'rxjs';

import type { CreateTeamInput, Team } from '../models';
import { TeamApiService } from '../services/team-api.service';
import { TeamStore } from './team.store';

const team: Team = {
  id: '1',
  trainer_id: '1',
  name: 'Kanto Starters',
  pokemon_ids: [1, 4, 7],
  created_at: '2026-10-02T00:00:00Z',
};
const input: CreateTeamInput = { ...team, name: 'New Team' };

describe('TeamStore', () => {
  let store: TeamStore;
  let api: {
    getTeams$: ReturnType<typeof vi.fn>;
    createTeam$: ReturnType<typeof vi.fn>;
    deleteTeam$: ReturnType<typeof vi.fn>;
  };
  const current = () => firstValueFrom(store.state$);

  beforeEach(() => {
    api = {
      getTeams$: vi.fn(() => of([team])),
      createTeam$: vi.fn(() => of({ ...input, id: '2' })),
      deleteTeam$: vi.fn(() => of(team)),
    };
    TestBed.configureTestingModule({
      providers: [TeamStore, { provide: TeamApiService, useValue: api }],
    });
    store = TestBed.inject(TeamStore);
  });

  it('loads only on subscription and retries after a failed read', async () => {
    const loading = new Subject<Team[]>();
    api.getTeams$.mockReturnValueOnce(loading);
    const request = store.loadTeams$();
    expect(api.getTeams$).not.toHaveBeenCalled();
    const subscription = request.subscribe({ error: () => undefined });
    expect((await current()).loading).toBe(true);
    loading.error(new Error('private backend failure'));
    expect(await current()).toEqual(
      expect.objectContaining({
        loading: false,
        loadError: 'Unable to load teams. Please try again.',
        teams: [],
      }),
    );
    subscription.unsubscribe();
    await firstValueFrom(store.loadTeams$());
    expect(await current()).toEqual(
      expect.objectContaining({ loading: false, loadError: null, teams: [team] }),
    );
    expect(api.getTeams$).toHaveBeenCalledTimes(2);
  });

  it('shows an optimistic team immediately and replaces it with the saved record', async () => {
    const pending = new Subject<Team>();
    api.createTeam$.mockReturnValueOnce(pending);
    const request = store.createTeam$(input);
    expect((await current()).teams).toEqual([]);
    const subscription = request.subscribe();
    const optimistic = await current();
    expect(optimistic.creating).toBe(true);
    expect(optimistic.teams).toEqual([
      expect.objectContaining({ id: expect.stringContaining('temp-'), name: input.name }),
    ]);
    const saved = { ...team, id: '2', name: input.name };
    pending.next(saved);
    pending.complete();
    expect(await current()).toEqual(
      expect.objectContaining({ teams: [saved], creating: false, mutationError: null }),
    );
    subscription.unsubscribe();
  });

  it('rolls back only the failed creation while another creation stays pending', async () => {
    const failed = new Subject<Team>();
    const pending = new Subject<Team>();
    api.createTeam$.mockReturnValueOnce(failed).mockReturnValueOnce(pending);
    const errors: string[] = [];
    store.createTeam$(input).subscribe({ error: (error: Error) => errors.push(error.message) });
    const other = store.createTeam$({ ...input, name: 'Second Team' }).subscribe();
    const ids = (await current()).teams.map(({ id }) => id);
    expect(new Set(ids).size).toBe(2);
    failed.error(new Error('private transport error'));
    expect(errors).toEqual(['Unable to create team. Please try again.']);
    expect(await current()).toEqual(
      expect.objectContaining({
        creating: true,
        loadError: null,
        mutationError: errors[0],
        teams: [expect.objectContaining({ id: ids[1], name: 'Second Team' })],
      }),
    );
    other.unsubscribe();
    expect(await current()).toEqual(expect.objectContaining({ creating: false, teams: [] }));
  });

  it('preserves a creation that completes while the list request is in flight', async () => {
    const staleList = new Subject<Team[]>();
    api.getTeams$.mockReturnValueOnce(staleList);
    const list = store.loadTeams$().subscribe();
    const saved = { ...team, id: '2', name: input.name };
    api.createTeam$.mockReturnValueOnce(of(saved));
    await firstValueFrom(store.createTeam$(input));
    staleList.next([team]);
    staleList.complete();
    expect((await current()).teams).toEqual([team, saved]);
    list.unsubscribe();
  });

  it('does not restore a deleted team from a stale list response', async () => {
    const staleList = new Subject<Team[]>();
    api.getTeams$.mockReturnValueOnce(staleList);
    const list = store.loadTeams$().subscribe();
    await firstValueFrom(store.deleteTeam$(team.id));
    staleList.next([team]);
    staleList.complete();
    expect((await current()).teams).toEqual([]);
    list.unsubscribe();
  });

  it('removes only after delete succeeds, preserving the team after errors and clearing pending state', async () => {
    await firstValueFrom(store.loadTeams$());
    const pending = new Subject<Team>();
    api.deleteTeam$
      .mockReturnValueOnce(pending)
      .mockReturnValueOnce(throwError(() => new Error('private failure')));
    const subscription = store.deleteTeam$(team.id).subscribe();
    expect(await current()).toEqual(
      expect.objectContaining({ teams: [team], deletingIds: [team.id] }),
    );
    subscription.unsubscribe();
    expect(await current()).toEqual(expect.objectContaining({ teams: [team], deletingIds: [] }));
    const errors: string[] = [];
    store.deleteTeam$(team.id).subscribe({ error: (error: Error) => errors.push(error.message) });
    expect(errors).toEqual(['Unable to delete team. Please try again.']);
    expect(await current()).toEqual(
      expect.objectContaining({ teams: [team], deletingIds: [], mutationError: errors[0] }),
    );
    await firstValueFrom(store.deleteTeam$(team.id));
    expect(await current()).toEqual(
      expect.objectContaining({ teams: [], deletingIds: [], mutationError: null }),
    );
  });
});
