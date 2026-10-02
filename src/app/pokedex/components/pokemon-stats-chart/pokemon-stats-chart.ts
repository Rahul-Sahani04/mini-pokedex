import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  afterRenderEffect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import {
  Chart,
  Filler,
  LineElement,
  PointElement,
  RadarController,
  RadialLinearScale,
  Tooltip,
} from 'chart.js';
import type { PokemonStat } from '../../models';

Chart.register(RadarController, RadialLinearScale, PointElement, LineElement, Filler, Tooltip);

const STAT_NAMES = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'];
const STAT_LABELS = ['HP', 'Attack', 'Defense', 'Special Attack', 'Special Defense', 'Speed'];

@Component({
  selector: 'app-pokemon-stats-chart',
  standalone: true,
  templateUrl: './pokemon-stats-chart.html',
  styleUrl: './pokemon-stats-chart.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PokemonStatsChart implements OnDestroy {
  readonly stats = input.required<readonly PokemonStat[]>();

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly document = inject(DOCUMENT);
  private chart?: Chart<'radar'>;

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;

    // Browser-only: Chart.js owns canvas reads and writes after Angular renders it.
    afterRenderEffect(() => {
      const stats = this.stats();
      const data = STAT_NAMES.map(
        (name) => stats.find((stat) => stat.name === name)?.baseStat ?? 0,
      );
      const reducedMotion =
        this.document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ??
        false;
      const animation = reducedMotion ? false : { duration: 650 };

      if (this.chart) {
        this.chart.data.datasets[0].data = data;
        this.chart.options.animation = animation;
        if (reducedMotion) this.chart.update('none');
        else this.chart.update();
        return;
      }

      const context = this.canvas().nativeElement.getContext('2d');
      if (!context) return;

      this.chart = new Chart(context, {
        type: 'radar',
        data: {
          labels: STAT_LABELS,
          datasets: [
            {
              label: 'Base stats',
              data,
              backgroundColor: 'rgba(37, 99, 235, 0.18)',
              borderColor: '#2563eb',
              pointBackgroundColor: '#2563eb',
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation,
          plugins: { legend: { display: false } },
          scales: { r: { min: 0, max: 255, ticks: { stepSize: 50 } } },
        },
      });
    });
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }
}
