import { DOCUMENT, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import type { PokemonDetail, PokemonListItem } from '../../models';

@Component({
  selector: 'app-pokemon-detail-panel',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './pokemon-detail-panel.html',
  styleUrl: './pokemon-detail-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'closed.emit()',
  },
})
export class PokemonDetailPanel implements OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private previouslyFocused: HTMLElement | null = null;

  readonly item = input.required<PokemonListItem>();
  readonly detail = input<PokemonDetail | null>(null);
  readonly loading = input<boolean>(false);
  readonly error = input<string | null>(null);
  readonly closed = output<void>();
  readonly retry = output<void>();

  constructor() {
    afterNextRender(() => {
      const active = this.document.activeElement;
      this.previouslyFocused = active instanceof HTMLElement ? active : null;
      this.panel()?.nativeElement.focus({ preventScroll: true });
    });
  }

  ngOnDestroy(): void {
    if (this.previouslyFocused?.isConnected) {
      this.previouslyFocused.focus();
    }
  }

  keepFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;

    const panel = this.panel()?.nativeElement;
    if (!panel) return;

    const buttons = Array.from(panel.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
    const first = buttons[0];
    const last = buttons.at(-1);
    const active = this.document.activeElement;

    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first?.focus();
    }
  }
}
