import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject, defer, of, tap, throwError } from 'rxjs';

import type { Team } from '../../models';
import { TeamStore } from '../../state/team.store';
import type { TeamState } from '../../state/team.store';
import { TeamsPage } from './teams-page';

const team: Team = {
  id: '1',
  trainer_id: '1',
  name: 'Kanto Starters',
  pokemon_ids: [25, 6, 9],
  created_at: '2024-01-15T10:00:00Z',
};

describe('TeamsPage', () => {
  let state$: BehaviorSubject<TeamState>;
  let loadTeams$: ReturnType<typeof vi.fn>;
  let deleteTeam$: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    state$ = new BehaviorSubject<TeamState>({
      teams: [],
      loading: false,
      error: null,
      creating: false,
      deletingIds: [],
    });
    loadTeams$ = vi.fn(() => of([]));
    deleteTeam$ = vi.fn(() => of(team));
    TestBed.configureTestingModule({
      imports: [TeamsPage],
      providers: [{ provide: TeamStore, useValue: { state$, loadTeams$, deleteTeam$ } }],
    });
  });

  it('shows loading, retries an error, and lists the returned teams', async () => {
    const first = new Subject<Team[]>();
    loadTeams$.mockImplementationOnce(() =>
      defer(() => {
        state$.next({ ...state$.value, loading: true, error: null });
        return first;
      }),
    );
    const fixture = TestBed.createComponent(TeamsPage);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Loading teams');
    expect(root.querySelectorAll('.teams-page__card--skeleton')).toHaveLength(3);

    state$.next({
      ...state$.value,
      loading: false,
      error: 'Unable to load teams. Please try again.',
    });
    first.error(new Error('offline'));
    await fixture.whenStable();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Couldn’t load teams');
    loadTeams$.mockImplementationOnce(() =>
      defer(() => {
        state$.next({ ...state$.value, loading: true, error: null });
        state$.next({ ...state$.value, teams: [team], loading: false });
        return of([team]);
      }),
    );
    (root.querySelector('.teams-page__state button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(loadTeams$).toHaveBeenCalledTimes(2);
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(root.querySelector('.teams-page__card')?.textContent).toContain('Kanto Starters');
    expect(root.querySelector('.teams-page__card')?.textContent).toContain('3');
  });

  it('shows an explicit empty state after a successful empty response', async () => {
    const fixture = TestBed.createComponent(TeamsPage);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('No teams yet');
    expect(fixture.nativeElement.querySelector('.teams-page__card')).toBeNull();
  });

  it('keeps a team visible while deletion is pending, then removes it on success', async () => {
    state$.next({ ...state$.value, teams: [team] });
    const pending = new Subject<Team>();
    deleteTeam$.mockImplementationOnce(() =>
      defer(() => {
        state$.next({ ...state$.value, deletingIds: [team.id] });
        return pending.pipe(
          tap(() => state$.next({ ...state$.value, teams: [], deletingIds: [] })),
        );
      }),
    );
    const fixture = TestBed.createComponent(TeamsPage);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const button = root.querySelector('.teams-page__button--delete') as HTMLButtonElement;
    button.click();
    await fixture.whenStable();
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Deleting');
    expect(root.textContent).toContain(team.name);
    button.click();
    expect(deleteTeam$).toHaveBeenCalledTimes(1);
    pending.next(team);
    pending.complete();
    await fixture.whenStable();
    expect(root.textContent).toContain('No teams yet');
  });

  it('retains the team and permits another attempt after a failed delete', async () => {
    state$.next({ ...state$.value, teams: [team] });
    deleteTeam$.mockReturnValueOnce(throwError(() => new Error('backend detail')));
    const fixture = TestBed.createComponent(TeamsPage);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const button = root.querySelector('.teams-page__button--delete') as HTMLButtonElement;
    button.click();
    await fixture.whenStable();
    expect(root.querySelector('.teams-page__action-error')?.textContent).toContain(
      'Select Delete to try again',
    );
    expect(root.textContent).toContain(team.name);
    button.click();
    await fixture.whenStable();
    expect(deleteTeam$).toHaveBeenCalledTimes(2);
    expect(root.querySelector('.teams-page__action-error')).toBeNull();
  });
});
