import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { debounceTime, distinctUntilChanged, finalize, map } from 'rxjs';

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

  readonly items = input.required<readonly PokemonListItem[]>();
  readonly pokemonLoading = input(false);
  readonly pokemonError = input<string | null>(null);
  readonly pokemonRetry = output<void>();

  readonly id = `team-builder-${++nextBuilderId}`;
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: trimmedName }),
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

  // Form events include touched/pristine changes, so OnPush errors update even without value changes.
  private readonly formEvents = toSignal(this.form.events, { initialValue: null });
  readonly nameError = computed(() => {
    this.formEvents();
    const control = this.form.controls.name;
    if (!control.dirty && !control.touched) return null;
    if (control.hasError('required')) return 'Enter a team name.';
    if (control.hasError('minlength')) return 'Use at least 3 characters for the team name.';
    if (control.hasError('maxlength')) return 'Use no more than 30 characters for the team name.';
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
  }

  removePokemon(id: number): void {
    if (this.submitting()) return;
    const control = this.form.controls.selected;
    control.markAsDirty();
    control.setValue(control.value.filter((pokemon) => pokemon.id !== id));
    this.submitSuccess.set(false);
  }

  submit(): void {
    if (this.submitting()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid || this.form.pending) return;

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
