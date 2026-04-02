export const MANA_COLORS = ['W', 'U', 'B', 'R', 'G'] as const;
export type ManaColor = (typeof MANA_COLORS)[number];

export const COLOR_NAMES: Record<ManaColor, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
};

export const COLOR_HEX: Record<ManaColor | 'C', string> = {
  W: '#f9faf4',
  U: '#0e68ab',
  B: '#150b00',
  R: '#d3202a',
  G: '#00733e',
  C: '#ccc2c0',
};

export const PHASES = [
  'beginning',
  'precombat_main',
  'combat',
  'postcombat_main',
  'ending',
] as const;

export const STEPS = {
  beginning: ['untap', 'upkeep', 'draw'],
  precombat_main: ['main'],
  combat: [
    'beginning_of_combat',
    'declare_attackers',
    'declare_blockers',
    'combat_damage',
    'end_of_combat',
  ],
  postcombat_main: ['main'],
  ending: ['end_step', 'cleanup'],
} as const;

export const ZONES = [
  'library',
  'hand',
  'battlefield',
  'graveyard',
  'exile',
  'command',
  'stack',
] as const;

export const COMMANDER_STARTING_LIFE = 40;
export const COMMANDER_DAMAGE_LETHAL = 21;
export const COMMANDER_DECK_SIZE = 100;
export const COMMANDER_TAX_INCREMENT = 2;
