module.exports = {
  trainers: [
    {
      id: 1,
      name: 'Ash Ketchum',
      region: 'Kanto',
      avatar_url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/trainers/1.png',
    },
    {
      id: 2,
      name: 'Misty Waterflower',
      region: 'Kanto',
      avatar_url: '',
    },
  ],
  teams: [
    {
      id: 1,
      trainer_id: 1,
      name: 'Kanto Starters',
      pokemon_ids: [25, 6, 9, 3, 131, 143],
      created_at: '2024-01-15T10:00:00Z',
    },
    {
      id: 2,
      trainer_id: 1,
      name: 'Johto Squad',
      pokemon_ids: [157, 181, 214, 248, 197, 169],
      created_at: '2024-03-20T14:30:00Z',
    },
    {
      id: 3,
      trainer_id: 2,
      name: 'Water Specialists',
      pokemon_ids: [121, 130, 134, 73, 91, 99],
      created_at: '2024-02-10T09:00:00Z',
    },
  ],
};
