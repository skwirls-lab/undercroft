import type { GameState, GameAction } from '@/lib/gameTypes';

/**
 * Should the table ask before passing? Only when a pass would throw away a main phase:
 * it is your turn, your main phase, the stack is empty, you have not done anything this
 * step, and there is something you could do. A pass with a spell on the stack, or in
 * someone else's turn, or after you have already acted, is the ordinary kind and goes
 * through at once.
 */
export function shouldAskBeforePass(state: GameState | null, legalActions: GameAction[], youId: string, actedThisStep: boolean): boolean {
  if (!state || state.isGameOver) return false;
  if (state.turn.activePlayerId !== youId) return false;
  if (state.priority.playerWithPriority !== youId) return false;
  if (state.turn.phase !== 'precombat_main' && state.turn.phase !== 'postcombat_main') return false;
  if (state.stack.length > 0) return false;
  if (actedThisStep) return false;
  return legalActions.some((a) => a.playerId === youId && (a.type === 'PLAY_LAND' || a.type === 'CAST_SPELL' || a.type === 'ACTIVATE_ABILITY'));
}

/** One key per step of the game; when it changes, the "acted this step" flag resets. */
export function stepKey(state: GameState | null): string {
  if (!state) return '';
  return `${state.turn.turnNumber}|${state.turn.activePlayerId}|${state.turn.phase}|${state.turn.step}`;
}
