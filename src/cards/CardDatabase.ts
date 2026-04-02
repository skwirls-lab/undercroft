import { db, type ScryfallCardRecord } from '@/lib/db';

const BATCH_SIZE = 5000;

export interface CardSearchQuery {
  name?: string;
  typeLine?: string;
  colorIdentity?: string[];
  maxCmc?: number;
  minCmc?: number;
  keywords?: string[];
  commanderLegal?: boolean;
  limit?: number;
}

export class CardDatabase {
  private static instance: CardDatabase;
  private loaded = false;
  private loading = false;

  static getInstance(): CardDatabase {
    if (!CardDatabase.instance) {
      CardDatabase.instance = new CardDatabase();
    }
    return CardDatabase.instance;
  }

  async isLoaded(): Promise<boolean> {
    const count = await db.cards.count();
    this.loaded = count > 0;
    return this.loaded;
  }

  async getCardCount(): Promise<number> {
    return db.cards.count();
  }

  async loadFromJson(
    jsonUrl: string,
    onProgress?: (loaded: number, total: number) => void
  ): Promise<void> {
    if (this.loading) return;
    this.loading = true;

    try {
      const response = await fetch(jsonUrl);
      const data: unknown[] = await response.json();

      // Filter to only commander-legal, non-token, English cards
      const cards = (data as Record<string, unknown>[]).filter((card) => {
        if (card.lang !== 'en') return false;
        if (card.layout === 'token' || card.layout === 'art_series') return false;
        const legalities = card.legalities as Record<string, string> | undefined;
        if (!legalities || legalities.commander !== 'legal') return false;
        return true;
      });

      const total = cards.length;

      // Clear existing data
      await db.cards.clear();

      // Insert in batches
      for (let i = 0; i < cards.length; i += BATCH_SIZE) {
        const batch = cards.slice(i, i + BATCH_SIZE).map(mapScryfallCard);
        await db.cards.bulkPut(batch);
        onProgress?.(Math.min(i + BATCH_SIZE, total), total);
      }

      this.loaded = true;
    } finally {
      this.loading = false;
    }
  }

