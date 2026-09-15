#!/usr/bin/env node
/**
 * Protocol conformance check between the Forge bridge server and this client.
 *
 * The bridge blocks the Forge engine thread on a CompletableFuture and, on any unusable
 * answer, falls back to `response.has("key") ? ... : <default>`. That makes three different
 * failures indistinguishable from a real player decision:
 *
 *   1. the server sends a choiceType the client has no renderer for
 *   2. the client renders a prompt but replies under a key the server never reads
 *   3. the client handles a choiceType the server never sends (dead code)
 *
 * All three silently no-op a card mechanic. This check catches all three statically.
 *
 * KNOWN LIMITATION: response keys are compared as sets, not per choiceType. Several types
 * share one renderer (CardSelectPanel) and pick their key with a ternary, so a type that sends
 * a key belonging to a *sibling* type is not detected — this is exactly the bug that made every
 * tutor return card #0 (choose_single_card_zone sent `entityId`; the server reads `selectedIds`).
 * Adding a new choiceType to a shared branch therefore still needs the key checked by hand.
 *
 * Usage:
 *   node scripts/check-protocol.mjs [path-to-undercroft-forge-server]
 *
 * The server path may also be given via FORGE_SERVER_PATH. If the server repo is not
 * available the check exits 0 with a notice, so it is safe to run in a client-only CI job.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const serverRoot =
  process.argv[2] ||
  process.env.FORGE_SERVER_PATH ||
  resolve(process.cwd(), '..', 'undercroft-forge-server');

const controllerPath = join(
  serverRoot,
  'forge-server/src/main/java/undercroft/server/BridgePlayerController.java'
);
const overlayPath = resolve(process.cwd(), 'src/components/game/ForgeChoiceOverlay.tsx');

if (!existsSync(controllerPath)) {
  console.log(`[check-protocol] SKIPPED — bridge server not found at ${serverRoot}`);
  console.log('[check-protocol] Pass the path as an argument or set FORGE_SERVER_PATH.');
  process.exit(0);
}
if (!existsSync(overlayPath)) {
  console.error(`[check-protocol] FAIL — client overlay not found at ${overlayPath}`);
  process.exit(1);
}

const javaSrc = readFileSync(controllerPath, 'utf8');
const tsxSrc = readFileSync(overlayPath, 'utf8');

// --- 1. What the server sends, and which response keys it reads for each ---------------
// For each requestChoice("type", ...) call, scan forward to the end of the enclosing method
// (a line that is exactly four spaces + "}") and collect every response key it reads.
const javaLines = javaSrc.split('\n');
const serverTypes = new Map(); // choiceType -> Set(responseKey)

for (let i = 0; i < javaLines.length; i++) {
  const call = javaLines[i].match(/requestChoice\("([a-z_]+)"/);
  if (!call) continue;
  const type = call[1];
  if (!serverTypes.has(type)) serverTypes.set(type, new Set());
  const keys = serverTypes.get(type);
  for (let j = i + 1; j < javaLines.length; j++) {
    if (/^ {4}}/.test(javaLines[j])) break; // end of method
    for (const m of javaLines[j].matchAll(
      /response\.(?:has|get|getAsJsonArray|getAsJsonObject)\("([A-Za-z_]+)"\)/g
    )) {
      keys.add(m[1]);
    }
  }
}

// --- 2. What the client renders, and which keys it replies with ------------------------
const clientTypes = new Set();
for (const m of tsxSrc.matchAll(/choiceType === '([a-z_]+)'/g)) clientTypes.add(m[1]);
for (const m of tsxSrc.matchAll(/'([a-z_]+)'(?=[^\n]*\]\.includes\(choiceType\))/g)) {
  clientTypes.add(m[1]);
}
// Types listed inside a multi-line `[...].includes(choiceType)` array
for (const block of tsxSrc.matchAll(/\[([^\]]*?)\]\.includes\(choiceType\)/gs)) {
  for (const m of block[1].matchAll(/'([a-z_]+)'/g)) clientTypes.add(m[1]);
}

const clientKeys = new Set();
// responseKey may be a plain literal, a ternary over several literals, or a variable that was
// assigned from a ternary — collect every quoted string on any line that mentions either.
for (const line of tsxSrc.split('\n')) {
  if (!/responseKey|ResponseKey/.test(line)) continue;
  for (const m of line.matchAll(/['"]([A-Za-z_]+)['"]/g)) clientKeys.add(m[1]);
}
// Keys sent directly in an onRespond payload, e.g. onRespond(id, { value }) or { result: true }.
for (const m of tsxSrc.matchAll(/onRespond\([^,]+,\s*\{([^}]*)\}/gs)) {
  for (const k of m[1].matchAll(/([A-Za-z_]+)\s*[:,}]/g)) clientKeys.add(k[1]);
  for (const k of m[1].matchAll(/\b([A-Za-z_]+)\s*$/g)) clientKeys.add(k[1]);
}
// Payloads built in a helper that returns an object literal.
for (const m of tsxSrc.matchAll(/\{\s*([A-Za-z_]+):\s*[^}]+\}/g)) clientKeys.add(m[1]);

// --- 3. Report -------------------------------------------------------------------------
const problems = [];

const unhandled = [...serverTypes.keys()].filter((t) => !clientTypes.has(t)).sort();
if (unhandled.length) {
  problems.push(
    `Server sends ${unhandled.length} choiceType(s) the client cannot render — each falls ` +
      `through to the generic panel and lets the engine apply a silent default:\n` +
      unhandled.map((t) => `    - ${t}  (server reads: ${[...serverTypes.get(t)].join(', ') || 'n/a'})`).join('\n')
  );
}

const orphaned = [...clientTypes].filter((t) => !serverTypes.has(t)).sort();
if (orphaned.length) {
  problems.push(
    `Client handles ${orphaned.length} choiceType(s) the server never sends (dead UI):\n` +
      orphaned.map((t) => `    - ${t}`).join('\n')
  );
}

// Key coverage: for every type both sides know about, the client must be able to produce at
// least one of the keys the server reads.
const keyMismatches = [];
for (const [type, keys] of serverTypes) {
  if (!clientTypes.has(type) || keys.size === 0) continue;
  if (![...keys].some((k) => clientKeys.has(k))) {
    keyMismatches.push(`    - ${type}: server reads [${[...keys].join(', ')}], client never sends any of them`);
  }
}
if (keyMismatches.length) {
  problems.push(
    `Response-key mismatch — the prompt renders, the player chooses, and the answer is ` +
      `discarded:\n` + keyMismatches.join('\n')
  );
}

console.log(
  `[check-protocol] server choiceTypes: ${serverTypes.size}, client renderers: ${clientTypes.size}`
);

if (problems.length) {
  console.error('\n[check-protocol] FAILED\n');
  for (const p of problems) console.error('  ' + p + '\n');
  process.exit(1);
}

console.log('[check-protocol] OK — every server prompt has a renderer and a matching response key.');
