/**
 * Utilities for verifying card names against the Forge game engine's database.
 *
 * During deck import, cards are resolved in Scryfall/Firebase first, then checked
 * against Forge. If a card exists in Scryfall but NOT in Forge (e.g., a reprint with
 * a new name like "Vivi's Thunder Magic" → "Lightning Bolt"), we use the oracle_id
 * to find a Forge-compatible equivalent.
 */

import { FORGE_SERVER_URL } from '@/lib/forgeConfig';

/** Base URL for Forge REST endpoints (derived from the WebSocket URL) */
function getForgeApiBase(): string {
  return FORGE_SERVER_URL
    .replace('wss://', 'https://')
    .replace('ws://', 'http://')
    .replace('/game', '');
}

/**
 * Check which card names exist in Forge's database.
 * Returns { found: string[], notFound: string[] }.
 */
export async function checkCardsInForge(
  cardNames: string[]
): Promise<{ found: string[]; notFound: string[] }> {
  try {
    const response = await fetch(`${getForgeApiBase()}/api/check-cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardNames }),
    });

    if (!response.ok) {
      console.error('[ForgeCheck] Server returned', response.status);
      // If the server is down, treat all as "found" to avoid blocking import
      return { found: cardNames, notFound: [] };
    }

    return await response.json();
  } catch (err) {
    console.error('[ForgeCheck] Failed to reach Forge server:', err);
    // Graceful fallback — don't block import if server is unreachable
    return { found: cardNames, notFound: [] };
  }
}

/**
 * For a card that exists in Scryfall but not in Forge, try to find an equivalent
 * card name that Forge recognizes by using the oracle_id.
 *
 * Flow:
 *   1. Use the oracle_id (from the Scryfall data we already have) to find all
 *      printings of functionally identical cards via Scryfall API.
 *   2. Collect all unique names from those printings.
 *   3. Check each against Forge.
 *   4. Return the first match, or null if none found.
 */
export async function findForgeEquivalent(
  cardName: string,
  oracleId: string
): Promise<string | null> {
  try {
    // Query Scryfall for all cards with the same oracle_id
    const url = `https://api.scryfall.com/cards/search?q=oracleid%3A${oracleId}&unique=cards&order=released&dir=asc`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Undercroft/1.0' },
    });

    if (!response.ok) {
      console.warn(`[ForgeCheck] Scryfall oracle search failed for ${cardName}`);
      return null;
    }

    const data = await response.json();
    if (!data.data || data.data.length === 0) return null;

    // Collect unique card names (excluding the one we already know doesn't work)
    const alternativeNames = [
      ...new Set(
        (data.data as Array<{ name: string }>)
          .map((c) => c.name)
          .filter((n) => n !== cardName)
      ),
    ];

    if (alternativeNames.length === 0) return null;

    // Check these alternatives against Forge
    const { found } = await checkCardsInForge(alternativeNames);
    return found.length > 0 ? found[0] : null;
  } catch (err) {
    console.error(`[ForgeCheck] Error finding equivalent for ${cardName}:`, err);
    return null;
  }
}

export interface ForgeResolutionResult {
  /** Cards that exist in Forge as-is */
  direct: string[];
  /** Cards that needed a name substitution: { original → forgeName } */
  substituted: Map<string, string>;
  /** Cards that couldn't be found in Forge at all */
  unresolvable: string[];
}

/**
 * Full Forge resolution pipeline for a set of cards.
 *
 * @param cards Array of { cardName, oracleId } — oracleId comes from the Scryfall data
 *              already resolved during import.
 */
export async function resolveCardsForForge(
  cards: Array<{ cardName: string; oracleId?: string }>
): Promise<ForgeResolutionResult> {
  const uniqueNames = [...new Set(cards.map((c) => c.cardName))];
  const result: ForgeResolutionResult = {
    direct: [],
    substituted: new Map(),
    unresolvable: [],
  };

  // Step 1: Batch-check all names against Forge
  const { found, notFound } = await checkCardsInForge(uniqueNames);
  result.direct = found;

  if (notFound.length === 0) return result;

  // Step 2: For each missing card, try to find a Forge equivalent via oracle_id
  for (const missingName of notFound) {
    const cardInfo = cards.find((c) => c.cardName === missingName);
    const oracleId = cardInfo?.oracleId;

    if (!oracleId) {
      result.unresolvable.push(missingName);
      continue;
    }

    const equivalent = await findForgeEquivalent(missingName, oracleId);
    if (equivalent) {
      result.substituted.set(missingName, equivalent);
    } else {
      result.unresolvable.push(missingName);
    }

    // Rate-limit Scryfall API calls (100ms between requests)
    await new Promise((r) => setTimeout(r, 100));
  }

  return result;
}
