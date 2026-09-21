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
 *   ?choice=tutor | discard | confirm | modes | scry | targets | attackers | ability | color | combo | mana
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
    case 'attackers':
      return { requestId: 'dev-attackers', choiceType: 'declare_attackers', data: { prompt: 'Declare attackers', possibleAttackers: [LIB(9002, 'Craterhoof Behemoth', 'Creature — Beast', '{5}{G}{G}{G}', 'Haste', 'G', [5, 5]), LIB(9011, 'Serra Angel', 'Creature — Angel', '{3}{W}{W}', 'Flying, vigilance', 'W', [4, 4])], defenders: [{ id: 2, name: 'Krenko AI' }, { id: 3, name: 'Ur-Dragon AI' }, { id: 4, name: 'Control AI' }] } };
    case 'targets':
      // Candidates from three seats plus the players themselves: the "any target" case.
      return { requestId: 'dev-targets', choiceType: 'choose_targets', data: { prompt: 'Lightning Bolt — choose any target', validTargets: [
        { ...LIB(9002, 'Craterhoof Behemoth', 'Creature — Beast', '{5}{G}{G}{G}', 'Haste', 'G', [5, 5]), zone: 'Battlefield' },
        { ...LIB(9010, 'Krenko, Mob Boss', 'Legendary Creature — Goblin Warrior', '{2}{R}{R}', '{T}: Create X 1/1 red Goblin creature tokens, where X is the number of Goblins you control.', 'R', [3, 3]), zone: 'Battlefield', owner: 'Krenko AI', controller: 'Krenko AI' },
        { ...LIB(9012, 'Goblin Token', 'Creature — Goblin', '', '', 'R', [1, 1]), zone: 'Battlefield', owner: 'Krenko AI', controller: 'Krenko AI' },
        { ...LIB(9013, 'Scion of the Ur-Dragon', 'Legendary Creature — Dragon Avatar', '{W}{U}{B}{R}{G}', 'Flying\n{2}: Search your library for a Dragon permanent card...', 'WUBRG', [4, 4]), zone: 'Battlefield', owner: 'Ur-Dragon AI', controller: 'Ur-Dragon AI' },
        { ...LIB(9014, 'Sol Ring', 'Artifact', '{1}', '{T}: Add {C}{C}.', ''), zone: 'Battlefield', owner: 'Player', controller: 'Control AI' },
        { id: 1, name: 'Player', type: 'player', life: 31 },
        { id: 2, name: 'Krenko AI', type: 'player', life: 18 },
        { id: 3, name: 'Ur-Dragon AI', type: 'player', life: 40 },
        { id: 4, name: 'Control AI', type: 'player', life: 26 },
      ], minTargets: 1, maxTargets: 1 } };
    case 'ability':
      return { requestId: 'dev-ability', choiceType: 'choose_ability', data: { cardName: 'Krenko, Mob Boss', cardId: 9010, abilities: [
        { index: 0, description: '{T}: Create X 1/1 red Goblin creature tokens, where X is the number of Goblins you control.', cardName: 'Krenko, Mob Boss', isAbility: true },
        { index: 1, description: 'Cast Krenko, Mob Boss ({2}{R}{R})', cardName: 'Krenko, Mob Boss', isSpell: true },
      ] } };
    case 'combo':
      return { requestId: 'dev-combo', choiceType: 'choose_mana_combo', data: { prompt: 'Vivi Ornitier — choose 3 mana', cardName: 'Vivi Ornitier', amount: 3, different: false, colors: [{ mask: 2, name: 'Blue', symbol: 'U' }, { mask: 8, name: 'Red', symbol: 'R' }] } };
    case 'mana':
      return { requestId: 'dev-mana', choiceType: 'mana_payment', data: { manaCost: '{1}{U/P}', spellName: 'Gitaxian Probe', canCancel: true, lifeForPhyrexian: 2, sources: [{ id: 9101, name: 'Island', type: 'Basic Land — Island' }, { id: 9102, name: 'Sol Ring', type: 'Artifact' }] } };
    case 'color':
      return { requestId: 'dev-color', choiceType: 'choose_color', data: { prompt: 'Command Tower — choose a colour of mana', colors: [
        { mask: 1, name: 'White', symbol: 'W' }, { mask: 2, name: 'Blue', symbol: 'U' }, { mask: 4, name: 'Black', symbol: 'B' }, { mask: 8, name: 'Red', symbol: 'R' }, { mask: 16, name: 'Green', symbol: 'G' },
      ] } };
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
    // ?emptystack=1 clears the stack, so a pass in the main phase triggers the "end your main phase?" guard.
    if (new URLSearchParams(window.location.search).get('emptystack') === '1') forgeState.stack = [];
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
        { eventType: 'GAME_STARTED', turn: 0 },
        { eventType: 'TURN_STARTED', turnNumber: 7, activePlayer: 'Player', rich: true, turn: 7 },
        { eventType: 'CARD_PLAYED', playerName: 'Player', cardName: 'Forest', rich: true, turn: 7 },
        { eventType: 'MANA_TAPPED', playerName: 'Player', cardName: 'Forest', ability: '{T}: Add {G}.', rich: true, turn: 7 },
        { eventType: 'SPELL_CAST', playerName: 'Player', cardName: 'Cultivate', rich: true, turn: 7 },
        { eventType: 'SPELL_RESOLVED', cardName: 'Cultivate', rich: true, turn: 7 },
        { eventType: 'CARD_RETURNED_TO_BATTLEFIELD', playerName: 'Player', cardName: 'Island', from: 'Library', cause: 'Cultivate', rich: true, turn: 7 },
        { eventType: 'TURN_STARTED', turnNumber: 8, activePlayer: 'Krenko AI', rich: true, turn: 8 },
        { eventType: 'CARD_DRAWN', playerName: 'Krenko AI', cardName: '', hidden: true, rich: true, turn: 8 },
        { eventType: 'SPELL_CAST', playerName: 'Krenko AI', cardName: 'Krenko, Mob Boss', isAbility: true, description: 'Krenko, Mob Boss - {T}: Create X 1/1 red Goblin creature tokens, where X is the number of Goblins you control.', rich: true, turn: 8 },
        { eventType: 'TOKEN_CREATED', playerName: 'Krenko AI', cardName: 'Goblin', rich: true, turn: 8 },
        { eventType: 'TOKEN_CREATED', playerName: 'Krenko AI', cardName: 'Goblin', rich: true, turn: 8 },
        { eventType: 'TOKEN_CREATED', playerName: 'Krenko AI', cardName: 'Goblin', rich: true, turn: 8 },
        { eventType: 'CREATURE_ATTACKED', playerName: 'Krenko AI', cardName: 'Goblin Chieftain', defender: 'Player', rich: true, turn: 8 },
        { eventType: 'DAMAGE_DEALT', targetName: 'Player', playerName: 'Player', sourceName: 'Goblin Chieftain', sourceController: 'Krenko AI', amount: 4, combat: true, rich: true, turn: 8 },
        { eventType: 'LIFE_CHANGED', playerName: 'Player', oldLife: 35, newLife: 31, delta: -4, cause: 'Goblin Chieftain', causeController: 'Krenko AI', causeKind: 'combat', rich: true, turn: 8 },
        { eventType: 'TURN_STARTED', turnNumber: 9, activePlayer: 'Control AI', rich: true, turn: 9 },
        { eventType: 'SPELL_CAST', playerName: 'Control AI', cardName: 'Lightning Bolt', targets: ['Player'], rich: true, turn: 9 },
        { eventType: 'SPELL_CAST', playerName: 'Player', cardName: 'Counterspell', targets: ['Lightning Bolt'], rich: true, turn: 9 },
        { eventType: 'LIFE_CHANGED', playerName: 'Krenko AI', oldLife: 22, newLife: 18, delta: -4, cause: 'Vivi Ornitier', causeController: 'Player', causeKind: 'effect', rich: true, turn: 9 },
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
