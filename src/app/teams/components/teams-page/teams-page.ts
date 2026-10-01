import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-teams-page',
  templateUrl: './teams-page.html',
  styleUrl: './teams-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamsPage {}
