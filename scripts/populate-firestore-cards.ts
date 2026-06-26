/**
 * One-time script to populate Firestore with Scryfall card data
 * Run with: npx tsx scripts/populate-firestore-cards.ts
 * 
 * This script:
 * 1. Fetches the latest Scryfall bulk data
 * 2. Filters to Commander-legal, English, non-token cards
 * 3. Uploads them to Firestore in batches
 * 
 * Note: Firestore has a limit of 500 writes per batch, and rate limits.
 * This script will take a while to run (~20-30 minutes for ~25k cards).
 */

import { initializeApp, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as https from 'https';

// Initialize Firebase Admin
// You'll need to download your service account key from Firebase Console
// and save it as firebase-admin-key.json in the project root
const serviceAccount = require('../firebase-admin-key.json') as ServiceAccount;

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

interface ScryfallBulkData {
  object: string;
  id: string;
  type: string;
  updated_at: string;
  uri: string;
  name: string;
  description: string;
  size: number;
  download_uri: string;
  content_type: string;
  content_encoding: string;
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

async function fetchJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

async function getBulkDataUrl(): Promise<string> {
  console.log('Fetching Scryfall bulk data list...');
  const bulkData = await fetchJson('https://api.scryfall.com/bulk-data') as { data: ScryfallBulkData[] };
  const defaultCards = bulkData.data.find(d => d.type === 'default_cards');
  
  if (!defaultCards) {
    throw new Error('Could not find default_cards bulk data');
  }
  
  console.log(`Found bulk data: ${defaultCards.name}`);
  console.log(`Size: ${(defaultCards.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Updated: ${defaultCards.updated_at}`);
  
  return defaultCards.download_uri;
}

async function downloadAndFilterCards(url: string): Promise<ScryfallCard[]> {
  console.log('Downloading card data...');
  const allCards = await fetchJson(url) as ScryfallCard[];
  
  console.log(`Downloaded ${allCards.length.toLocaleString()} cards`);
  console.log('Filtering to Commander-legal, English, non-token cards...');
  
  const filtered = allCards.filter(card => {
    if (card.lang !== 'en') return false;
    if (card.layout === 'token' || card.layout === 'art_series' || card.layout === 'double_faced_token') return false;
    if (!card.legalities || card.legalities.commander !== 'legal') return false;
    return true;
  });
  
  console.log(`Filtered to ${filtered.length.toLocaleString()} cards`);
  return filtered;
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

async function uploadToFirestore(cards: ScryfallCard[]): Promise<void> {
  const BATCH_SIZE = 500; // Firestore limit
  const DELAY_MS = 1000; // Delay between batches to avoid rate limits
  
  console.log(`Uploading ${cards.length.toLocaleString()} cards to Firestore...`);
  console.log(`This will take approximately ${Math.ceil(cards.length / BATCH_SIZE * DELAY_MS / 1000 / 60)} minutes`);
  
  const cardsCollection = db.collection('cards');
  
  for (let i = 0; i < cards.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = cards.slice(i, i + BATCH_SIZE);
    
    for (const card of chunk) {
      const slim = slimCard(card);
      const docRef = cardsCollection.doc(card.id);
      batch.set(docRef, slim);
    }
    
    await batch.commit();
    
    const progress = Math.min(i + BATCH_SIZE, cards.length);
    const percent = ((progress / cards.length) * 100).toFixed(1);
    console.log(`Uploaded ${progress.toLocaleString()} / ${cards.length.toLocaleString()} (${percent}%)`);
    
    // Delay to avoid rate limits
    if (i + BATCH_SIZE < cards.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }
  
  console.log('Upload complete!');
}

async function createIndexes(): Promise<void> {
  console.log('\nCreating Firestore indexes...');
  console.log('You need to manually create these indexes in the Firebase Console:');
  console.log('1. Collection: cards, Fields: name (Ascending), __name__ (Ascending)');
  console.log('2. Collection: cards, Fields: type_line (Ascending), __name__ (Ascending)');
  console.log('3. Collection: cards, Fields: cmc (Ascending), __name__ (Ascending)');
  console.log('\nOr use the Firebase CLI to deploy firestore.indexes.json');
}

async function main() {
  try {
    const url = await getBulkDataUrl();
    const cards = await downloadAndFilterCards(url);
    await uploadToFirestore(cards);
    await createIndexes();
    
    console.log('\n✅ Done! Card data is now available in Firestore.');
    console.log('All users can now access card data without manual import.');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
