import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, firstValueFrom, of } from 'rxjs';

import type { PokemonListItem } from '../../../pokedex/models';
import type { Team } from '../../models';
import { TeamApiService } from '../../services/team-api.service';
import { TeamStore } from '../../state/team.store';
import { TeamBuilder } from './team-builder';

function pokemon(id: number, name = `pokemon-${id}`): PokemonListItem {
  return {
    id,
    name,
    height: 1,
    weight: 1,
    stats: [],
    types: [],
    sprite: {
      backDefault: null,
      backShiny: null,
      frontDefault: null,
      frontShiny: null,
      officialArtwork: null,
    },
  };
}

const items = [pokemon(1, 'bulbasaur'), pokemon(4, 'charmander'), pokemon(25, 'pikachu')];
const savedTeam: Team = {
  id: '10',
  trainer_id: '1',
  name: 'Kanto',
  pokemon_ids: [25],
  created_at: '2026-10-03T00:00:00.000Z',
};

describe('TeamBuilder', () => {
  let fixture: ComponentFixture<TeamBuilder>;
  let component: TeamBuilder;
  let root: HTMLElement;
  let createTeam$: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    createTeam$ = vi.fn(() => of(savedTeam));
    TestBed.configureTestingModule({
      imports: [TeamBuilder],
      providers: [{ provide: TeamApiService, useValue: { createTeam$ } }],
    });
    fixture = TestBed.createComponent(TeamBuilder);
    fixture.componentRef.setInput('items', items);
    component = fixture.componentInstance;
    root = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
  });

  function input(control: 'name' | 'pokemon', value: string): void {
    const element = root.querySelector(`[formControlName="${control}"]`) as HTMLInputElement;
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }

  it('hides pristine errors and reveals required errors only after interaction or submit', async () => {
    expect(root.querySelector('.team-builder__error')).toBeNull();
    expect(component.form.invalid).toBe(true);
    const name = root.querySelector('[formControlName="name"]') as HTMLInputElement;
    name.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    expect(root.textContent).toContain('Enter a team name.');
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(root.textContent).not.toContain('Choose at least one Pokémon.');

    (root.querySelector('[type="submit"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(root.textContent).toContain('Choose at least one Pokémon.');
    expect(createTeam$).not.toHaveBeenCalled();
  });

  it.each([
    ['   ', 'required'],
    [' ab ', 'minlength'],
    [' abc ', null],
    [` ${'a'.repeat(30)} `, null],
    ['a'.repeat(31), 'maxlength'],
  ])('validates trimmed name boundaries for %j', (value, error) => {
    const name = component.form.controls.name;
    name.setValue(value);
    expect(error ? name.hasError(error) : name.valid).toBe(true);
  });

  it('shows dirty length errors inline', async () => {
    input('name', 'ab');
    await fixture.whenStable();
    expect(root.textContent).toContain('Use at least 3 characters');
    input('name', 'a'.repeat(31));
    await fixture.whenStable();
    expect(root.textContent).toContain('Use no more than 30 characters');
    input('name', 'Kanto');
    await fixture.whenStable();
    expect(root.querySelector('.team-builder__error')).toBeNull();
  });

  it('debounces search by 300ms, normalizes it, and ignores equivalent searches', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    input('pokemon', 'bul');
    await vi.advanceTimersByTimeAsync(299);
    expect(component.suggestions()).toHaveLength(0);
    input('pokemon', ' PIKA ');
    await vi.advanceTimersByTimeAsync(299);
    expect(component.suggestions()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    await fixture.whenStable();
    expect(component.search()).toBe('pika');
    expect(root.querySelectorAll('.team-builder__suggestions button')).toHaveLength(1);
    expect(root.querySelector('[aria-label="Add pikachu"]')).not.toBeNull();

    const results = component.suggestions();
    input('pokemon', 'pika');
    await vi.advanceTimersByTimeAsync(300);
    expect(component.suggestions()).toBe(results);
    input('pokemon', 'missing');
    await vi.advanceTimersByTimeAsync(300);
    await fixture.whenStable();
    expect(root.textContent).toContain('No matching Pokémon');
  });

  it('uses only the supplied first 150 and updates suggestions when items arrive', async () => {
    fixture.componentRef.setInput('items', []);
    await fixture.whenStable();
    expect(root.textContent).toContain('Search to find Pokémon');
    const cached = Array.from({ length: 151 }, (_, index) => pokemon(index + 1));
    fixture.componentRef.setInput('items', cached);
    await fixture.whenStable();
    input('pokemon', 'pokemon-');
    await new Promise((resolve) => setTimeout(resolve, 350));
    await fixture.whenStable();
    expect(component.suggestions()).toHaveLength(10);
    component.addPokemon(cached[150]);
    expect(component.selected()).toHaveLength(0);
  });

  it('renders loading and safe errors with a working retry output', async () => {
    fixture.componentRef.setInput('pokemonLoading', true);
    await fixture.whenStable();
    expect(root.textContent).toContain('Loading Pokémon');
    expect(root.querySelector('.team-builder__suggestions')).toBeNull();
    fixture.componentRef.setInput('pokemonLoading', false);
    fixture.componentRef.setInput('pokemonError', 'raw backend exception');
    const retry = vi.fn();
    component.pokemonRetry.subscribe(retry);
    await fixture.whenStable();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Couldn’t load Pokémon');
    expect(root.textContent).not.toContain('raw backend exception');
    (root.querySelector('.team-builder__results button') as HTMLButtonElement).click();
    expect(retry).toHaveBeenCalledOnce();
  });

  it('selects unique removable chips, caps at six, and validates the minimum after removal', async () => {
    const cached = Array.from({ length: 7 }, (_, index) => pokemon(index + 1));
    fixture.componentRef.setInput('items', cached);
    input('pokemon', 'pokemon-');
    await new Promise((resolve) => setTimeout(resolve, 350));
    await fixture.whenStable();
    (root.querySelector('[aria-label="Add pokemon-1"]') as HTMLButtonElement).click();
    component.addPokemon(cached[0]);
    expect(component.selected()).toHaveLength(1);
    for (const item of cached.slice(1)) component.addPokemon(item);
    await fixture.whenStable();
    expect(component.selected()).toHaveLength(6);
    expect(root.querySelectorAll('.team-builder__chip')).toHaveLength(6);
    expect(root.textContent).toContain('Team full');
    expect((root.querySelector('[aria-label="Add pokemon-7"]') as HTMLButtonElement).disabled).toBe(
      true,
    );

    (root.querySelector('[aria-label="Remove pokemon-1"]') as HTMLButtonElement).click();
    expect(component.selected()).toHaveLength(5);
    for (const item of cached.slice(1, 6)) component.removePokemon(item.id);
    await fixture.whenStable();
    expect(root.textContent).toContain('Choose at least one Pokémon.');
    component.form.controls.selected.setValue(cached);
    await fixture.whenStable();
    expect(component.form.controls.selected.hasError('maxlength')).toBe(true);
    expect(root.textContent).toContain('Choose no more than 6 Pokémon.');
  });

  it('submits trimmed data optimistically, blocks duplicate submits, and resets only after success', async () => {
    const pending = new Subject<Team>();
    createTeam$.mockReturnValueOnce(pending);
    input('name', ' Kanto ');
    input('pokemon', 'pikachu');
    await new Promise((resolve) => setTimeout(resolve, 350));
    await fixture.whenStable();
    (root.querySelector('[aria-label="Add pikachu"]') as HTMLButtonElement).click();
    const submit = root.querySelector('[type="submit"]') as HTMLButtonElement;
    submit.click();
    component.submit();
    await fixture.whenStable();
    expect(createTeam$).toHaveBeenCalledOnce();
    expect(createTeam$).toHaveBeenCalledWith({
      trainer_id: 1,
      name: 'Kanto',
      pokemon_ids: [25],
      created_at: expect.any(String),
    });
    const payload = createTeam$.mock.calls[0][0];
    expect(new Date(payload.created_at).toISOString()).toBe(payload.created_at);
    expect(submit.disabled).toBe(true);
    expect(root.textContent).toContain('Creating team');
    expect(component.form.controls.name.value).toBe(' Kanto ');
    expect(component.selected()).toHaveLength(1);
    const optimistic = await firstValueFrom(TestBed.inject(TeamStore).state$);
    expect(optimistic.teams[0].id).toMatch(/^temp-team-/);
    expect(optimistic.teams[0].name).toBe('Kanto');

    pending.next(savedTeam);
    pending.complete();
    await fixture.whenStable();
    expect(component.form.controls.name.value).toBe('');
    expect(component.selected()).toHaveLength(0);
    expect(component.form.pristine).toBe(true);
    expect(component.form.untouched).toBe(true);
    expect(root.querySelector('.team-builder__error')).toBeNull();
    expect(root.textContent).toContain('Team created successfully');
    expect(submit.disabled).toBe(false);
    expect((await firstValueFrom(TestBed.inject(TeamStore).state$)).teams).toEqual([savedTeam]);
  });

  it('rolls back a failed optimistic create, preserves all inputs, and allows manual retry', async () => {
    const pending = new Subject<Team>();
    createTeam$.mockReturnValueOnce(pending);
    input('name', 'Kanto');
    component.addPokemon(items[2]);
    input('pokemon', 'bul');
    component.submit();
    pending.error(new Error('private backend detail'));
    await fixture.whenStable();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      'Unable to create your team',
    );
    expect(root.textContent).not.toContain('private backend detail');
    expect(component.form.getRawValue()).toEqual({
      name: 'Kanto',
      pokemon: 'bul',
      selected: [items[2]],
    });
    expect((await firstValueFrom(TestBed.inject(TeamStore).state$)).teams).toEqual([]);
    expect(component.submitting()).toBe(false);
    expect(createTeam$).toHaveBeenCalledOnce();

    (root.querySelector('[type="submit"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(createTeam$).toHaveBeenCalledTimes(2);
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(root.textContent).toContain('Team created successfully');
  });

  it('cancels a pending creation and rolls it back when destroyed', async () => {
    const pending = new Subject<Team>();
    createTeam$.mockReturnValueOnce(pending);
    input('name', 'Kanto');
    component.addPokemon(items[2]);
    component.submit();
    const store = TestBed.inject(TeamStore);
    expect((await firstValueFrom(store.state$)).creating).toBe(true);
    fixture.destroy();
    expect((await firstValueFrom(store.state$)).teams).toEqual([]);
    expect((await firstValueFrom(store.state$)).creating).toBe(false);
    expect(pending.observed).toBe(false);
  });
});
