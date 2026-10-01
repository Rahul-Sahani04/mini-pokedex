import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-pokedex-page',
  templateUrl: './pokedex-page.html',
  styleUrl: './pokedex-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PokedexPage {}
