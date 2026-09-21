/**
 * Refresh the Firestore `cards` collection from Scryfall's bulk export.
 *
 * Runs from GitHub Actions on a schedule, authenticated as a Firebase service account.
 * Deliberately NOT a web endpoint: the previous version of this job was
 * `GET /api/admin/populate-cards`, an unauthenticated route that any page on the internet
 * could trigger with an <img> tag, firing ~90k Firestore writes at the project. A scheduled
 * job with a secret held by GitHub has no public surface at all.
 *
 * It writes only cards whose content actually changed, so a weekly run after a set release
 * costs a few thousand writes rather than ninety thousand.
 *
 * Env:
 *   FIREBASE_SERVICE_ACCOUNT  JSON service-account key (GitHub secret)
 *   DRY_RUN                   set to "1" to report what would change and write nothing
 */

import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';

const DRY_RUN = process.env.DRY_RUN === '1';
const BATCH_SIZE = 400; // Firestore hard-caps a batch at 500 writes.

export function slimCard(card) {
  const slim = {
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
    released_at: card.released_at || '',
  };

  if (card.power !== undefined) slim.power = card.power;
  if (card.toughness !== undefined) slim.toughness = card.toughness;
  if (card.loyalty !== undefined) slim.loyalty = card.loyalty;
  if (card.produced_mana !== undefined) slim.produced_mana = card.produced_mana;

  const images = (u) => ({
    small: u.small || '',
    normal: u.normal || '',
    large: u.large || '',
    art_crop: u.art_crop || '',
    border_crop: u.border_crop || '',
    png: u.png || '',
  });

  if (card.image_uris) slim.image_uris = images(card.image_uris);

  if (card.card_faces) {
    slim.card_faces = card.card_faces.map((face) => {
      const f = {
        name: face.name || '',
        mana_cost: face.mana_cost || '',
        type_line: face.type_line || '',
        oracle_text: face.oracle_text || '',
      };
      if (face.power !== undefined) f.power = face.power;
      if (face.toughness !== undefined) f.toughness = face.toughness;
      if (face.image_uris) f.image_uris = images(face.image_uris);
      return f;
    });
  }

  return slim;
}

/**
 * What gets stored: English, commander-legal, and a printing that exists on paper. Digital-only
 * printings (Arena sets such as Alchemy or Through the Omenpaths) carry art nobody has held,
 * and every commander-legal card has a paper printing anyway.
 */
export const isCommanderPlayable = (card) =>
  card.lang === 'en' &&
  card.layout !== 'token' &&
  card.layout !== 'art_series' &&
  card.layout !== 'double_faced_token' &&
  card.legalities?.commander === 'legal' &&
  card.digital !== true &&
  (!Array.isArray(card.games) || card.games.includes('paper'));

/**
 * Which printing of a card the app shows by default: the oldest ordinary paper printing —
 * the art most players know it by. Promos, memorabilia and other odd sets lose to any
 * regular set; among the rest, the earliest release wins. Lower is better.
 */
export function printingRank(card) {
  const oddSet = ['promo', 'memorabilia', 'funny', 'minigame', 'token', 'vanguard'].includes(card.set_type || '');
  const odd = card.promo === true || oddSet || card.full_art === true || card.oversized === true || card.border_color === 'gold';
  return `${odd ? 1 : 0}|${card.released_at || '9999-99-99'}|${card.set || ''}|${card.collector_number || ''}`;
}

/** The id of the preferred printing for every oracle id, from a list of {id, oracle_id, rank}. */
export function choosePreferred(printings) {
  const best = new Map();
  for (const p of printings) {
    const key = p.oracle_id || p.id;
    const cur = best.get(key);
    if (!cur || p.rank < cur.rank) best.set(key, p);
  }
  return new Set([...best.values()].map((p) => p.id));
}

/** Stable digest of a slimmed card, so unchanged cards can be skipped. */
export const digest = (slim) =>
  createHash('sha1').update(JSON.stringify(slim, Object.keys(slim).sort())).digest('hex');

export const SCRYFALL_HEADERS = { 'User-Agent': 'Undercroft/1.0', Accept: 'application/json' };

/**
 * Find the URL of the actual bulk file for a bulk-data entry.
 *
 * The listing normally carries `download_uri` inline, but a run on 2026-09-19 got an entry
 * with a usable `name` and no `download_uri`, so `fetch(undefined)` threw
 * "Failed to parse URL from undefined" — a message that says nothing about which field was
 * missing. Two changes: follow the entry's own `uri` when the inline field is absent (the
 * per-object endpoint is authoritative and always carries it), and when that also fails,
 * name the keys Scryfall actually sent so the next run diagnoses itself instead of needing
 * another round trip.
 *
 * `fetchImpl` is injectable so this is testable without network access.
 */
export async function resolveDownloadUri(entry, fetchImpl = fetch) {
  const pick = (o) => {
    // Scryfall moved from a JSON array (`download_uri`) to JSON Lines (`jsonl_download_uri`,
    // gzip-compressed) in September 2026. Either format is one card per line to us.
    for (const key of ['download_uri', 'jsonl_download_uri']) {
      if (typeof o?.[key] === 'string' && o[key]) return o[key];
    }
    return null;
  };
  const inline = pick(entry);
  if (inline) return inline;

  if (typeof entry?.uri === 'string' && entry.uri) {
    console.log(`  no inline download link; following ${entry.uri}`);
    const res = await fetchImpl(entry.uri, { headers: SCRYFALL_HEADERS });
    if (res.ok) {
      const full = await res.json();
      const followed = pick(full);
      if (followed) return followed;
      throw new Error(
        `No download_uri or jsonl_download_uri at ${entry.uri}. Keys returned: ${Object.keys(full ?? {}).join(', ')}`
      );
    }
    throw new Error(`Could not read ${entry.uri}: ${res.status} ${res.statusText}`);
  }

  throw new Error(
    `Bulk entry "${entry?.name ?? 'unknown'}" has no download link and no uri to follow. ` +
      `Keys present: ${Object.keys(entry ?? {}).join(', ')}`
  );
}

