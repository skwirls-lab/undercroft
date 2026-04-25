'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForgeGameStore } from '@/store/forgeGameStore';
import { useGameStore } from '@/store/gameStore';
import { GameBoard } from '@/components/game/GameBoard';
import { GameLog } from '@/components/game/GameLog';
import { CardPreviewProvider } from '@/components/game/CardPreviewContext';
import { CardPreviewPanel } from '@/components/game/CardPreviewPanel';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Loader2,
  Shield,
  Flag,
  RotateCcw,
} from 'lucide-react';
import type { ForgeChoiceRequest } from '@/lib/forgeClient';

// ============================================================
// Forge Game Page — uses our existing UI components (GameBoard,
// PlayerField, Hand, CardView, etc.) with Forge server state
// pushed through the adapter into useGameStore.
// ============================================================

const HUMAN_PLAYER_ID = 'player-human';

export default function ForgeGamePage() {
  const router = useRouter();
  const {
    connectionStatus,
    gameState: forgeState,
    pendingChoice,
    gameEvents,
    isGameOver,
    winner,
    disconnect,
    respondToChoice,
    concede,
  } = useForgeGameStore();

  const { gameState, events } = useGameStore();

  // If not connected, redirect back to setup
  useEffect(() => {
    if (connectionStatus === 'disconnected' || connectionStatus === 'error') {
      router.replace('/game');
    }
  }, [connectionStatus, router]);

  // Still connecting or waiting for first game state / choice
  if (connectionStatus !== 'connected' || (!gameState && !isGameOver && !pendingChoice)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
        <p className="text-muted-foreground">Loading game...</p>
      </div>
    );
  }

  // Game in progress — uses existing GameBoard + sidebar
  return (
    <CardPreviewProvider>
      <div className="flex h-screen flex-col overflow-hidden">
        {/* Top bar — matches /game/play layout */}
        <header className="flex items-center justify-between border-b border-border/30 px-4 py-2 shrink-0">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-1 h-4 w-4" />
                Home
              </Button>
            </Link>
            <h2 className="text-sm font-semibold tracking-tight text-gold">
              Undercroft
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={concede}
              className="gap-1 text-red-400"
            >
              <Flag className="h-3.5 w-3.5" />
              Concede
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { disconnect(); router.push('/game'); }}
              className="gap-1 text-muted-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              New Game
            </Button>
          </div>
        </header>

        {/* Two-column layout: game board + sidebar */}
        <div className="flex flex-1 min-h-0">
          {/* Main game area */}
          <main className="flex-1 overflow-auto p-3 flex flex-col">
            {/* Game Over overlay */}
            {isGameOver && (
              <div className="mb-4 rounded-xl border border-gold/30 bg-gold/10 p-6 text-center">
                <h2 className="text-2xl font-bold text-gold">Game Over</h2>
                <p className="mt-2 text-lg">{winner === 'draw' ? 'Draw!' : `Winner: ${winner}`}</p>
                <Button className="mt-4" onClick={() => { disconnect(); router.push('/game'); }}>
                  New Game
                </Button>
              </div>
            )}

            {/* The existing GameBoard reads from useGameStore (populated by adapter) */}
            {/* choose_action is integrated into GameBoard via synthetic legalActions */}
            <GameBoard currentPlayerId={HUMAN_PLAYER_ID} className="flex-1" />

            {/* Non-action choice overlays (mulligan, sacrifice, targets, etc.) positioned near bottom */}
            {pendingChoice && pendingChoice.choiceType !== 'choose_action' && (
              <div className="mt-2 max-w-3xl self-center w-full">
                <ChoicePanel choice={pendingChoice} onRespond={respondToChoice} />
              </div>
            )}
          </main>

          {/* Right sidebar — card preview + game log */}
          <aside className="hidden lg:flex w-[260px] shrink-0 border-l border-border/20 bg-card/10 flex-col overflow-hidden">
            <div className="p-3 shrink-0">
              <CardPreviewPanel />
            </div>
            <div className="flex-1 min-h-0 border-t border-border/10">
              <GameLog
                events={events}
                currentPlayerId={HUMAN_PLAYER_ID}
                collapsible={false}
                className="h-full rounded-none border-0"
              />
            </div>
          </aside>
        </div>
      </div>
    </CardPreviewProvider>
  );
}

// ============================================================
// Choice panel — Forge server sends choice_request messages.
// Renders appropriate UI for each choice type, styled to match
// the existing Undercroft theme (gold/amber accents).
// ============================================================

