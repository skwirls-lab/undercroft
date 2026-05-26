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

// NOTE: This script references deleted engine modules (ForgeCardData).
// The forge-cards.json file is already generated and included in the repo.
// If you need to regenerate this file, restore the ForgeCardData module first.

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
  cards: Record<string, unknown>;
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

  // NOTE: ForgeCardData module has been deleted as part of the engine migration.
  // The forge-cards.json file is already generated and included in the repo.
  // Skipping parsing step — using existing pre-generated data.
  
  console.log('');
  console.log('=== Results ===');
  console.log(`  Using pre-generated forge-cards.json`);
  console.log(`  Output: ${OUTPUT_FILE}`);
  console.log('Done!');
}

main();
