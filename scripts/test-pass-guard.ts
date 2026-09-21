/**
 * When the table asks before a pass: only a pass that would throw away your own main phase
 * with plays available and nothing done. Run: npm run test:pass-guard
 */
import { shouldAskBeforePass, stepKey } from '../src/lib/passGuard';
import { adaptForgeState } from '../src/lib/forgeStateAdapter';
import { buildMockGame } from '../src/dev/mockGame';
import type { GameAction, GameState } from '../src/lib/gameTypes';

let failures = 0;
function check(name: string, ok: boolean) {
  if (ok) console.log(`  ✓ ${name}`);
  else { failures++; console.log(`  ✗ ${name}`); }
}

const ME = 'player-human';
const base: GameState = adaptForgeState({ ...buildMockGame(), stack: [] });
const at = (patch: Partial<GameState['turn']>, extra: Partial<GameState> = {}): GameState => ({ ...base, ...extra, turn: { ...base.turn, ...patch }, priority: { ...base.priority, playerWithPriority: ME } });
const plays: GameAction[] = [
  { type: 'CAST_SPELL', playerId: ME, payload: { cardInstanceId: 'x' }, timestamp: 0 },
  { type: 'PASS_PRIORITY', playerId: ME, payload: {}, timestamp: 0 },
];
const passOnly: GameAction[] = [{ type: 'PASS_PRIORITY', playerId: ME, payload: {}, timestamp: 0 }];

const main1 = at({ activePlayerId: ME, phase: 'precombat_main', step: 'main' });
check('asks in your main phase with plays and nothing done', shouldAskBeforePass(main1, plays, ME, false));
check('asks in your second main phase too', shouldAskBeforePass(at({ activePlayerId: ME, phase: 'postcombat_main', step: 'main' }), plays, ME, false));
check('does not ask once you have acted this step', !shouldAskBeforePass(main1, plays, ME, true));
check('does not ask when you have nothing to play', !shouldAskBeforePass(main1, passOnly, ME, false));
check('does not ask with a spell on the stack', !shouldAskBeforePass({ ...main1, stack: [{ id: 's', type: 'spell', sourceInstanceId: 'x', controllerId: 'ai-2', targets: [] } as unknown as GameState['stack'][number]] }, plays, ME, false));
check('does not ask on an opponent’s turn', !shouldAskBeforePass(at({ activePlayerId: 'ai-2', phase: 'precombat_main', step: 'main' }), plays, ME, false));
check('does not ask in combat or the end step', !shouldAskBeforePass(at({ activePlayerId: ME, phase: 'combat', step: 'declare_attackers' }), plays, ME, false) && !shouldAskBeforePass(at({ activePlayerId: ME, phase: 'ending', step: 'end_step' }), plays, ME, false));
check('does not ask without priority', !shouldAskBeforePass({ ...main1, priority: { ...main1.priority, playerWithPriority: 'ai-2' } }, plays, ME, false));
check('does not ask after the game', !shouldAskBeforePass({ ...main1, isGameOver: true }, plays, ME, false));
check('the step key changes with the step and the turn', stepKey(main1) !== stepKey(at({ activePlayerId: ME, phase: 'combat', step: 'declare_attackers' })) && stepKey(main1) !== stepKey(at({ activePlayerId: ME, phase: 'precombat_main', step: 'main', turnNumber: main1.turn.turnNumber + 1 })) && stepKey(main1) === stepKey({ ...main1 }));

console.log(failures === 0 ? '\nAll pass-guard tests passed.' : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