interface LegalPlay {
  index: number;
  description: string;
  cardName?: string;
  cardId?: number;
  isSpell?: boolean;
  isAbility?: boolean;
}

interface CardOption {
  id: number;
  name: string;
  type?: string;
  power?: number;
  toughness?: number;
  zone?: string;
  owner?: string;
  controller?: string;
  life?: number;
}

function ChoicePanel({ choice, onRespond }: {
  choice: ForgeChoiceRequest;
  onRespond: (requestId: string, payload: Record<string, unknown>) => void;
}) {
  const data = choice.data as Record<string, unknown>;
  const prompt = (data.prompt as string) || (data.message as string) || '';
  const choiceType = choice.choiceType;

  // --- choose_action: main priority prompt with legal plays ---
  if (choiceType === 'choose_action') {
    const legalPlays = (data.legalPlays || []) as LegalPlay[];
    const canPass = data.canPassPriority as boolean;
    const phase = data.phase as string;
    const isMain = data.isMainPhase as boolean;

    return (
      <div className="mb-3 rounded-xl border border-gold/30 bg-gold/5 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-gold">
            {isMain ? 'Your Turn — Main Phase' : `Priority — ${phase}`}
          </span>
          {canPass && (
            <Button
              size="sm"
              onClick={() => onRespond(choice.requestId, { pass: true })}
              className="h-7 gap-1.5 px-4 text-xs font-semibold bg-gold text-gold-foreground hover:bg-gold/90"
            >
              Pass
            </Button>
          )}
        </div>

        {legalPlays.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {legalPlays.map((play) => (
              <button
                key={play.index}
                onClick={() => onRespond(choice.requestId, { abilityIndex: play.index })}
                className="rounded-lg border border-border/40 bg-card/60 px-3 py-1.5 text-xs text-left transition-colors hover:border-gold/40 hover:bg-gold/10"
              >
                <span className="font-medium text-foreground">{play.cardName || 'Ability'}</span>
                <span className="ml-1 text-muted-foreground">{play.isSpell ? '(spell)' : play.isAbility ? '(ability)' : ''}</span>
                <div className="text-[10px] text-muted-foreground/70 max-w-[200px] truncate">{play.description}</div>
              </button>
            ))}
          </div>
        ) : canPass ? (
          <p className="text-xs text-muted-foreground">No actions available — pass priority.</p>
        ) : null}
      </div>
    );
  }

  // --- mulligan: keep / mulligan hand ---
  if (choiceType === 'mulligan') {
    const cardsToReturn = (data.cardsToReturn as number) ?? 0;
    const handCards = (data.hand || []) as CardOption[];
    return (
      <div className="mb-3 flex flex-col items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 px-6 py-4">
        <span className="text-sm font-semibold text-primary">Mulligan Phase</span>
        <span className="text-xs text-muted-foreground">
          {cardsToReturn > 0
            ? `Keep hand? You'll put ${cardsToReturn} card(s) on the bottom.`
            : 'Look at your opening hand. Keep or mulligan?'}
        </span>
        {handCards.length > 0 && (
          <div className="flex flex-wrap gap-1.5 justify-center">
            {handCards.map((card) => (
              <div
                key={card.id}
                className="rounded-lg border border-border/40 bg-card/60 px-3 py-2 text-xs text-center min-w-[80px]"
              >
                <span className="font-medium text-foreground">{card.name}</span>
                {card.type && (
                  <div className="text-[10px] text-muted-foreground/70 truncate max-w-[120px]">{card.type}</div>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-3">
          <Button size="sm" onClick={() => onRespond(choice.requestId, { keep: true })} className="px-4">
            <Shield className="mr-1 h-3.5 w-3.5" /> Keep Hand
          </Button>
          <Button size="sm" variant="outline" onClick={() => onRespond(choice.requestId, { keep: false })} className="px-4">
            Mulligan
          </Button>
        </div>
      </div>
    );
  }

  // --- mulligan_tuck: choose cards to put on bottom ---
  if (choiceType === 'mulligan_tuck') {
    const cardOptions = (data.options || []) as CardOption[];
    const min = (data.min as number) ?? 1;
    return (
      <CardSelectPanel
        prompt={prompt || `Choose ${min} card(s) to put on the bottom`}
        options={cardOptions}
        min={min}
        max={(data.max as number) ?? min}
        requestId={choice.requestId}
        onRespond={onRespond}
        responseKey="selectedIds"
      />
    );
  }

  // --- confirm_action / confirm_replacement: yes/no ---
  if (choiceType === 'confirm_action' || choiceType === 'confirm_replacement') {
    return (
      <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">{prompt || 'Confirm?'}</h3>
        <div className="flex gap-3">
          <Button size="sm" onClick={() => onRespond(choice.requestId, { confirmed: true })}>Yes</Button>
          <Button size="sm" variant="outline" onClick={() => onRespond(choice.requestId, { confirmed: false })}>No</Button>
        </div>
      </div>
    );
  }

  // --- choose_cards / choose_discard / choose_permanents_sacrifice / choose_single_entity / choose_entities ---
  if (['choose_cards', 'choose_discard', 'choose_permanents_sacrifice',
       'choose_permanents_destroy', 'choose_single_entity', 'choose_entities',
       'choose_cards_zone'].includes(choiceType)) {
    const cardOptions = (data.options || []) as CardOption[];
    const min = (data.min as number) ?? (data.optional ? 0 : 1);
    const max = (data.max as number) ?? cardOptions.length;
    const isSingle = choiceType === 'choose_single_entity';
    return (
      <CardSelectPanel
        prompt={prompt || `Choose ${isSingle ? 'one' : `${min}-${max}`}`}
        options={cardOptions}
        min={isSingle ? 1 : min}
        max={isSingle ? 1 : max}
        requestId={choice.requestId}
        onRespond={onRespond}
        responseKey={isSingle ? 'entityId' : choiceType === 'choose_entities' ? 'entityIds' : 'selectedIds'}
      />
    );
  }

  // --- choose_targets ---
  if (choiceType === 'choose_targets') {
    const validTargets = (data.validTargets || []) as CardOption[];
    const min = (data.minTargets as number) ?? 1;
    const max = (data.maxTargets as number) ?? 1;
    return (
      <CardSelectPanel
        prompt={prompt || (data.abilityDescription as string) || `Choose target(s)`}
        options={validTargets}
        min={min}
        max={max}
        requestId={choice.requestId}
        onRespond={onRespond}
        responseKey="targetIds"
      />
    );
  }

  // --- declare_attackers ---
  if (choiceType === 'declare_attackers') {
    const attackers = (data.possibleAttackers || []) as CardOption[];
    return (
      <CardSelectPanel
        prompt="Declare Attackers"
        options={attackers}
        min={0}
        max={attackers.length}
        requestId={choice.requestId}
        onRespond={onRespond}
        responseKey="attackerCardIds"
        formatResponse={(ids) => ({ attackers: ids.map((id: number) => ({ cardId: id })) })}
      />
    );
  }

  // --- declare_blockers ---
  if (choiceType === 'declare_blockers') {
    const blockers = (data.possibleBlockers || []) as CardOption[];
    return (
      <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
        <h3 className="text-sm font-semibold text-red-400 mb-2">Declare Blockers</h3>
        {blockers.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {blockers.map((b) => (
              <button key={b.id} className="rounded-lg border border-border/40 bg-card/60 px-3 py-1.5 text-xs hover:border-red-500/40 hover:bg-red-500/10">
                {b.name} {b.power !== undefined ? `${b.power}/${b.toughness}` : ''}
              </button>
            ))}
          </div>
        ) : null}
        <Button size="sm" variant="outline" onClick={() => onRespond(choice.requestId, { blocks: [] })}>
          No Blocks
        </Button>
      </div>
    );
  }

  // --- choose_type ---
  if (choiceType === 'choose_type') {
    const typeOptions = (data.options || []) as string[];
    return (
      <div className="mb-3 rounded-xl border border-border/30 bg-card/30 p-4">
        <h3 className="text-sm font-semibold mb-2">{prompt || 'Choose a type'}</h3>
        <div className="flex flex-wrap gap-1.5">
          {typeOptions.map((t, i) => (
            <Button key={i} size="sm" variant="secondary" onClick={() => onRespond(choice.requestId, { chosen: t })}>
              {String(t)}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  // --- choose_ability / choose_single_spell / choose_spell_abilities ---
  if (['choose_ability', 'choose_single_spell', 'choose_spell_abilities'].includes(choiceType)) {
    const abilities = (data.abilities || []) as LegalPlay[];
    return (
      <div className="mb-3 rounded-xl border border-border/30 bg-card/30 p-4">
        <h3 className="text-sm font-semibold mb-2">{prompt || 'Choose an ability'}</h3>
        <div className="flex flex-wrap gap-1.5">
          {abilities.map((a) => (
            <button
              key={a.index}
              onClick={() => onRespond(choice.requestId, { index: a.index })}
              className="rounded-lg border border-border/40 bg-card/60 px-3 py-1.5 text-xs text-left transition-colors hover:border-gold/40 hover:bg-gold/10"
            >
              <span className="font-medium">{a.cardName || 'Ability'}</span>
              <div className="text-[10px] text-muted-foreground/70 max-w-[250px] truncate">{a.description}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // --- play_trigger / put_on_top / scry ---
  if (choiceType === 'play_trigger') {
    return (
      <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <h3 className="text-sm font-semibold mb-2">{prompt || 'Play trigger?'}</h3>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onRespond(choice.requestId, { play: true })}>Yes</Button>
          <Button size="sm" variant="outline" onClick={() => onRespond(choice.requestId, { play: false })}>No</Button>
        </div>
      </div>
    );
  }

  if (choiceType === 'put_on_top') {
    return (
      <div className="mb-3 rounded-xl border border-border/30 bg-card/30 p-4">
        <h3 className="text-sm font-semibold mb-2">{prompt || 'Put on top of library?'}</h3>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onRespond(choice.requestId, { onTop: true })}>Top</Button>
          <Button size="sm" variant="outline" onClick={() => onRespond(choice.requestId, { onTop: false })}>Bottom</Button>
        </div>
      </div>
    );
  }

  // --- Fallback for any unhandled type ---
  return (
    <div className="mb-3 rounded-xl border border-border/30 bg-card/30 p-4">
      <h3 className="text-sm font-semibold mb-2">{prompt || `Choice: ${choiceType}`}</h3>
      <Button size="sm" variant="outline" onClick={() => onRespond(choice.requestId, { pass: true })}>
        OK / Pass
      </Button>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-muted-foreground">Raw data</summary>
        <pre className="mt-1 max-h-32 overflow-auto rounded bg-black/50 p-2 text-[10px] text-muted-foreground">
          {JSON.stringify(choice, null, 2)}
        </pre>
      </details>
    </div>
  );
}

// ============================================================
// CardSelectPanel — reusable multi-select card picker
// Used for discard, sacrifice, search, targets, etc.
// ============================================================

function CardSelectPanel({ prompt, options, min, max, requestId, onRespond, responseKey, formatResponse }: {
  prompt: string;
  options: CardOption[];
  min: number;
  max: number;
  requestId: string;
  onRespond: (requestId: string, payload: Record<string, unknown>) => void;
  responseKey: string;
  formatResponse?: (ids: number[]) => Record<string, unknown>;
}) {
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const isSingle = max === 1;

  // Keys that the server expects as arrays even for single selection
  const arrayKeys = new Set(['selectedIds', 'entityIds', 'targetIds', 'attackerCardIds']);

  const toggle = (id: number) => {
    if (isSingle) {
      // Single-select: respond immediately
      if (formatResponse) {
        onRespond(requestId, formatResponse([id]));
      } else {
        // Send as array for list-type keys, single value for entity keys
        const value = arrayKeys.has(responseKey) ? [id] : id;
        onRespond(requestId, { [responseKey]: value });
      }
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else if (next.size < max) { next.add(id); }
      return next;
    });
  };

  const confirm = () => {
    const ids = Array.from(selected);
    if (formatResponse) {
      onRespond(requestId, formatResponse(ids));
    } else {
      onRespond(requestId, { [responseKey]: ids });
    }
  };

  return (
    <div className="mb-3 rounded-xl border border-border/30 bg-card/30 p-4">
      <h3 className="text-sm font-semibold mb-2">{prompt}</h3>
      {!isSingle && (
        <p className="text-xs text-muted-foreground mb-2">Select {min === max ? min : `${min}-${max}`} · {selected.size} selected</p>
      )}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => toggle(opt.id)}
            className={`rounded-lg border px-3 py-1.5 text-xs text-left transition-colors ${
              selected.has(opt.id)
                ? 'border-gold/60 bg-gold/15 text-gold'
                : 'border-border/40 bg-card/60 hover:border-border text-foreground'
            }`}
          >
            {opt.name}
            {opt.power !== undefined && <span className="ml-1 text-muted-foreground">{opt.power}/{opt.toughness}</span>}
            {opt.type === 'player' && <span className="ml-1 text-muted-foreground">(Life: {opt.life})</span>}
          </button>
        ))}
      </div>
      {!isSingle && (
        <div className="flex gap-2">
          <Button size="sm" disabled={selected.size < min} onClick={confirm}>
            Confirm ({selected.size})
          </Button>
          {min === 0 && (
            <Button size="sm" variant="outline" onClick={() => onRespond(requestId, { [responseKey]: [] })}>
              Skip
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
