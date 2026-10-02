import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Chart, type ChartConfiguration } from 'chart.js';
import type { PokemonStat } from '../../models';
import { PokemonStatsChart } from './pokemon-stats-chart';

vi.mock('chart.js', () => {
  return {
    Chart: Object.assign(
      vi.fn(function (_context: CanvasRenderingContext2D, config: ChartConfiguration<'radar'>) {
        return {
          data: config.data,
          options: config.options,
          update: vi.fn(),
          destroy: vi.fn(),
        };
      }),
      { register: vi.fn() },
    ),
    RadarController: class {},
    RadialLinearScale: class {},
    PointElement: class {},
    LineElement: class {},
    Filler: class {},
    Tooltip: class {},
  };
});

const stat = (name: string, baseStat: number): PokemonStat => ({ name, baseStat, effort: 0 });

describe('PokemonStatsChart', () => {
  let reducedMotion: boolean;

  beforeEach(() => {
    vi.clearAllMocks();
    reducedMotion = false;
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: reducedMotion })),
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      {} as CanvasRenderingContext2D,
    );
    TestBed.configureTestingModule({ imports: [PokemonStatsChart] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function createChart(stats: readonly PokemonStat[] = []) {
    const fixture = TestBed.createComponent(PokemonStatsChart);
    fixture.componentRef.setInput('stats', stats);
    await fixture.whenStable();
    return fixture;
  }

  function chartInstance(): Chart<'radar'> {
    return vi.mocked(Chart).mock.results[0].value as Chart<'radar'>;
  }

  it('uses six fixed axes, orders incoming stats, and fills missing stats with zero', async () => {
    const fixture = await createChart([
      stat('speed', 90),
      stat('special-attack', 100),
      stat('hp', 45),
      stat('attack', 55),
      stat('unknown', 999),
    ]);
    const chart = chartInstance();

    expect(chart.data.labels).toEqual([
      'HP',
      'Attack',
      'Defense',
      'Special Attack',
      'Special Defense',
      'Speed',
    ]);
    expect(chart.data.datasets[0].data).toEqual([45, 55, 0, 100, 0, 90]);
    expect(chart.options.animation).toEqual({ duration: 650 });
    const canvas = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;
    expect(canvas.getAttribute('role')).toBe('img');
    expect(canvas.getAttribute('aria-label')).toContain('Pokémon base stats radar chart');
    fixture.destroy();
  });

  it('updates the existing dataset with animation without recreating the chart or canvas', async () => {
    const fixture = await createChart([stat('hp', 45)]);
    const chart = chartInstance();
    const canvas = fixture.nativeElement.querySelector('canvas');

    fixture.componentRef.setInput('stats', [stat('defense', 80), stat('hp', 70)]);
    await fixture.whenStable();

    expect(chart.data.datasets[0].data).toEqual([70, 0, 80, 0, 0, 0]);
    expect(chart.update).toHaveBeenCalledExactlyOnceWith();
    expect(chart.options.animation).toEqual({ duration: 650 });
    expect(Chart).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.querySelector('canvas')).toBe(canvas);
    fixture.destroy();
  });

  it('disables initial and update animations when reduced motion is requested', async () => {
    reducedMotion = true;
    const fixture = await createChart([stat('hp', 45)]);
    const chart = chartInstance();
    expect(chart.options.animation).toBe(false);

    fixture.componentRef.setInput('stats', [stat('speed', 80)]);
    await fixture.whenStable();

    expect(chart.data.datasets[0].data).toEqual([0, 0, 0, 0, 0, 80]);
    expect(chart.options.animation).toBe(false);
    expect(chart.update).toHaveBeenCalledExactlyOnceWith('none');
    fixture.destroy();
  });

  it('rechecks motion preference before updating', async () => {
    const fixture = await createChart();
    const chart = chartInstance();
    reducedMotion = true;
    fixture.componentRef.setInput('stats', [stat('attack', 75)]);
    await fixture.whenStable();

    expect(chart.options.animation).toBe(false);
    expect(chart.update).toHaveBeenCalledExactlyOnceWith('none');
    fixture.destroy();
  });

  it('destroys the chart when the component is destroyed', async () => {
    const fixture = await createChart();
    const chart = chartInstance();
    expect(chart.destroy).not.toHaveBeenCalled();

    fixture.destroy();

    expect(chart.destroy).toHaveBeenCalledOnce();
  });

  it('safely skips chart creation when a canvas context is unavailable', async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    const fixture = await createChart([stat('hp', 45)]);

    expect(Chart).not.toHaveBeenCalled();
    expect(() => fixture.destroy()).not.toThrow();
  });

  it('does not access the canvas during server-side rendering', async () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: 'server' });
    const fixture = await createChart([stat('hp', 45)]);

    expect(HTMLCanvasElement.prototype.getContext).not.toHaveBeenCalled();
    expect(Chart).not.toHaveBeenCalled();
    fixture.destroy();
  });
});
