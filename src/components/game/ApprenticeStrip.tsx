'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { GraduationCap, X, BookOpen } from 'lucide-react';
import { useGameStore } from '@/store/gameStore';
import { useForgeGameStore } from '@/store/forgeGameStore';
import { STEP_GUIDE, PHASE_GUIDE, PROMPT_GUIDE, NOTES, type ApprenticeNote, type LessonRef } from '@/content/lessons';
import { useLessonSheet } from '@/store/lessonSheetStore';
import { getCardsInZone } from '@/lib/ZoneManager';
import { cn } from '@/lib/utils';

/**
 * One line under the game header while Apprentice mode is on: what this step is and what
 * you can do in it, or, when the engine is asking something, what it is asking and how to
 * answer. Notes fire once per game the first time something matters (the stack, the
 * commander leaving its zone, low life, poison, commander damage). Deterministic: the
 * rulebook read at the right moment, not a model.
 */
export function ApprenticeStrip({ youId, className }: { youId: string; className?: string }) {
  const gameState = useGameStore((s) => s.gameState);
  const pendingChoice = useForgeGameStore((s) => s.pendingChoice);
  const gameId = useForgeGameStore((s) => s.gameState?.gameId ?? 0);

  // Notes already shown this game, and the one dismissed. Reset when a new game starts.
  const [seen, setSeen] = useState<{ game: number; ids: string[]; dismissed: string | null }>({ game: gameId, ids: [], dismissed: null });
  if (seen.game !== gameId) setSeen({ game: gameId, ids: [], dismissed: null });

  const note = useMemo<ApprenticeNote | null>(() => {
    if (!gameState) return null;
    const you = gameState.players.find((p) => p.id === youId);
    if (!you) return null;
    const command = getCardsInZone(gameState, youId, 'command');
    const candidates: ApprenticeNote[] = [];
    if (gameState.stack.length > 0) candidates.push(NOTES.stack);
    if (command.length === 0 && gameState.turn.turnNumber > 1) candidates.push(NOTES['commander-cast']);
    if (you.life <= 10) candidates.push(NOTES['low-life']);
    if (you.poisonCounters >= 7) candidates.push(NOTES.poison);
    if (Object.values(you.commanderDamageReceived).some((d) => d >= 15)) candidates.push(NOTES['commander-damage']);
    return candidates.find((c) => !seen.ids.includes(c.id)) ?? null;
  }, [gameState, youId, seen.ids]);

  if (!gameState) return null;

  const isYou = gameState.priority.playerWithPriority === youId;
  const prompt = pendingChoice ? PROMPT_GUIDE[pendingChoice.choiceType] : null;
  const step = STEP_GUIDE[gameState.turn.step];
  const phase = PHASE_GUIDE[gameState.turn.phase];

  let text: string;
  let ref: LessonRef;
  let tone: 'note' | 'prompt' | 'step' = 'step';
  if (note && seen.dismissed !== note.id) {
    text = note.text; ref = note.ref; tone = 'note';
  } else if (prompt && pendingChoice && pendingChoice.choiceType !== 'choose_action') {
    text = `${prompt.what} ${prompt.how}`; ref = prompt.ref ?? step.ref; tone = 'prompt';
  } else {
    const who = gameState.turn.activePlayerId === youId ? 'Your' : `${gameState.players.find((p) => p.id === gameState.turn.activePlayerId)?.name ?? 'Their'}'s`;
    text = `${who} ${phase.title.toLowerCase()} — ${step.line} ${isYou ? step.canDo : ''}`.trim();
    ref = step.ref;
  }

  const dismiss = () => { if (note) setSeen((s) => ({ ...s, ids: [...s.ids, note.id], dismissed: note.id })); };

  return (
    <div
      className={cn('flex shrink-0 items-center gap-2 border-b border-border/30 px-2', tone === 'note' ? 'bg-gold/[0.07]' : tone === 'prompt' ? 'bg-card/60' : 'bg-background/40', className)}
      style={{ minHeight: 'clamp(22px,3.4vh,1000px)', padding: 'clamp(2px,0.4vmin,1000px) clamp(8px,1.5vmin,1000px)' }}
      data-dev-apprentice
      data-tour="board-apprentice"
      data-apprentice-tone={tone}
      role="status"
    >
      <GraduationCap className="shrink-0 text-gold" style={{ width: 'clamp(11px,2vmin,1000px)', height: 'clamp(11px,2vmin,1000px)' }} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={text}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -3 }}
          transition={{ duration: 0.15 }}
          className="min-w-0 flex-1 truncate text-foreground/85"
          style={{ fontSize: 'clamp(10px,1.7vmin,1000px)' }}
          title={text}
        >
          {text}
        </motion.p>
      </AnimatePresence>
      <button type="button" onClick={() => useLessonSheet.getState().open(ref)} className="flex shrink-0 items-center gap-1 text-gold/80 hover:text-gold" style={{ fontSize: 'clamp(9px,1.5vmin,1000px)' }} title="Open the lesson beside the table" data-dev-learn-more>
        Learn more <BookOpen style={{ width: 'clamp(9px,1.5vmin,1000px)', height: 'clamp(9px,1.5vmin,1000px)' }} />
      </button>
      {tone === 'note' && (
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="shrink-0 text-muted-foreground hover:text-foreground"><X style={{ width: 'clamp(11px,2vmin,1000px)', height: 'clamp(11px,2vmin,1000px)' }} /></button>
      )}
    </div>
  );
}
