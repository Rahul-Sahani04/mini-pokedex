import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import type { PokemonDetail, PokemonListItem, PokemonStat } from '../../models';
import { PokemonStatsChart } from '../pokemon-stats-chart/pokemon-stats-chart';
import { PokemonDetailPanel } from './pokemon-detail-panel';

@Component({ selector: 'app-pokemon-stats-chart', template: '' })
class PokemonStatsChartStub {
  readonly stats = input.required<readonly PokemonStat[]>();
}

const item: PokemonListItem = {
  id: 1,
  name: 'bulbasaur',
  height: 7,
  weight: 69,
  stats: [{ name: 'hp', baseStat: 45, effort: 0 }],
  types: [{ name: 'grass', slot: 1 }],
  sprite: {
    officialArtwork: 'https://example.com/bulbasaur.png',
    frontDefault: null,
    frontShiny: null,
    backDefault: null,
    backShiny: null,
  },
};

const detail: PokemonDetail = {
  ...item,
  stats: [
    { name: 'hp', baseStat: 45, effort: 0 },
    { name: 'attack', baseStat: 49, effort: 0 },
    { name: 'defense', baseStat: 49, effort: 0 },
    { name: 'special-attack', baseStat: 65, effort: 1 },
    { name: 'special-defense', baseStat: 65, effort: 0 },
    { name: 'speed', baseStat: 45, effort: 0 },
  ],
  baseExperience: 64,
  abilities: [
    { name: 'overgrow', isHidden: false, shortEffect: 'Boosts Grass moves.', slot: 1 },
    { name: 'chlorophyll', isHidden: true, shortEffect: null, slot: 3 },
  ],
};

