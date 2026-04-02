import Dexie, { type EntityTable } from 'dexie';

export interface ScryfallCardRecord {
  id: string;
  oracle_id: string;
  name: string;
  mana_cost: string;
  cmc: number;
  type_line: string;
  oracle_text: string;
  colors: string[];
  color_identity: string[];
  keywords: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
  produced_mana?: string[];
  layout: string;
  image_uris?: {
    small: string;
    normal: string;
    large: string;
    art_crop: string;
    border_crop: string;
    png: string;
  };
  card_faces?: Array<{
    name: string;
    mana_cost: string;
    type_line: string;
    oracle_text: string;
    power?: string;
    toughness?: string;
    image_uris?: {
      small: string;
      normal: string;
      large: string;
      art_crop: string;
      border_crop: string;
      png: string;
    };
  }>;
  legalities: Record<string, string>;
  set: string;
  set_name: string;
  rarity: string;
}

export interface DeckRecord {
  id: string;
  userId: string;
  name: string;
  commanderIds: string[];
  cardEntries: Array<{ cardName: string; quantity: number }>;
  format: string;
  createdAt: number;
  updatedAt: number;
}

const db = new Dexie('UndercraftDB') as Dexie & {
  cards: EntityTable<ScryfallCardRecord, 'id'>;
  decks: EntityTable<DeckRecord, 'id'>;
};

db.version(1).stores({
  cards: 'id, oracle_id, name, type_line, cmc, *color_identity, *keywords, legalities.commander',
  decks: 'id, userId, name, updatedAt',
});

export { db };
