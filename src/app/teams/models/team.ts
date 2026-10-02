/** GraphQL IDs are strings even when the mock fixture uses numeric IDs. */
export interface Team {
  id: string;
  trainer_id: string;
  name: string;
  pokemon_ids: number[];
  created_at: string;
}

/** Fields accepted by the local mock's createTeam mutation. */
export interface CreateTeamInput {
  trainer_id: string | number;
  name: string;
  pokemon_ids: number[];
  created_at: string;
}
