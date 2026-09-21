/**
 * One voice for the game log.
 *
 * The engine now sends every event fully described (who, what, to whom, with what, why); the
 * ticker, the full log, the recap the Archivist reads and the match record all phrase them
 * through this one function, so a line reads the same everywhere. Older servers still send
 * the client's own diff-synthesised events; those carry a subset of the same fields and read
 * fine through the same code.
 *
 * Pure: no store access, no React. `youName` is the human seat's name; it reads as "You".
 */

export type LogTone = 'turn' | 'phase' | 'good' | 'bad' | 'danger' | 'muted' | 'normal';

export interface LogLine {
  text: string;
  tone: LogTone;
  /** True for lines that only matter when reading closely: mana taps, phase changes, untaps. */
  detail: boolean;
}

export type LogEvent = Record<string, unknown> & { eventType?: string; type?: string };

/** Loss reasons as the engine names them, in plain words. */
export function describeLossReason(reason: string | undefined, spell?: string): string {
  switch (reason) {
    case 'LifeReachedZero': return 'life reached 0';
    case 'Poisoned': return 'ten poison counters';
    case 'CommanderDamage': return '21 commander damage';
    case 'Milled': return 'drew from an empty library';
    case 'Conceded': return 'conceded';
    case 'SpellEffect': return spell ? `${spell}` : 'a card effect';
    case 'OpponentWon': return 'an opponent won';
    case 'IntentionalDraw': return 'a draw';
    default: return 'eliminated';
  }
}

const PHASE_LABELS: Record<string, string> = {
  UNTAP: 'Untap', UPKEEP: 'Upkeep', DRAW: 'Draw step',
  MAIN1: 'Main phase 1', COMBAT_BEGIN: 'Begin combat', BEGIN_COMBAT: 'Begin combat',
  COMBAT_DECLARE_ATTACKERS: 'Declare attackers', COMBAT_DECLARE_BLOCKERS: 'Declare blockers',
  COMBAT_FIRST_STRIKE_DAMAGE: 'First-strike damage', COMBAT_DAMAGE: 'Combat damage',
  COMBAT_END: 'End of combat', END_OF_COMBAT: 'End of combat', COMBAT: 'Combat',
  MAIN2: 'Main phase 2', END_OF_TURN: 'End step', END: 'End step', CLEANUP: 'Cleanup',
};

const ZONE_WORDS: Record<string, string> = {
  Battlefield: 'the battlefield', Graveyard: 'the graveyard', Exile: 'exile', Hand: 'hand',
  Library: 'the library', Command: 'the command zone', Stack: 'the stack',
};

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(v ?? 0) || 0;
}

function trim(text: string, max = 96): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Possessive for a seat: "your", "Krenko AI's". */
function poss(name: string, you: boolean): string {
  return you ? 'your' : `${name}'s`;
}

/**
 * Phrase one event. Returns null for events with nothing to say (combat bookkeeping,
 * unknown types are still shown as their name so a new server event is never invisible).
 */
