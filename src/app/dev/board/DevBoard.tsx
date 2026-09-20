'use client';

import { useEffect } from 'react';
import { useForgeGameStore } from '@/store/forgeGameStore';
import { useGameStore } from '@/store/gameStore';
import { adaptForgeState } from '@/lib/forgeStateAdapter';
import { buildMockGame } from '@/dev/mockGame';
import { ForgeGamePage } from '@/app/game/forge/page';
import type { GameAction } from '@/lib/gameTypes';
import type { ForgeChoiceRequest } from '@/lib/forgeClient';

/**
 * Seeds both stores the same way a live game would — the mock ForgeGameState goes through
 * the real adapter — then renders the real page component.
 *
 * Query params:
 *   ?open=me | ai-2 | ai-3 | ai-4   open the expanded board for that player on load
 *   ?inspect=me | ai-2 | ai-3 | ai-4   open the seat inspector for that player on load
 *   ?choice=tutor | discard | confirm | modes | scry | targets
 *                                   seed a server prompt so the choice overlay renders
 */

const LIB = (id: number, name: string, type: string, manaCost: string, oracleText: string, colors: string, pt?: [number, number]) => ({
  id, name, type, manaCost, oracleText, colors, zone: 'Library', owner: 'Player', controller: 'Player',
  ...(pt ? { power: pt[0], toughness: pt[1] } : {}),
});

const LIBRARY_OPTIONS = [
  LIB(9001, 'Cyclonic Rift', 'Instant', '{1}{U}', "Return target nonland permanent you don't control to its owner's hand.\nOverload {6}{U} (You may cast this spell for its overload cost. If you do, change its text by replacing all instances of \"target\" with \"each.\")", 'U'),
  LIB(9002, 'Craterhoof Behemoth', 'Creature — Beast', '{5}{G}{G}{G}', 'Haste\nWhen Craterhoof Behemoth enters, creatures you control gain trample and get +X/+X until end of turn, where X is the number of creatures you control.', 'G', [5, 5]),
  LIB(9003, 'Smothering Tithe', 'Enchantment', '{3}{W}', 'Whenever an opponent draws a card, that player may pay {2}. If the player doesn\'t, you create a Treasure token.', 'W'),
  LIB(9004, 'Toxic Deluge', 'Sorcery', '{2}{B}', 'As an additional cost to cast this spell, pay X life.\nAll creatures get -X/-X until end of turn.', 'B'),
  LIB(9005, 'Vampiric Tutor', 'Instant', '{B}', 'Search your library for a card, then shuffle and put that card on top. You lose 2 life.', 'B'),
  LIB(9006, 'Command Tower', 'Land', '', "{T}: Add one mana of any color in your commander's color identity.", ''),
];

