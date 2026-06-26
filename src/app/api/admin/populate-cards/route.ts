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
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, writeBatch, collection, doc } from 'firebase/firestore';

// Initialize Firebase for server-side use
function getServerFirestore() {
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  if (!firebaseConfig.apiKey) {
    return null;
  }

  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  return getFirestore(app);
}

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
  const slim: Record<string, unknown> = {
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
    layout: card.layout || 'normal',
    legalities: { commander: 'legal' },
    set: card.set || '',
    set_name: card.set_name || '',
    rarity: card.rarity || '',
  };

  // Only add optional fields if they exist
  if (card.power !== undefined) slim.power = card.power;
  if (card.toughness !== undefined) slim.toughness = card.toughness;
  if (card.loyalty !== undefined) slim.loyalty = card.loyalty;
  if (card.produced_mana !== undefined) slim.produced_mana = card.produced_mana;

  if (card.image_uris) {
    slim.image_uris = {
      small: card.image_uris.small || '',
      normal: card.image_uris.normal || '',
      large: card.image_uris.large || '',
      art_crop: card.image_uris.art_crop || '',
      border_crop: card.image_uris.border_crop || '',
      png: card.image_uris.png || '',
    };
  }

  if (card.card_faces) {
    slim.card_faces = card.card_faces.map(face => {
      const slimFace: Record<string, unknown> = {
        name: face.name || '',
        mana_cost: face.mana_cost || '',
        type_line: face.type_line || '',
        oracle_text: face.oracle_text || '',
      };

      if (face.power !== undefined) slimFace.power = face.power;
      if (face.toughness !== undefined) slimFace.toughness = face.toughness;

      if (face.image_uris) {
        slimFace.image_uris = {
          small: face.image_uris.small || '',
          normal: face.image_uris.normal || '',
          large: face.image_uris.large || '',
          art_crop: face.image_uris.art_crop || '',
          border_crop: face.image_uris.border_crop || '',
          png: face.image_uris.png || '',
        };
      }

      return slimFace;
    });
  }

  return slim;
}

export async function GET() {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const db = getServerFirestore();
        if (!db) {
          controller.enqueue(encoder.encode('data: {"error": "Firebase not configured - check environment variables"}\n\n'));
          controller.close();
          return;
        }

        // Step 1: Get bulk data URL
        controller.enqueue(encoder.encode('data: {"status": "Fetching Scryfall bulk data list..."}\n\n'));
        
        const bulkResponse = await fetch('https://api.scryfall.com/bulk-data', {
          headers: {
            'User-Agent': 'Undercroft/1.0',
            'Accept': 'application/json',
          },
        });
        
        if (!bulkResponse.ok) {
          const errorText = await bulkResponse.text();
          controller.enqueue(encoder.encode(`data: {"error": "Scryfall API error: ${bulkResponse.status} - ${errorText}"}\n\n`));
          controller.close();
          return;
        }
        
        const bulkData = await bulkResponse.json() as { data: ScryfallBulkData[] };
        
        if (!bulkData || !bulkData.data || !Array.isArray(bulkData.data)) {
          controller.enqueue(encoder.encode(`data: {"error": "Invalid response from Scryfall: ${JSON.stringify(bulkData).substring(0, 200)}"}\n\n`));
          controller.close();
          return;
        }
        
        const defaultCards = bulkData.data.find(d => d.type === 'default_cards');
        
        if (!defaultCards) {
          controller.enqueue(encoder.encode('data: {"error": "Could not find default_cards bulk data"}\n\n'));
          controller.close();
          return;
        }

        controller.enqueue(encoder.encode(`data: {"status": "Streaming and processing ${defaultCards.name}..."}\n\n`));

        // Step 2: Stream, filter, and upload cards in chunks
        const cardsResponse = await fetch(defaultCards.download_uri);
        if (!cardsResponse.body) {
          controller.enqueue(encoder.encode('data: {"error": "No response body from Scryfall"}\n\n'));
          controller.close();
          return;
        }

        const reader = cardsResponse.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let totalProcessed = 0;
        let totalUploaded = 0;
        let batchCards: ScryfallCard[] = [];
        const BATCH_SIZE = 500;
        const cardsCollection = collection(db, 'cards');

        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            // Process any remaining cards in buffer
            if (buffer.trim()) {
              try {
                const card = JSON.parse(buffer) as ScryfallCard;
                if (card.lang === 'en' && 
                    card.layout !== 'token' && 
                    card.layout !== 'art_series' && 
                    card.layout !== 'double_faced_token' &&
                    card.legalities?.commander === 'legal') {
                  batchCards.push(card);
                }
              } catch {}
            }
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;
            
            try {
              const card = JSON.parse(line) as ScryfallCard;
              totalProcessed++;

              // Filter cards
              if (card.lang === 'en' && 
                  card.layout !== 'token' && 
                  card.layout !== 'art_series' && 
                  card.layout !== 'double_faced_token' &&
                  card.legalities?.commander === 'legal') {
                batchCards.push(card);

                // Upload batch when full
                if (batchCards.length >= BATCH_SIZE) {
                  const batch = writeBatch(db);
                  for (const c of batchCards) {
                    const slim = slimCard(c);
                    const docRef = doc(cardsCollection, c.id);
                    batch.set(docRef, slim);
                  }
                  await batch.commit();
                  totalUploaded += batchCards.length;
                  
                  controller.enqueue(encoder.encode(`data: {"progress": ${totalUploaded}, "status": "Uploaded ${totalUploaded.toLocaleString()} cards (processed ${totalProcessed.toLocaleString()})"}\n\n`));
                  
                  batchCards = [];
                  await new Promise(resolve => setTimeout(resolve, 100));
                }
              }
            } catch (err) {
              // Skip invalid JSON lines
            }
          }
        }

        // Upload final batch
        if (batchCards.length > 0) {
          const batch = writeBatch(db);
          for (const c of batchCards) {
            const slim = slimCard(c);
            const docRef = doc(cardsCollection, c.id);
            batch.set(docRef, slim);
          }
          await batch.commit();
          totalUploaded += batchCards.length;
        }

        controller.enqueue(encoder.encode(`data: {"status": "Complete! Uploaded ${totalUploaded.toLocaleString()} cards", "done": true}\n\n`));
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
