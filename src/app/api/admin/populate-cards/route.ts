/**
 * Admin API endpoint to populate Firestore with Scryfall card data
 * 
 * Usage: Visit /api/admin/populate-cards in your browser
 * This will fetch Scryfall data and upload it to Firestore
 * 
 * Note: This is a one-time operation that takes ~20-30 minutes
 * You can monitor progress in the browser
 */

import { NextResponse } from 'next/server';
import { getFirebaseDb } from '@/lib/firebase/config';
import { writeBatch, collection, doc } from 'firebase/firestore';

interface ScryfallCard {
  id: string;
  oracle_id?: string;
  name: string;
  lang: string;
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  color_identity?: string[];
  keywords?: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
  produced_mana?: string[];
  layout?: string;
  image_uris?: {
    small?: string;
    normal?: string;
    large?: string;
    art_crop?: string;
    border_crop?: string;
    png?: string;
  };
  card_faces?: Array<{
    name?: string;
    mana_cost?: string;
    type_line?: string;
    oracle_text?: string;
    power?: string;
    toughness?: string;
    image_uris?: {
      small?: string;
      normal?: string;
      large?: string;
      art_crop?: string;
      border_crop?: string;
      png?: string;
    };
  }>;
  legalities?: Record<string, string>;
  set?: string;
  set_name?: string;
  rarity?: string;
}

interface ScryfallBulkData {
  object: string;
  id: string;
  type: string;
  download_uri: string;
  name: string;
}

function slimCard(card: ScryfallCard) {
  return {
    id: card.id,
    oracle_id: card.oracle_id || '',
    name: card.name,
    mana_cost: card.mana_cost || '',
    cmc: card.cmc || 0,
    type_line: card.type_line || '',
    oracle_text: card.oracle_text || '',
    colors: card.colors || [],
    color_identity: card.color_identity || [],
    keywords: card.keywords || [],
    power: card.power,
    toughness: card.toughness,
    loyalty: card.loyalty,
    produced_mana: card.produced_mana,
    layout: card.layout || 'normal',
    image_uris: card.image_uris ? {
      small: card.image_uris.small || '',
      normal: card.image_uris.normal || '',
      large: card.image_uris.large || '',
      art_crop: card.image_uris.art_crop || '',
      border_crop: card.image_uris.border_crop || '',
      png: card.image_uris.png || '',
    } : undefined,
    card_faces: card.card_faces?.map(face => ({
      name: face.name || '',
      mana_cost: face.mana_cost || '',
      type_line: face.type_line || '',
      oracle_text: face.oracle_text || '',
      power: face.power,
      toughness: face.toughness,
      image_uris: face.image_uris ? {
        small: face.image_uris.small || '',
        normal: face.image_uris.normal || '',
        large: face.image_uris.large || '',
        art_crop: face.image_uris.art_crop || '',
        border_crop: face.image_uris.border_crop || '',
        png: face.image_uris.png || '',
      } : undefined,
    })),
    legalities: { commander: 'legal' },
    set: card.set || '',
    set_name: card.set_name || '',
    rarity: card.rarity || '',
  };
}

export async function GET() {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const db = getFirebaseDb();
        if (!db) {
          controller.enqueue(encoder.encode('data: {"error": "Firebase not configured"}\n\n'));
          controller.close();
          return;
        }

        // Step 1: Get bulk data URL
        controller.enqueue(encoder.encode('data: {"status": "Fetching Scryfall bulk data list..."}\n\n'));
        
        const bulkResponse = await fetch('https://api.scryfall.com/bulk-data');
        const bulkData = await bulkResponse.json() as { data: ScryfallBulkData[] };
        const defaultCards = bulkData.data.find(d => d.type === 'default_cards');
        
        if (!defaultCards) {
          controller.enqueue(encoder.encode('data: {"error": "Could not find default_cards bulk data"}\n\n'));
          controller.close();
          return;
        }

        controller.enqueue(encoder.encode(`data: {"status": "Downloading ${defaultCards.name}..."}\n\n`));

        // Step 2: Download and filter cards
        const cardsResponse = await fetch(defaultCards.download_uri);
        const allCards = await cardsResponse.json() as ScryfallCard[];
        
        controller.enqueue(encoder.encode(`data: {"status": "Downloaded ${allCards.length.toLocaleString()} cards, filtering..."}\n\n`));

        const filtered = allCards.filter(card => {
          if (card.lang !== 'en') return false;
          if (card.layout === 'token' || card.layout === 'art_series' || card.layout === 'double_faced_token') return false;
          if (!card.legalities || card.legalities.commander !== 'legal') return false;
          return true;
        });

        controller.enqueue(encoder.encode(`data: {"status": "Filtered to ${filtered.length.toLocaleString()} Commander-legal cards"}\n\n`));

        // Step 3: Upload to Firestore in batches
        const BATCH_SIZE = 500; // Firestore batch limit
        const cardsCollection = collection(db, 'cards');
        let uploaded = 0;

        for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
          const batch = writeBatch(db);
          const chunk = filtered.slice(i, i + BATCH_SIZE);

          for (const card of chunk) {
            const slim = slimCard(card);
            const docRef = doc(cardsCollection, card.id);
            batch.set(docRef, slim);
          }

          await batch.commit();
          uploaded += chunk.length;

          const percent = ((uploaded / filtered.length) * 100).toFixed(1);
          controller.enqueue(encoder.encode(`data: {"progress": ${uploaded}, "total": ${filtered.length}, "percent": ${percent}}\n\n`));

          // Small delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        controller.enqueue(encoder.encode(`data: {"status": "Complete! Uploaded ${uploaded.toLocaleString()} cards", "done": true}\n\n`));
        controller.close();

      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        controller.enqueue(encoder.encode(`data: {"error": "${message}"}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
