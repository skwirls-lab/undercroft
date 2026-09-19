'use client';

import { useEffect, useState } from 'react';
import { useForgeGameStore } from '@/store/forgeGameStore';
import { useGameStore } from '@/store/gameStore';
import { adaptForgeState } from '@/lib/forgeStateAdapter';
import { buildMockGame } from '@/dev/mockGame';
import { ForgeGamePage } from '@/app/game/forge/page';
import type { GameAction } from '@/lib/gameTypes';

/**
 * Seeds both stores the same way a live game would — the mock ForgeGameState goes through
 * the real adapter — then renders the real page component.
 *
 * Query params:
 *   ?open=me | ai-2 | ai-3 | ai-4   open the expanded board for that player on load
 */
export function DevBoard() {
  const [ready, setReady] = useState(false);

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

    useForgeGameStore.setState({
      connectionStatus: 'connected',
      gameState: forgeState,
      isGameOver: false,
      pendingChoice: null,
      gameEvents: [
        { eventType: 'GAME_STARTED' },
        { eventType: 'TURN_STARTED', turnNumber: 9, activePlayer: 'Player' },
        { eventType: 'SPELL_CAST', cardName: 'Ancestral Recall', playerName: 'You' },
        { eventType: 'SPELL_CAST', cardName: 'Counterspell', playerName: 'Control AI' },
        { eventType: 'LIFE_CHANGED', playerName: 'Krenko AI', newLife: 18, delta: -4 },
      ],
    });
    setReady(true);
  }, []);

  // Let the page mount, then open a board if asked.
  useEffect(() => {
    if (!ready) return;
    const open = new URLSearchParams(window.location.search).get('open');
    if (!open) return;
    const target = open === 'me' ? 'player-human' : open;
    // The page owns this state; nudge it through the same event the stat boxes use.
    const t = setTimeout(() => {
      const btn = document.querySelector<HTMLButtonElement>(`[data-dev-open="${target}"]`);
      btn?.click();
    }, 150);
    return () => clearTimeout(t);
  }, [ready]);

  if (!ready) return null;
  return <ForgeGamePage />;
}
