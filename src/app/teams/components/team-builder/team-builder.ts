import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AsyncValidatorFn,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { debounceTime, distinctUntilChanged, finalize, map, timer } from 'rxjs';

import type { PokemonListItem } from '../../../pokedex/models';
import { TeamStore } from '../../state/team.store';

const trimmedName: ValidatorFn = (control) => {
  const length = (control.value as string).trim().length;
  if (!length) return { required: true };
  if (length < 3) return { minlength: { requiredLength: 3, actualLength: length } };
  if (length > 30) return { maxlength: { requiredLength: 30, actualLength: length } };
  return null;
};

let nextBuilderId = 0;

@Component({
  selector: 'app-team-builder',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './team-builder.html',
  styleUrl: './team-builder.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamBuilder {
  private readonly store = inject(TeamStore);
  private readonly destroyRef = inject(DestroyRef);
  readonly teamState = toSignal(this.store.state$, { requireSync: true });
  private readonly teamsLoaded = signal(false);
  private readonly teamNames = signal({ ready: false, names: [] as string[] });
  private readonly uniqueName: AsyncValidatorFn = (control) => {
    const name = (control.value as string).trim().toLowerCase();
    // Angular unsubscribes this timer when the value or team list changes.
    return timer(300).pipe(
      map(() => {
        const { ready, names } = this.teamNames();
        if (!ready) return { teamNamesUnavailable: true };
        return names.includes(name) ? { nameTaken: true } : null;
      }),
      takeUntilDestroyed(this.destroyRef),
    );
  };

  readonly items = input.required<readonly PokemonListItem[]>();
  readonly pokemonLoading = input(false);
  readonly pokemonError = input<string | null>(null);
  readonly pokemonRetry = output<void>();
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  private readonly pokemonInput = viewChild<ElementRef<HTMLInputElement>>('pokemonInput');
  private readonly suggestionsList = viewChild<ElementRef<HTMLUListElement>>('suggestionsList');

  readonly id = `team-builder-${++nextBuilderId}`;
  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: trimmedName,
      asyncValidators: this.uniqueName,
    }),
    pokemon: new FormControl('', { nonNullable: true }),
    selected: new FormControl<readonly PokemonListItem[]>([], {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(1), Validators.maxLength(6)],
    }),
  });
  readonly submitting = signal(false);
  readonly submitError = signal<string | null>(null);
  readonly submitSuccess = signal(false);
  readonly selected = toSignal(this.form.controls.selected.valueChanges, { initialValue: [] });
  readonly search = toSignal(
    this.form.controls.pokemon.valueChanges.pipe(
      map((value) => value.trim().toLowerCase()),
      debounceTime(300),
      distinctUntilChanged(),
    ),
    { initialValue: '' },
  );
  readonly suggestions = computed(() => {
    const query = this.search();
    if (!query) return [];
    const selectedIds = new Set(this.selected().map((pokemon) => pokemon.id));
    return this.items()
      .slice(0, 150)
      .filter(
        (pokemon) => !selectedIds.has(pokemon.id) && pokemon.name.toLowerCase().includes(query),
      )
      .slice(0, 10);
  });
  readonly suggestionsDismissed = signal(false);
  readonly suggestionsOpen = computed(
    () =>
      !!this.search() &&
      !this.suggestionsDismissed() &&
      !this.pokemonLoading() &&
      !this.pokemonError() &&
      !this.submitting(),
  );
  readonly activeSuggestion = linkedSignal(() => {
    this.suggestions();
    this.suggestionsOpen();
    return -1;
  });
  readonly activeSuggestionId = computed(() => {
    const pokemon = this.suggestions()[this.activeSuggestion()];
    return this.suggestionsOpen() && this.selected().length < 6 && pokemon
      ? `${this.id}-option-${pokemon.id}`
      : null;
  });

  // Form events include touched/pristine changes, so OnPush errors update even without value changes.
  private readonly formEvents = toSignal(this.form.events, { initialValue: null });
  readonly nameError = computed(() => {
    this.formEvents();
    const control = this.form.controls.name;
    if (!control.dirty && !control.touched) return null;
    if (control.hasError('required')) return 'Enter a team name.';
    if (control.hasError('minlength')) return 'Use at least 3 characters for the team name.';
    if (control.hasError('maxlength')) return 'Use no more than 30 characters for the team name.';
    if (control.hasError('nameTaken')) return 'A team with this name already exists.';
    if (control.hasError('teamNamesUnavailable')) {
      return 'Team names cannot be checked yet. Reload teams to continue.';
    }
    return null;
  });
  readonly namePending = computed(() => {
    this.formEvents();
    const control = this.form.controls.name;
    return control.pending && (control.dirty || control.touched);
  });
  readonly submitDisabled = computed(() => {
    this.formEvents();
    return this.submitting() || this.form.pending || !this.teamNames().ready;
  });
  readonly teamNamesStatus = computed(() => {
    const state = this.teamState();
    if (state.loading) return 'Loading existing team names…';
    if (state.loadError) return 'Couldn’t verify existing team names. Reload teams to continue.';
    if (!this.teamsLoaded()) return 'Load existing teams before creating a team.';
    return null;
  });
  readonly selectionError = computed(() => {
    this.formEvents();
    const control = this.form.controls.selected;
    if (!control.dirty && !control.touched) return null;
    if (control.hasError('required') || control.hasError('minlength')) {
      return 'Choose at least one Pokémon.';
    }
    if (control.hasError('maxlength')) return 'Choose no more than 6 Pokémon.';
    return null;
  });

  constructor() {
    let previous = this.teamState();
    this.store.state$
      .pipe(
        map((state) => {
          // A successful load replaces the list; cancellation only clears loading.
          if (
            previous.loading &&
            !state.loading &&
            !state.loadError &&
            previous.teams !== state.teams
          ) {
            this.teamsLoaded.set(true);
          }
          previous = state;
          return {
            ready: this.teamsLoaded() && !state.loading && !state.loadError,
            names: state.teams.map((team) => team.name.trim().toLowerCase()).sort(),
          };
        }),
        // Creating/deleting flags and equivalent lists must not restart validation.
        distinctUntilChanged(
          (before, after) =>
            before.ready === after.ready &&
            JSON.stringify(before.names) === JSON.stringify(after.names),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((names) => {
        this.teamNames.set(names);
        this.form.controls.name.updateValueAndValidity();
      });

    // The store has no loaded flag, so establish a read if none is in progress.
    if (!this.teamState().loading && !this.teamState().loadError) this.reloadTeams();
  }

  reloadTeams(): void {
    if (this.teamState().loading || this.submitting()) return;
    this.store
      .loadTeams$()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: () => undefined }); // Store exposes a safe, actionable state below.
  }

  searchPokemon(): void {
    this.suggestionsDismissed.set(false);
    this.activeSuggestion.set(-1);
  }

  blurPokemon(): void {
    this.form.controls.selected.markAsTouched();
    this.suggestionsDismissed.set(true);
    this.activeSuggestion.set(-1);
  }

  navigateSuggestions(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (this.suggestionsOpen()) event.preventDefault();
      this.suggestionsDismissed.set(true);
      this.activeSuggestion.set(-1);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') return;
    if (event.key !== 'Enter') this.suggestionsDismissed.set(false);
    const suggestions = this.suggestions();
    if (!this.suggestionsOpen() || !suggestions.length || this.selected().length >= 6) return;

    const active = this.activeSuggestion();
    if (event.key === 'Enter') {
      if (active >= 0) {
        event.preventDefault();
        this.addPokemon(suggestions[active]);
        this.activeSuggestion.set(-1);
      }
      return;
    }

    event.preventDefault();
    const next =
      event.key === 'ArrowDown'
        ? Math.min(active + 1, suggestions.length - 1)
        : active < 0
          ? suggestions.length - 1
          : Math.max(active - 1, 0);
    this.activeSuggestion.set(next);
    this.suggestionsList()
      ?.nativeElement.querySelector(`#${this.id}-option-${suggestions[next].id}`)
      ?.scrollIntoView?.({ block: 'nearest' });
  }

  addPokemon(pokemon: PokemonListItem): void {
    const control = this.form.controls.selected;
    if (
      this.submitting() ||
      this.pokemonLoading() ||
      this.pokemonError() ||
      control.value.length >= 6 ||
      control.value.some((item) => item.id === pokemon.id) ||
      !this.items()
        .slice(0, 150)
        .some((item) => item.id === pokemon.id)
    ) {
      return;
    }
    control.markAsDirty();
    control.setValue([...control.value, pokemon]);
    this.form.controls.pokemon.setValue('');
    this.submitSuccess.set(false);
    this.focusPokemonInput();
  }

  removePokemon(id: number): void {
    if (this.submitting()) return;
    const control = this.form.controls.selected;
    control.markAsDirty();
    control.setValue(control.value.filter((pokemon) => pokemon.id !== id));
    this.submitSuccess.set(false);
    this.focusPokemonInput();
  }

  private focusPokemonInput(): void {
    const input = this.pokemonInput()?.nativeElement;
    queueMicrotask(() => {
      if (input?.isConnected) input.focus();
    });
  }

  submit(): void {
    if (this.submitting()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      if (this.form.controls.name.invalid) this.nameInput()?.nativeElement.focus();
      else this.focusPokemonInput();
      return;
    }
    if (this.form.pending || !this.teamNames().ready) return;

    this.submitting.set(true);
    this.submitError.set(null);
    this.submitSuccess.set(false);
    const { name, selected } = this.form.getRawValue();
    this.store
      .createTeam$({
        trainer_id: 1,
        name: name.trim(),
        pokemon_ids: selected.map((pokemon) => pokemon.id),
        created_at: new Date().toISOString(),
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.submitting.set(false)),
      )
      .subscribe({
        next: () => {
          this.form.reset();
          this.submitSuccess.set(true);
        },
        error: () =>
          this.submitError.set(
            'Unable to create your team. Your choices are saved here. Try again.',
          ),
      });
  }
}
