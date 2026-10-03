# Mini Pokédex

An Angular 21 standalone Mini Pokédex with Pokémon browsing and local team
persistence.

## Prerequisites

- Node.js with npm
- Network access to PokéAPI's GraphQL endpoint for Pokémon data
- npm 10.9.2 is declared by the project in `package.json`

## Install and run

```bash
npm install
npm start
```

The app runs at <http://localhost:4200/>. Teams use the local GraphQL mock
server, so run it in a second terminal:

```bash
npm run mock:teams
```

The mock server runs at `http://127.0.0.1:4000/graphql`. Run both `npm start`
and `npm run mock:teams` for the complete app, including saved teams.

## Routes

- `/pokedex` — browse and inspect Pokémon
- `/teams` — create, select, summarize, and delete saved teams

The root route redirects to `/pokedex`; unknown routes do the same.

## Available commands

```bash
npm test                              # Run unit tests once
npm run lint                          # Run ESLint
npm run build                         # Create a production build
npx tsc -p tsconfig.app.json --noEmit # Type-check application sources
npm run format                        # Format the repository with Prettier
npm run format:check                  # Check repository formatting
```

## Implemented features

- Loads the initial 150 Pokémon from PokéAPI GraphQL with loading, retry, and
  error states.
- Filters by name and type, sorts by name or base stats, and paginates the
  loaded results with 10, 25, or 50 rows per page.
- Opens a keyboard-accessible detail panel with artwork, measurements, types,
  abilities, base stats, and a Chart.js radar chart.
- Creates teams of one to six Pokémon with name validation and duplicate-name
  checks; lists and deletes teams through `json-graphql-server` and `db.js`.
- Uses optimistic team creation/deletion, retryable failures, and persists the
  selected team ID in browser `localStorage`.
- Shows team member details plus aggregate base-stat and type summaries.

## Architecture

- Angular 21 standalone components use `ChangeDetectionStrategy.OnPush` and
  lazy-loaded routes.
- RxJS `BehaviorSubject` stores manage Pokémon and team state; Angular Signals
  derive component view state and UI controls.
- `PokemonApiService` sends GraphQL queries to PokéAPI.
- `TeamApiService` sends GraphQL queries and mutations to the local
  `json-graphql-server` started by `npm run mock:teams`.
- Feature code is organized under `src/app/pokedex` and `src/app/teams`, with
  colocated components, models, services, state, templates, and styles.

## Known limitation

Client-side search, team Pokémon selection, and team summaries use only the
first 150 loaded Pokémon. Pokémon beyond that batch are not available to those
flows.

## Future improvements

- Add API-backed pagination and server/API-scale search instead of relying on a
  fixed initial batch.
- Add end-to-end coverage for the browser flows and mock-server integration.
- Provide more robust persistence for teams and selected-team state.

No secrets are required or stored by this project.
