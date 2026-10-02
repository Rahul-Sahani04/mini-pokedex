import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';

import { TeamStore } from '../../state/team.store';

@Component({
  selector: 'app-teams-page',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './teams-page.html',
  styleUrl: './teams-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamsPage {
  private readonly store = inject(TeamStore);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = toSignal(this.store.state$, { requireSync: true });
  readonly loadError = signal<string | null>(null);
  readonly deleteErrors = signal<Record<string, string>>({});
  readonly skeletonCards = [1, 2, 3];

  constructor() {
    this.retry();
  }

  retry(): void {
    if (this.state().loading) return;

    this.loadError.set(null);
    this.store
      .loadTeams$()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () => this.loadError.set('Unable to load teams. Please try again.'),
      });
  }

  deleteTeam(id: string): void {
    if (
      this.state().deletingIds.includes(id) ||
      !this.state().teams.some((team) => team.id === id)
    ) {
      return;
    }

    this.deleteErrors.update((errors) => {
      const remaining = { ...errors };
      delete remaining[id];
      return remaining;
    });
    this.store
      .deleteTeam$(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () =>
          this.deleteErrors.update((errors) => ({
            ...errors,
            [id]: 'Unable to delete this team. Select Delete to try again.',
          })),
      });
  }
}
