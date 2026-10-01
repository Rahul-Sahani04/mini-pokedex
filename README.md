# Mini Pokédex

Angular 21 standalone application scaffold for the Mini Pokédex assessment.

## Commands

```bash
npm install
npm start
npm run build
npm test
npm run lint
```

The app is available at `http://localhost:4200/`. Feature behavior is intentionally
not implemented in this scaffold checkpoint.

## Structure

- `src/app/pokedex/` — Pokémon models, services, state, and components
- `src/app/teams/` — team models, services, state, and components
- `src/app/common/` — genuinely shared UI, constants, utilities, and styles
- `src/app/core/` — cross-cutting services

Components are standalone, use `OnPush`, and are styled with colocated SCSS using
BEM class names. RxJS and Signals are provided by Angular for later data-flow
checkpoints.