describe('PokemonDetailPanel', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PokemonDetailPanel] });
    TestBed.overrideComponent(PokemonDetailPanel, {
      remove: { imports: [PokemonStatsChart] },
      add: { imports: [PokemonStatsChartStub] },
    });
  });

  async function createPanel() {
    const fixture = TestBed.createComponent(PokemonDetailPanel);
    fixture.componentRef.setInput('item', item);
    await fixture.whenStable();
    return fixture;
  }

  it('names and focuses the dialog and announces loading', async () => {
    const fixture = TestBed.createComponent(PokemonDetailPanel);
    fixture.componentRef.setInput('item', item);
    fixture.componentRef.setInput('loading', true);
    await fixture.whenStable();

    const panel = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    expect(panel.getAttribute('aria-label')).toBe('Details for bulbasaur');
    expect(panel.getAttribute('aria-modal')).toBe('true');
    expect(panel.textContent).toContain('#1');
    expect(panel.querySelector('[role="status"]')?.textContent).toContain(
      'Loading Pokémon details',
    );
    expect(panel.querySelector('.pokemon-detail-panel__abilities')).toBeNull();
    expect(document.activeElement).toBe(panel);
    fixture.destroy();
  });

  it('shows an error and emits retry without closing', async () => {
    const fixture = await createPanel();
    const retried = vi.fn();
    const closed = vi.fn();
    fixture.componentInstance.retry.subscribe(retried);
    fixture.componentInstance.closed.subscribe(closed);
    fixture.componentRef.setInput('error', 'Please try again.');
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      'Could not load Pokémon details.',
    );
    (root.querySelector('.pokemon-detail-panel__button') as HTMLButtonElement).click();
    expect(retried).toHaveBeenCalledOnce();
    expect(closed).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('offers a retry when the detail is empty', async () => {
    const fixture = await createPanel();
    const retried = vi.fn();
    fixture.componentInstance.retry.subscribe(retried);
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('[role="status"]')?.textContent).toContain(
      'No details available for this Pokémon.',
    );
    expect(root.querySelector('app-pokemon-stats-chart')).toBeNull();
    (root.querySelector('.pokemon-detail-panel__button') as HTMLButtonElement).click();
    expect(retried).toHaveBeenCalledOnce();
    fixture.destroy();
  });

  it('renders artwork, measurements, stats, and ability effects including hidden metadata', async () => {
    const fixture = await createPanel();
    fixture.componentRef.setInput('detail', detail);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('img')?.getAttribute('src')).toBe(item.sprite.officialArtwork);
    expect(root.querySelector('img')?.getAttribute('alt')).toBe('Artwork of bulbasaur');
    expect(root.textContent).toContain('0.7 m');
    expect(root.textContent).toContain('6.9 kg');
    expect(root.textContent).toContain('64');
    expect(root.textContent).toContain('hp');
    expect(root.textContent).toContain('45');
    expect(root.textContent).toContain('Boosts Grass moves.');
    expect(root.textContent).toContain('chlorophyll');
    expect(root.textContent).toContain('Hidden');
    expect(root.textContent).toContain('Effect description unavailable.');
    const chart = fixture.debugElement.query(By.directive(PokemonStatsChartStub))
      .componentInstance as PokemonStatsChartStub;
    expect(chart.stats()).toBe(detail.stats);
    expect(chart.stats()).toHaveLength(6);
    expect(root.querySelectorAll('.pokemon-detail-panel__stats dt')).toHaveLength(6);
    fixture.destroy();
  });

  it.each([
    ['loading', true],
    ['error', 'Please try again.'],
  ])('removes the chart when %s replaces a successful detail', async (inputName, value) => {
    const fixture = await createPanel();
    fixture.componentRef.setInput('detail', detail);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('app-pokemon-stats-chart')).not.toBeNull();

    fixture.componentRef.setInput(inputName, value);
    await fixture.whenStable();

    expect(root.querySelector('app-pokemon-stats-chart')).toBeNull();
    expect(root.querySelector('.pokemon-detail-panel__stats')).toBeNull();
    fixture.destroy();
  });

  it('updates the existing chart when the panel receives another Pokémon', async () => {
    const fixture = await createPanel();
    fixture.componentRef.setInput('detail', detail);
    await fixture.whenStable();
    const chart = fixture.debugElement.query(By.directive(PokemonStatsChartStub))
      .componentInstance as PokemonStatsChartStub;
    const nextDetail: PokemonDetail = {
      ...detail,
      id: 4,
      name: 'charmander',
      stats: [39, 52, 43, 60, 50, 65].map((baseStat, index) => ({
        ...detail.stats[index],
        baseStat,
      })),
    };

    fixture.componentRef.setInput('item', nextDetail);
    fixture.componentRef.setInput('detail', nextDetail);
    await fixture.whenStable();

    expect(fixture.debugElement.query(By.directive(PokemonStatsChartStub)).componentInstance).toBe(
      chart,
    );
    expect(chart.stats()).toBe(nextDetail.stats);
    expect(chart.stats().map((stat) => stat.baseStat)).toEqual([39, 52, 43, 60, 50, 65]);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(
      'Details for charmander',
    );
    expect(
      Array.from(root.querySelectorAll('.pokemon-detail-panel__stats dd'), (stat) =>
        stat.textContent?.trim(),
      ),
    ).toEqual(['39', '52', '43', '60', '50', '65']);
    fixture.destroy();
  });

  it('closes from the close button, backdrop, and Escape, and keeps Tab within the dialog', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const fixture = await createPanel();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    const root = fixture.nativeElement as HTMLElement;
    const panel = root.querySelector('[role="dialog"]') as HTMLElement;
    const closeButton = root.querySelector('.pokemon-detail-panel__close') as HTMLButtonElement;
    const retryButton = root.querySelector('.pokemon-detail-panel__button') as HTMLButtonElement;

    panel.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }),
    );
    expect(document.activeElement).toBe(retryButton);
    retryButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(closeButton);

    closeButton.click();
    (root.querySelector('.pokemon-detail-panel__backdrop') as HTMLElement).click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closed).toHaveBeenCalledTimes(3);

    fixture.destroy();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
