/**
 * Turning what the stores hold into what the Archivist reads. Pure functions over the
 * client's own types, so the serialisation can be tested without a browser: a deck with its
 * card records, the adapted game state with the legal actions, and the event log.
 *
 * Opponents' hands are never included; only their size. Card text on opponents' permanents is
 * left out entirely, since names are enough for the model and it is the largest thing to trim.
 */

import type { ScryfallCardRecord } from '@/lib/cardTypes';
import type { DeckEntry } from '@/store/deckStore';
import type { GameState, GameAction, CardInstance, PlayerState } from '@/lib/gameTypes';
import type { DeckCheck } from '@/lib/deckRules';
import { frontFace, manaCurve } from '@/lib/deckCards';
import { getCardsInZone } from '@/lib/ZoneManager';
import type { DeckContext, MatchContext, RecapContext } from './types';

// ─── Deck ────────────────────────────────────────────────────────────────────

export function deckContext(
  deck: { name: string; cards: DeckEntry[]; commanderName: string },
  records: Map<string, ScryfallCardRecord | null>,
  check: DeckCheck
): DeckContext {
  const cmd = deck.commanderName ? records.get(deck.commanderName) ?? null : null;
  const cards = deck.cards
    .filter((e) => e.cardName !== deck.commanderName)
    .map((e) => {
      const rec = records.get(e.cardName) ?? null;
      const face = rec ? frontFace(rec) : null;
      return {
        name: e.cardName,
        qty: e.quantity,
        type: shortType(face?.typeLine ?? ''),
        mv: rec ? Math.round(rec.cmc ?? 0) : 0,
        cost: face?.manaCost ?? '',
      };
    })
    .sort((a, b) => a.type.localeCompare(b.type) || a.mv - b.mv || a.name.localeCompare(b.name));
  const lands = cards.filter((c) => /land/i.test(c.type)).reduce((s, c) => s + c.qty, 0);
  return {
    name: deck.name,
    commander: cmd
      ? { name: cmd.name, typeLine: frontFace(cmd).typeLine, oracleText: frontFace(cmd).oracleText, identity: cmd.color_identity ?? [] }
      : null,
    cards,
    total: deck.cards.reduce((s, c) => s + c.quantity, 0),
    lands,
    curve: manaCurve(deck.cards, records),
    issues: check.issues.map((i) => i.message),
  };
}

/** "Legendary Creature — Phyrexian Angel Horror" → "Creature"; "Artifact Creature — Golem" → "Artifact Creature". */
export function shortType(typeLine: string): string {
  const main = typeLine.split('—')[0].replace(/\b(Legendary|Basic|Snow|Tribal|Kindred|Token)\b/g, '').replace(/\s+/g, ' ').trim();
  return main || 'Unknown';
}

// ─── Match ───────────────────────────────────────────────────────────────────

export function matchContext(state: GameState, legalActions: GameAction[], youId: string): MatchContext {
  const you = state.players.find((p) => p.id === youId) ?? state.players[0];
  const byId = (id: string) => state.players.find((p) => p.id === id);
  const inst = (id: string) => state.cardInstances.get(id);
  const zone = (pid: string, z: string): CardInstance[] => getCardsInZone(state, pid, z).map(inst).filter((c): c is CardInstance => !!c);

  const yourCommand = zone(you.id, 'command');
  const yourBf = zone(you.id, 'battlefield');
  const commanderName = commanderOf(you, yourCommand, yourBf);
  const commanderZone: MatchContext['you']['commander'] =
    commanderName
      ? {
          name: commanderName,
          zone: yourCommand.some((c) => c.cardData.name === commanderName) ? 'command' : yourBf.some((c) => c.cardData.name === commanderName) ? 'battlefield' : 'elsewhere',
          castCount: you.commanderCastCount[commanderName] ?? Object.values(you.commanderCastCount)[0] ?? 0,
        }
      : null;

  const playableIds = new Set(
    legalActions
      .filter((a) => a.playerId === you.id && (a.type === 'CAST_SPELL' || a.type === 'PLAY_LAND'))
      .map((a) => String(a.payload?.cardInstanceId ?? ''))
  );
  const playable = [...playableIds].map((id) => inst(id)?.cardData.name).filter((n): n is string => !!n);

  const commanderDamage: Record<string, number> = {};
  for (const [source, dmg] of Object.entries(you.commanderDamageReceived)) if (dmg > 0) commanderDamage[source] = dmg;

  return {
    turn: state.turn.turnNumber,
    phase: state.turn.phase.replace(/_/g, ' '),
    step: state.turn.step.replace(/_/g, ' '),
    activePlayer: byId(state.turn.activePlayerId)?.name ?? 'unknown',
    youHavePriority: state.priority.playerWithPriority === you.id,
    you: {
      name: you.name,
      life: you.life,
      poison: you.poisonCounters,
      commanderDamage,
      commander: commanderZone,
      hand: zone(you.id, 'hand').map((c) => ({ name: c.cardData.name, cost: c.cardData.manaCost, type: shortType(c.cardData.typeLine), oracle: c.cardData.oracleText })),
      battlefield: yourBf.map((c) => ({ name: c.cardData.name, type: shortType(c.cardData.typeLine), tapped: c.tapped, pt: pt(c) })),
      graveyard: zone(you.id, 'graveyard').map((c) => c.cardData.name),
      libraryCount: state.zones.get(`${you.id}:library`)?.cards.length ?? 0,
      manaAvailable: yourBf.filter((c) => !c.tapped && /land/i.test(c.cardData.typeLine)).length + Object.values(you.manaPool).reduce((s, n) => s + n, 0),
    },
    opponents: state.players.filter((p) => p.id !== you.id && !p.hasLost).map((p) => {
      const bf = zone(p.id, 'battlefield');
      const cmdName = commanderOf(p, zone(p.id, 'command'), bf);
      return {
        name: p.name,
        life: p.life,
        poison: p.poisonCounters,
        commander: cmdName,
        commanderDamageFromYou: commanderName ? p.commanderDamageReceived[commanderName] ?? 0 : 0,
        handSize: state.zones.get(`${p.id}:hand`)?.cards.length ?? 0,
        libraryCount: state.zones.get(`${p.id}:library`)?.cards.length ?? 0,
        creatures: bf.filter((c) => /creature/i.test(c.cardData.typeLine)).map((c) => ({ name: c.cardData.name, pt: pt(c), tapped: c.tapped })),
        others: bf.filter((c) => !/creature|land/i.test(c.cardData.typeLine)).map((c) => c.cardData.name),
        lands: bf.filter((c) => /land/i.test(c.cardData.typeLine)).length,
      };
    }),
    stack: [...state.stack].reverse().map((s) => ({
      name: s.cardData?.name ?? s.type,
      controller: byId(s.controllerId)?.name ?? s.controllerId,
      description: s.cardData?.oracleText ?? '',
    })),
    legalActions: [...new Set(legalActions.filter((a) => a.playerId === you.id).map((a) => a.type))],
    playable,
  };
}

