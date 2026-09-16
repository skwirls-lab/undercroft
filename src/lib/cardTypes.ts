/**
 * Shape of a Scryfall card as stored in the Firestore `cards` collection.
 *
 * This used to live in `src/lib/db.ts` alongside a Dexie/IndexedDB schema. That schema was
 * write-only — the settings page filled it and nothing ever read it back, because card
 * resolution goes through Firestore (`src/lib/firebase/cards.ts`). The Dexie layer is gone;
 * the type it carried is still the contract for Firestore card documents, so it lives here.
 */
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