export function describeEvent(e: LogEvent, youName?: string): LogLine | null {
  const type = str(e.eventType ?? e.type);
  const rawWho = str(e.playerName);
  const isYou = (n: string) => !!n && (n === youName || n === 'You');
  const seat = (n: string) => (isYou(n) ? 'You' : n);
  const who = seat(rawWho);
  const you = isYou(rawWho);
  const card = str(e.cardName);
  const cause = str(e.cause);
  const causeCtrl = str(e.causeController);
  const withCause = (kind = '') => (cause ? ` (${kind ? `${kind}: ` : ''}${cause}${causeCtrl && !isYou(causeCtrl) && causeCtrl !== who ? `, ${causeCtrl}` : ''})` : '');
  const line = (text: string, tone: LogTone = 'normal', detail = false): LogLine => ({ text, tone, detail });

  switch (type) {
    case 'GAME_STARTED': return line('Game started', 'turn');
    case 'OPENING_HANDS': return line('Opening hands dealt', 'muted');
    case 'TURN_STARTED': {
      const active = seat(str(e.activePlayer) || rawWho);
      return line(`Turn ${e.turnNumber ?? '?'} — ${active === 'You' ? 'your turn' : active}`, 'turn');
    }
    case 'PHASE_CHANGED': {
      const phase = str(e.phase);
      return line(PHASE_LABELS[phase] ?? phase.replace(/_/g, ' ').toLowerCase(), 'phase', true);
    }
    case 'CARD_MULLIGANED': return line(`${who || 'A player'} took a mulligan`, 'muted');

    case 'CARD_DRAWN': {
      if (e.isOwn || you) return line(card ? `You drew ${card}` : 'You drew a card', 'normal');
      return line(`${who || 'A player'} drew a card`, 'muted');
    }
    case 'CARD_PLAYED': return line(`${who || 'A player'} played ${card || 'a card'}`, you ? 'good' : 'normal');
    case 'SPELL_CAST': {
      const targets = Array.isArray(e.targets) ? (e.targets as unknown[]).map((t) => seat(str(t))).filter(Boolean) : [];
      const arrow = targets.length > 0 ? ` → ${targets.join(', ')}` : '';
      if (e.isAbility) {
        const desc = str(e.description);
        const text = desc && card ? trim(desc.startsWith(card) ? desc.slice(card.length).replace(/^\s*[-–—:]\s*/, '') : desc, 80) : '';
        return line(`${who || 'A player'} activated ${card || 'an ability'}${text ? `: ${text}` : ''}${arrow}`, you ? 'good' : 'normal');
      }
      return line(`${who || 'A player'} cast ${card || 'a spell'}${arrow}`, you ? 'good' : 'normal');
    }
    case 'SPELL_RESOLVED': {
      const what = card ? (e.isAbility ? `${card}'s ability` : card) : 'A spell';
      if (e.fizzled) return line(`${what} fizzled — its targets were gone`, 'muted');
      return line(`${what} resolved`, 'muted');
    }

    case 'CREATURE_ATTACKED': {
      const def = seat(str(e.defender));
      return line(`${card || 'A creature'} attacks${def ? ` ${def === 'You' ? 'you' : def}` : ''}${who ? ` (${who})` : ''}`, isYou(str(e.defender)) ? 'danger' : 'normal');
    }
    case 'CREATURE_BLOCKED': return line(`${str(e.blockerName) || 'A creature'} blocks ${card || 'an attacker'}${who ? ` (${who})` : ''}`, 'normal');

    case 'DAMAGE_DEALT': {
      const target = seat(str(e.targetName) || rawWho);
      const src = str(e.sourceName) || 'Something';
      const srcCtrl = seat(str(e.sourceController));
      const kind = e.infect ? ' infect' : e.combat ? ' combat' : '';
      const from = srcCtrl && srcCtrl !== target ? ` (${srcCtrl})` : '';
      return line(`${src}${from} dealt ${num(e.amount)}${kind} damage to ${target === 'You' ? 'you' : target}`, isYou(str(e.targetName) || rawWho) ? 'danger' : 'normal');
    }
    case 'CARD_DAMAGE_DEALT': {
      const src = str(e.sourceName) || 'Something';
      return line(`${src} dealt ${num(e.amount)} damage to ${card || 'a permanent'}`, 'normal', true);
    }
    case 'LIFE_CHANGED': {
      const delta = num(e.delta);
      const sign = delta > 0 ? '+' : '−';
      const kind = str(e.causeKind);
      let why = '';
      if (cause) why = withCause(kind === 'combat' ? 'combat' : '');
      else if (kind === 'payment') why = ' (paid)';
      const subject = who || 'A player';
      return line(`${subject} ${sign}${Math.abs(delta)} life → ${e.newLife}${why}`, delta < 0 ? (you ? 'danger' : 'bad') : 'good');
    }
    case 'POISON_CHANGED': {
      const amt = num(e.amount);
      return line(`${who || 'A player'} ${amt >= 0 ? '+' : '−'}${Math.abs(amt)} poison → ${e.newPoison ?? ''}${withCause()}`, you ? 'danger' : 'bad');
    }
    case 'CARD_COUNTER_ADDED':
    case 'CARD_COUNTER_REMOVED': {
      const delta = num(e.delta) || (type === 'CARD_COUNTER_ADDED' ? 1 : -1);
      const ctype = str(e.counterType) || 'counter';
      return line(`${card || 'A permanent'} ${delta > 0 ? '+' : '−'}${Math.abs(delta)} ${ctype}${/counter/i.test(ctype) ? '' : ' counter'}${Math.abs(delta) > 1 ? 's' : ''} (now ${e.newValue ?? ''})`, 'normal', true);
    }

    case 'CARD_DESTROYED': return line(`${card || `${poss(who, you)} permanent`} went to the graveyard${withCause()}`, you ? 'bad' : 'normal');
    case 'CARD_SACRIFICED': return line(`${who || 'A player'} sacrificed ${card || 'a permanent'}${withCause()}`, you ? 'bad' : 'normal');
    case 'CARD_EXILED': {
      const from = str(e.from);
      if (!card) return line(`A card from ${poss(who, you)} ${from ? from.toLowerCase() : 'hand'} was exiled${withCause()}`, you ? 'bad' : 'normal');
      return line(`${card} was exiled${withCause()}`, you ? 'bad' : 'normal');
    }
    case 'CARD_DISCARDED': return line(`${who || 'A player'} discarded ${card || 'a card'}${withCause()}`, you ? 'bad' : 'normal');
    case 'CARD_MILLED': return line(`${who || 'A player'} milled ${card || 'a card'}${withCause()}`, 'normal', !card);
    case 'CARD_RETURNED_TO_HAND': {
      const from = str(e.from);
      return line(`${card || 'A card'} returned to ${poss(who, you)} hand${from && from !== 'Battlefield' ? ` from ${ZONE_WORDS[from] ?? from.toLowerCase()}` : ''}${withCause()}`, 'normal');
    }
    case 'CARD_RETURNED_TO_BATTLEFIELD': {
      const from = str(e.from);
      return line(`${card || 'A card'} entered the battlefield${from ? ` from ${ZONE_WORDS[from] ?? from.toLowerCase()}` : ''}${who ? ` (${who})` : ''}${withCause()}`, you ? 'good' : 'normal');
    }
    case 'CARD_RETURNED_TO_LIBRARY': {
      if (!card) return line(`${who || 'A player'} put a card into ${you ? 'your' : 'their'} library${withCause()}`, 'muted');
      return line(`${card} went into ${poss(who, you)} library${withCause()}`, 'normal');
    }
    case 'CARD_TO_COMMAND_ZONE': return line(`${card || 'A commander'} returned to the command zone${who ? ` (${who})` : ''}`, 'normal');
    case 'TOKEN_CREATED': return line(`${who || 'A player'} created ${card ? `a ${card}` : 'a token'}`, you ? 'good' : 'normal');
    case 'CARD_ATTACHED': {
      if (e.detached) return line(`${card || 'An attachment'} came off ${str(e.oldTargetName) || 'its host'}`, 'normal');
      return line(`${card || 'An attachment'} attached to ${str(e.targetName) || 'a permanent'}${who ? ` (${who})` : ''}`, 'normal');
    }
    case 'MANA_TAPPED': {
      const ability = trim(str(e.ability), 60);
      return line(`${who || 'A player'} tapped ${card || 'a permanent'} for mana${ability ? `: ${ability}` : ''}`, 'muted', true);
    }
    case 'MANA_ADDED': return line(`+${num(e.amount)} ${str(e.color)} mana`, 'muted', true);
    case 'CARD_TAPPED': return line(`${card} tapped`, 'muted', true);
    case 'CARD_UNTAPPED': return line(`${card} untapped`, 'muted', true);

    case 'PLAYER_LOST': {
      const reason = describeLossReason(str(e.reason) || undefined, str(e.spell) || undefined);
      return line(`${who || 'A player'} ${you ? 'are' : 'is'} out — ${reason}`, you ? 'danger' : 'bad');
    }
    case 'PLAYER_WON': return line(`${who || card} wins!`, 'turn');
    case 'GAME_OVER': {
      const winner = str(e.winner);
      if (!winner) return line('Game over', 'turn');
      if (winner === 'draw') return line('Game over — a draw', 'turn');
      return line(`Game over — ${seat(winner) === 'You' ? 'you win!' : `${winner} wins`}`, 'turn');
    }
    default:
      return line(type.replace(/_/g, ' ').toLowerCase(), 'muted', true);
  }
}

/** The index of the most recent start of the human's own turn, or 0 when there is none. */
export function indexOfYourLastTurn(events: LogEvent[], youName?: string): number {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    const t = str(e.eventType ?? e.type);
    if (t !== 'TURN_STARTED') continue;
    const active = str(e.activePlayer) || str(e.playerName);
    if (active === youName || active === 'You') return i;
  }
  return 0;
}