/**
 * The bulk file may arrive gzip-compressed as a file (not as HTTP content-encoding, which
 * fetch would undo by itself). Peek at the first bytes and inflate when they are gzip's.
 */
export async function inflateIfGzip(nodeReadable) {
  const first = await new Promise((resolve, reject) => {
    const tryRead = () => {
      const chunk = nodeReadable.read();
      if (chunk !== null) resolve(chunk);
      else nodeReadable.once('readable', tryRead);
    };
    nodeReadable.once('error', reject);
    nodeReadable.once('end', () => resolve(Buffer.alloc(0)));
    tryRead();
  });
  if (first.length) nodeReadable.unshift(first);
  const gz = first.length >= 2 && first[0] === 0x1f && first[1] === 0x8b;
  return gz ? nodeReadable.pipe(createGunzip()) : nodeReadable;
}

async function main() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');

  // Imported here rather than at module scope so the pure helpers above stay importable by
  // the tests without firebase-admin installed. The workflow installs it just for this run.
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');

  initializeApp({ credential: cert(JSON.parse(raw)) });
  const db = getFirestore();
  const cards = db.collection('cards');

  console.log('Reading existing card fingerprints from Firestore…');
  const existing = new Map();
  let cursor = null;
  for (;;) {
    let q = cards.orderBy('__name__').limit(5000);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) existing.set(doc.id, doc.get('_digest') ?? null);
    cursor = snap.docs[snap.docs.length - 1];
    process.stdout.write(`\r  ${existing.size.toLocaleString()} known`);
  }
  console.log(`\r  ${existing.size.toLocaleString()} cards already in Firestore`);

  console.log('Locating Scryfall bulk export…');
  const bulkRes = await fetch('https://api.scryfall.com/bulk-data', { headers: SCRYFALL_HEADERS });
  if (!bulkRes.ok) throw new Error(`Scryfall bulk-data listing failed: ${bulkRes.status}`);
  const bulk = await bulkRes.json();
  if (!Array.isArray(bulk?.data)) {
    throw new Error(`Unexpected bulk-data listing shape; top-level keys: ${Object.keys(bulk ?? {}).join(', ')}`);
  }
  const defaultCards = bulk.data.find((d) => d.type === 'default_cards');
  if (!defaultCards) {
    const types = bulk.data.map((d) => d.type).join(', ');
    throw new Error(`No default_cards export in the Scryfall listing. Types offered: ${types}`);
  }

  const downloadUri = await resolveDownloadUri(defaultCards);

  console.log(`Streaming ${defaultCards.name}…`);
  const res = await fetch(downloadUri, { headers: SCRYFALL_HEADERS });
  if (!res.ok) throw new Error(`Bulk file download failed: ${res.status} ${res.statusText}`);
  if (!res.body) throw new Error('No response body from Scryfall');

  let batch = db.batch();
  let pending = 0;
  let seen = 0;
  let written = 0;
  let unchanged = 0;
  const present = new Set();

  const flush = async () => {
    if (pending === 0) return;
    if (!DRY_RUN) await batch.commit();
    batch = db.batch();
    pending = 0;
  };

  // The export is a JSON array, one object per line. Parsing line-by-line keeps a ~2GB file
  // from ever being resident; the slimmed records (a few hundred bytes each) are kept, since
  // the preferred printing of a card is only known once every printing has been seen.
  const slims = [];
  const ranks = [];
  const lines = createInterface({ input: await inflateIfGzip(Readable.fromWeb(res.body)), crlfDelay: Infinity });
  for await (const line of lines) {
    const trimmed = line.trim().replace(/,$/, '');
    if (!trimmed.startsWith('{')) continue;

    let card;
    try {
      card = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!isCommanderPlayable(card)) continue;

    seen++;
    present.add(card.id);
    slims.push(slimCard(card));
    ranks.push({ id: card.id, oracle_id: card.oracle_id, rank: printingRank(card) });
    if (seen % 10000 === 0) process.stdout.write(`\r  ${seen.toLocaleString()} scanned`);
  }

  const preferred = choosePreferred(ranks);
  console.log(`\r  ${seen.toLocaleString()} printings scanned; ${preferred.size.toLocaleString()} preferred (oldest ordinary paper printing per card)`);

  for (const slim of slims) {
    slim.preferred = preferred.has(slim.id);
    const d = digest(slim);
    if (existing.get(slim.id) === d) {
      unchanged++;
      continue;
    }
    batch.set(cards.doc(slim.id), { ...slim, _digest: d });
    written++;
    if (++pending >= BATCH_SIZE) await flush();
  }
  await flush();

  console.log(
    `\n${DRY_RUN ? '[dry run] ' : ''}Done. ${seen.toLocaleString()} commander-legal cards; ` +
      `${written.toLocaleString()} written, ${unchanged.toLocaleString()} unchanged.`
  );

  // Cards that vanish from Scryfall are left in place on purpose. A decklist referencing one
  // should keep resolving, and a truncated download must never be able to delete the
  // collection. Removals are a deliberate, manual act.
  const missing = [...existing.keys()].filter((id) => !present.has(id));
  if (missing.length) {
    console.log(`${missing.length.toLocaleString()} cards in Firestore are no longer in the export (left untouched).`);
  }

  if (seen < 20000) {
    throw new Error(`Only ${seen} cards seen — the export looks truncated. Failing so this is visible.`);
  }
}

// Only run when invoked directly, so the pure helpers above can be imported by tests.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