function commanderOf(p: PlayerState, command: CardInstance[], battlefield: CardInstance[]): string | null {
  const inZone = command.find((c) => /legendary/i.test(c.cardData.typeLine) || /can be your commander/i.test(c.cardData.oracleText));
  if (inZone) return inZone.cardData.name;
  const named = Object.keys(p.commanderCastCount)[0];
  if (named) return named;
  // A commander on the battlefield is not marked; the zone is the only signal we have.
  void battlefield;
  return command[0]?.cardData.name ?? null;
}

function pt(c: CardInstance): string | undefined {
  const p = c.modifiedPower ?? c.cardData.power;
  const t = c.modifiedToughness ?? c.cardData.toughness;
  return p != null && t != null ? `${p}/${t}` : undefined;
}

// ─── Recap ───────────────────────────────────────────────────────────────────

export const RECAP_MAX_EVENTS = 190;

/** One line per Forge event, in the log's words, so the model reads what the player saw. */
export function describeForgeEvent(e: Record<string, unknown>): string | null {
  const type = String(e.eventType ?? '');
  const who = (e.playerName as string) || '';
  const card = (e.cardName as string) || '';
  switch (type) {
    case 'GAME_STARTED': return 'Game started';
    case 'TURN_STARTED': return `Turn ${e.turnNumber ?? '?'} — ${e.activePlayer ?? who}`;
    case 'SPELL_CAST': return `${who || 'Someone'} cast ${card || 'a spell'}`;
    case 'CARD_PLAYED': return `${who || 'Someone'} played ${card || 'a card'}`;
    case 'SPELL_RESOLVED': return card ? `${card} resolved` : null;
    case 'CREATURE_ATTACKED': return `${card || who} attacked`;
    case 'CREATURE_BLOCKED': return `${e.blockerName ?? 'A creature'} blocked ${card}`;
    case 'DAMAGE_DEALT': return `${e.amount ?? 0} damage to ${e.targetName ?? 'a target'}`;
    case 'LIFE_CHANGED': { const d = Number(e.delta ?? 0); return `${who || 'Someone'} ${d >= 0 ? 'gained' : 'lost'} ${Math.abs(d)} life → ${e.newLife}`; }
    case 'CARD_DESTROYED': return `${card || 'A permanent'} was destroyed`;
    case 'CARD_EXILED': return `${card || 'A card'} was exiled`;
    case 'CARD_SACRIFICED': return `${card || 'A permanent'} was sacrificed`;
    case 'CARD_DISCARDED': return `${who || 'Someone'} discarded ${card || 'a card'}`;
    case 'PLAYER_LOST': return `${who || 'A player'} was eliminated`;
    case 'PLAYER_WON': return `${who || card} won`;
    case 'GAME_OVER': return 'Game over';
    default: return null;
  }
}

export function recapContext(
  events: Array<Record<string, unknown>>,
  state: GameState | null,
  youId: string,
  winner: string | null,
  deck: { name: string; commanderName: string } | null
): RecapContext {
  const lines = events.map(describeForgeEvent).filter((l): l is string => !!l);
  const you = state?.players.find((p) => p.id === youId);
  const winnerName = winner && winner !== 'draw' ? winner : (state?.winner ? state.players.find((p) => p.id === state.winner)?.name ?? 'nobody' : 'nobody');
  const finalLife: Record<string, number> = {};
  for (const p of state?.players ?? []) finalLife[p.name] = p.life;
  return {
    youWon: !!you && (winnerName === you.name || state?.winner === youId),
    winner: winnerName,
    turns: state?.turn.turnNumber ?? 0,
    finalLife,
    events: lines.slice(-RECAP_MAX_EVENTS),
    deckName: deck?.name ?? 'your deck',
    commander: deck?.commanderName || null,
  };
}
