#!/usr/bin/env npx tsx
// ============================================================
// Build Forge Data — Processes Forge card scripts into a JSON lookup
// ============================================================
// Reads all .txt files from the Forge cardsfolder, parses them using
// ForgeCardData, and outputs a single forge-cards.json file for
// runtime use by the game engine.
//
// Usage: npx tsx scripts/build-forge-data.ts
// Output: public/data/forge-cards.json
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import {
  parseForgeScript,
  forgeScriptToEntry,
  type ForgeCardEntry,
} from '../src/engine/ForgeCardData';

const FORGE_CARDSFOLDER = path.resolve(
  __dirname,
  '../../resource/forge-master/forge-gui/res/cardsfolder'
);
const OUTPUT_DIR = path.resolve(__dirname, '../public/data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'forge-cards.json');

interface ForgeCardsLookup {
  version: string;
  generatedAt: string;
  cardCount: number;
  cards: Record<string, ForgeCardEntry>;
}

function collectTxtFiles(dir: string): string[] {
  const results: string[] = [];

  function walk(currentDir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.txt')) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}

function main() {
  console.log('=== Build Forge Card Data ===');
  console.log(`Source: ${FORGE_CARDSFOLDER}`);

  if (!fs.existsSync(FORGE_CARDSFOLDER)) {
    console.error(`ERROR: Forge cardsfolder not found at ${FORGE_CARDSFOLDER}`);
    process.exit(1);
  }

  // Collect all .txt files
  console.log('Collecting card script files...');
  const files = collectTxtFiles(FORGE_CARDSFOLDER);
  console.log(`Found ${files.length} card script files`);

  // Parse each file
  const cards: Record<string, ForgeCardEntry> = {};
  let parsed = 0;
  let skipped = 0;
  let errors = 0;

  for (const filePath of files) {
    try {
      const contents = fs.readFileSync(filePath, 'utf-8');
      const script = parseForgeScript(contents);

      if (!script.name) {
        skipped++;
        continue;
      }

      const entry = forgeScriptToEntry(script);

      // Only include cards that have at least some useful data
      const hasUsefulData =
        entry.effects.length > 0 ||
        entry.keywords.length > 0 ||
        entry.triggers.length > 0 ||
        entry.activatedAbilities.length > 0 ||
        entry.manaAbilities.length > 0;

      if (hasUsefulData) {
        // Normalize name to lowercase for lookup
        const key = script.name.toLowerCase();
        cards[key] = entry;
        parsed++;
      } else {
        skipped++;
      }
    } catch (err) {
      errors++;
      if (errors <= 5) {
        console.warn(`  Error parsing ${path.basename(filePath)}: ${err}`);
      }
    }
  }

  // Write output
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const lookup: ForgeCardsLookup = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    cardCount: parsed,
    cards,
  };

  const json = JSON.stringify(lookup);
  fs.writeFileSync(OUTPUT_FILE, json, 'utf-8');

  const sizeMB = (Buffer.byteLength(json) / 1024 / 1024).toFixed(2);

  console.log('');
  console.log('=== Results ===');
  console.log(`  Parsed:  ${parsed} cards with useful data`);
  console.log(`  Skipped: ${skipped} cards (no useful data or no name)`);
  console.log(`  Errors:  ${errors}`);
  console.log(`  Output:  ${OUTPUT_FILE} (${sizeMB} MB)`);
  console.log('Done!');
}

main();