  /**
   * Stream-load cards from the /api/cards/bulk NDJSON endpoint.
   * Each line is a JSON card object. First line is metadata, last line is done marker.
   * Cards are batch-inserted into IndexedDB as they arrive.
   */
  async loadFromStream(
    url: string,
    onProgress?: (loaded: number, estimated: number) => void,
    onStatus?: (status: string) => void,
  ): Promise<number> {
    if (this.loading) return 0;
    this.loading = true;

    try {
      onStatus?.('Connecting...');
      const response = await fetch(url);
      if (!response.ok || !response.body) {
        throw new Error(`Failed to fetch card data: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let batch: ScryfallCardRecord[] = [];
      let totalLoaded = 0;
      let estimatedTotal = 112000; // rough estimate, updated from metadata
      let cleared = false;

      onStatus?.('Receiving card data...');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const obj = JSON.parse(trimmed);

            // Metadata line
            if (obj._meta) {
              estimatedTotal = obj.totalLines || estimatedTotal;
              continue;
            }

            // Done marker
            if (obj._done) {
              estimatedTotal = obj.total || totalLoaded;
              continue;
            }

            // Clear existing data on first real card
            if (!cleared) {
              onStatus?.('Clearing old data...');
              await db.cards.clear();
              cleared = true;
              onStatus?.('Loading cards...');
            }

            // Map directly — the API already sends slim ScryfallCardRecord-shaped objects
            batch.push(obj as ScryfallCardRecord);
            totalLoaded++;

            // Flush batch
            if (batch.length >= BATCH_SIZE) {
              await db.cards.bulkPut(batch);
              batch = [];
              onProgress?.(totalLoaded, estimatedTotal);
            }
          } catch {
            // skip malformed lines
          }
        }
      }

      // Flush remaining
      if (batch.length > 0) {
        await db.cards.bulkPut(batch);
        onProgress?.(totalLoaded, estimatedTotal);
      }

      this.loaded = true;
      onStatus?.(`Loaded ${totalLoaded.toLocaleString()} cards`);
      return totalLoaded;
    } finally {
      this.loading = false;
    }
  }

  async getByName(name: string): Promise<ScryfallCardRecord | null> {
    const result = await db.cards
      .where('name')
      .equalsIgnoreCase(name)
      .first();
    return result || null;
  }

  async searchByName(query: string, limit = 20): Promise<ScryfallCardRecord[]> {
    if (!query || query.length < 2) return [];

    const lowerQuery = query.toLowerCase();
    return db.cards
      .filter((card) => card.name.toLowerCase().includes(lowerQuery))
      .limit(limit)
      .toArray();
  }

  async searchCards(query: CardSearchQuery): Promise<ScryfallCardRecord[]> {
    let collection = db.cards.toCollection();

    if (query.name) {
      const lowerName = query.name.toLowerCase();
      collection = db.cards.filter((card) =>
        card.name.toLowerCase().includes(lowerName)
      );
    }

    let results = await collection.toArray();

    if (query.typeLine) {
      const lower = query.typeLine.toLowerCase();
      results = results.filter((c) =>
        c.type_line.toLowerCase().includes(lower)
      );
    }

    if (query.colorIdentity && query.colorIdentity.length > 0) {
      results = results.filter((c) =>
        c.color_identity.every((ci) => query.colorIdentity!.includes(ci))
      );
    }

    if (query.maxCmc !== undefined) {
      results = results.filter((c) => c.cmc <= query.maxCmc!);
    }

    if (query.minCmc !== undefined) {
      results = results.filter((c) => c.cmc >= query.minCmc!);
    }

    if (query.commanderLegal) {
      results = results.filter(
        (c) => c.legalities.commander === 'legal'
      );
    }

    return results.slice(0, query.limit || 50);
  }

  /**
   * Resolve a list of card names to ScryfallCardRecords.
   * Returns a map of name → ScryfallCardRecord (or null if not found).
   */
  async resolveCardNames(names: string[]): Promise<Map<string, ScryfallCardRecord | null>> {
    const results = new Map<string, ScryfallCardRecord | null>();
    const uniqueNames = [...new Set(names)];

    // Batch-resolve: try exact match first, then case-insensitive
    for (const name of uniqueNames) {
      const card = await this.getByName(name);
      results.set(name, card);
    }

    return results;
  }

  async getCommanders(limit = 50): Promise<ScryfallCardRecord[]> {
    return db.cards
      .filter(
        (card) =>
          card.type_line.toLowerCase().includes('legendary') &&
          card.type_line.toLowerCase().includes('creature') &&
          card.legalities.commander === 'legal'
      )
      .limit(limit)
      .toArray();
  }
}

function mapScryfallCard(raw: Record<string, unknown>): ScryfallCardRecord {
  const imageUris = raw.image_uris as Record<string, string> | undefined;
  const cardFaces = raw.card_faces as Array<Record<string, unknown>> | undefined;

  return {
    id: raw.id as string,
    oracle_id: (raw.oracle_id as string) || '',
    name: raw.name as string,
    mana_cost: (raw.mana_cost as string) || '',
    cmc: (raw.cmc as number) || 0,
    type_line: (raw.type_line as string) || '',
    oracle_text: (raw.oracle_text as string) || '',
    colors: (raw.colors as string[]) || [],
    color_identity: (raw.color_identity as string[]) || [],
    keywords: (raw.keywords as string[]) || [],
    power: raw.power as string | undefined,
    toughness: raw.toughness as string | undefined,
    loyalty: raw.loyalty as string | undefined,
    produced_mana: raw.produced_mana as string[] | undefined,
    layout: (raw.layout as string) || 'normal',
    image_uris: imageUris
      ? {
          small: imageUris.small || '',
          normal: imageUris.normal || '',
          large: imageUris.large || '',
          art_crop: imageUris.art_crop || '',
          border_crop: imageUris.border_crop || '',
          png: imageUris.png || '',
        }
      : undefined,
    card_faces: cardFaces?.map((face) => {
      const faceImages = face.image_uris as Record<string, string> | undefined;
      return {
        name: (face.name as string) || '',
        mana_cost: (face.mana_cost as string) || '',
        type_line: (face.type_line as string) || '',
        oracle_text: (face.oracle_text as string) || '',
        power: face.power as string | undefined,
        toughness: face.toughness as string | undefined,
        image_uris: faceImages
          ? {
              small: faceImages.small || '',
              normal: faceImages.normal || '',
              large: faceImages.large || '',
              art_crop: faceImages.art_crop || '',
              border_crop: faceImages.border_crop || '',
              png: faceImages.png || '',
            }
          : undefined,
      };
    }),
    legalities: (raw.legalities as Record<string, string>) || {},
    set: (raw.set as string) || '',
    set_name: (raw.set_name as string) || '',
    rarity: (raw.rarity as string) || '',
  };
}

export function scryfallToCardData(card: ScryfallCardRecord): import('@/engine/types').CardData {
  return {
    scryfallId: card.id,
    oracleId: card.oracle_id,
    name: card.name,
    manaCost: card.mana_cost,
    cmc: card.cmc,
    typeLine: card.type_line,
    oracleText: card.oracle_text,
    colors: card.colors as import('@/engine/types').ManaColor[],
    colorIdentity: card.color_identity as import('@/engine/types').ManaColor[],
    keywords: card.keywords,
    power: card.power,
    toughness: card.toughness,
    loyalty: card.loyalty,
    producedMana: card.produced_mana,
    layout: card.layout,
    imageUris: card.image_uris
      ? {
          small: card.image_uris.small,
          normal: card.image_uris.normal,
          large: card.image_uris.large,
          artCrop: card.image_uris.art_crop,
          borderCrop: card.image_uris.border_crop,
          png: card.image_uris.png,
        }
      : undefined,
    cardFaces: card.card_faces?.map((face) => ({
      name: face.name,
      manaCost: face.mana_cost,
      typeLine: face.type_line,
      oracleText: face.oracle_text,
      power: face.power,
      toughness: face.toughness,
      imageUris: face.image_uris
        ? {
            small: face.image_uris.small,
            normal: face.image_uris.normal,
            large: face.image_uris.large,
            artCrop: face.image_uris.art_crop,
            borderCrop: face.image_uris.border_crop,
            png: face.image_uris.png,
          }
        : undefined,
    })),
    legalities: card.legalities,
  } satisfies import('@/engine/types').CardData;
}