function choicePreset(name: string, humanHandIds: number[]): ForgeChoiceRequest | null {
  switch (name) {
    case 'tutor':
      return { requestId: 'dev-tutor', choiceType: 'choose_single_card_zone', data: { prompt: 'Search your library for a card', options: LIBRARY_OPTIONS, min: 1, max: 1 } };
    case 'scry':
      return { requestId: 'dev-scry', choiceType: 'scry', data: { prompt: 'Scry 3 — choose cards to put on the bottom', cards: LIBRARY_OPTIONS.slice(0, 3) } };
    case 'discard':
      return { requestId: 'dev-discard', choiceType: 'choose_discard', data: { prompt: 'Discard two cards', options: humanHandIds.map((id) => ({ id, name: '' })), min: 2, max: 2 } };
    case 'confirm':
      return { requestId: 'dev-confirm', choiceType: 'confirm_action', data: { prompt: 'Sakura-Tribe Elder — sacrifice it to search for a basic land?' } };
    case 'modes':
      return { requestId: 'dev-modes', choiceType: 'choose_modes', data: { prompt: 'Choose one — Anguished Unmaking', modes: [{ index: 0, description: 'Exile target nonland permanent. You lose 3 life.' }, { index: 1, description: 'Destroy target creature.' }], min: 1, max: 1 } };
    case 'targets':
      return { requestId: 'dev-targets', choiceType: 'choose_targets', data: { prompt: 'Swords to Plowshares — choose target creature', validTargets: [LIB(9002, 'Craterhoof Behemoth', 'Creature — Beast', '{5}{G}{G}{G}', 'Haste', 'G', [5, 5]), LIB(9010, 'Krenko, Mob Boss', 'Legendary Creature — Goblin Warrior', '{2}{R}{R}', '{T}: Create X 1/1 red Goblin creature tokens, where X is the number of Goblins you control.', 'R', [3, 3])], minTargets: 1, maxTargets: 1 } };
    default:
      return null;
  }
}
export function DevBoard() {
  // Readiness is read back from the store the effect seeds, so no local state is set inside
  // an effect and the seeding happens exactly once.
  const ready = useForgeGameStore((s) => s.connectionStatus === 'connected' && s.gameState !== null);

  useEffect(() => {
    const forgeState = buildMockGame();
    const adapted = adaptForgeState(forgeState);

    // Give the human a plausible set of legal actions so affordances light up.
    const humanHand = adapted.zones.get('player-human:hand')?.cards ?? [];
    const humanBf = adapted.zones.get('player-human:battlefield')?.cards ?? [];
    const legal: GameAction[] = [];
    for (const cid of humanHand) {
      const c = adapted.cardInstances.get(cid);
      if (!c) continue;
      const isLand = c.cardData.typeLine.toLowerCase().includes('land');
      legal.push({
        type: isLand ? 'PLAY_LAND' : 'CAST_SPELL',
        playerId: 'player-human',
        payload: { cardInstanceId: cid },
        timestamp: Date.now(),
      });
    }
    for (const cid of humanBf) {
      const c = adapted.cardInstances.get(cid);
      if (!c) continue;
      if (c.cardData.typeLine.toLowerCase().includes('land') && !c.tapped) {
        legal.push({ type: 'TAP_FOR_MANA', playerId: 'player-human', payload: { cardInstanceId: cid, manaColor: 'G' }, timestamp: Date.now() });
      }
    }
    const cmd = adapted.zones.get('player-human:command')?.cards ?? [];
    for (const cid of cmd) {
      legal.push({ type: 'CAST_SPELL', playerId: 'player-human', payload: { cardInstanceId: cid, fromZone: 'command' }, timestamp: Date.now() });
    }
    legal.push({ type: 'PASS_PRIORITY', playerId: 'player-human', payload: {}, timestamp: Date.now() });

    useGameStore.getState().enterForgeMode();
    useGameStore.getState().setForgeState(adapted);
    useGameStore.getState().setForgeLegalActions(legal, 'dev-req', () => {});

    // Hand options for the discard preset need real names, which the panel resolves from the
    // client's own card instances — so only ids are needed here.
    const choiceName = new URLSearchParams(window.location.search).get('choice');
    const humanHandIds = forgeState.players[0].hand.map((c) => c.id);
    const preset = choiceName ? choicePreset(choiceName, humanHandIds) : null;
    if (preset && preset.choiceType === 'choose_discard') {
      (preset.data as { options: { id: number; name: string }[] }).options = forgeState.players[0].hand.map((c) => ({ id: c.id, name: c.name }));
    }

    useForgeGameStore.setState({
      connectionStatus: 'connected',
      gameState: forgeState,
      isGameOver: false,
      pendingChoice: preset,
      gameEvents: [
        { eventType: 'GAME_STARTED' },
        { eventType: 'TURN_STARTED', turnNumber: 9, activePlayer: 'Player' },
        { eventType: 'SPELL_CAST', cardName: 'Ancestral Recall', playerName: 'You' },
        { eventType: 'SPELL_CAST', cardName: 'Counterspell', playerName: 'Control AI' },
        { eventType: 'LIFE_CHANGED', playerName: 'Krenko AI', newLife: 18, delta: -4 },
      ],
    });
  }, []);

  // Let the page mount, then open a board if asked.
  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams(window.location.search);
    const open = params.get('open');
    const inspect = params.get('inspect');
    if (!open && !inspect) return;
    const attr = open ? 'data-dev-open' : 'data-dev-inspect';
    const raw = open ?? inspect!;
    const target = raw === 'me' ? 'player-human' : raw;
    // The page owns this state; nudge it through the same event the stat boxes use.
    const t = setTimeout(() => {
      const btn = document.querySelector<HTMLElement>(`[${attr}="${target}"]`);
      btn?.click();
    }, 150);
    return () => clearTimeout(t);
  }, [ready]);

  if (!ready) return null;
  return <ForgeGamePage />;
}
