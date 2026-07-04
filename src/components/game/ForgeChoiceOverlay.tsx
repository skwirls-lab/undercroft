'use client';

import React, { useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useForgeGameStore } from '@/store/forgeGameStore';
import { useGameStore } from '@/store/gameStore';
import { CardView } from './CardView';
import { getCardsInZone } from '@/lib/ZoneManager';
import type { CardInstance } from '@/lib/gameTypes';
import type { ForgeChoiceRequest } from '@/lib/forgeClient';

// ============================================================
// Interfaces for choice panel sub-components
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

// ============================================================
// Main ForgeChoiceOverlay component
// Reads pendingChoice from forgeGameStore and renders appropriate UI
// ============================================================

export function ForgeChoiceOverlay() {
  const { pendingChoice, respondToChoice } = useForgeGameStore();

  if (!pendingChoice) return null;

  // Mulligan gets its own full-screen overlay
  if (pendingChoice.choiceType === 'mulligan') {
    return (
      <div key={pendingChoice.requestId} className="pointer-events-auto">
        <MulliganOverlay choice={pendingChoice} onRespond={respondToChoice} />
      </div>
    );
  }

  // Render as a centered modal overlay for better visibility
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      {/* Semi-transparent backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto" />
      {/* Modal content - key forces re-mount when requestId changes */}
      <div key={pendingChoice.requestId} className="relative z-10 w-full mx-4 pointer-events-auto" style={{ maxWidth: 'clamp(400px,60vmin,1000px)' }}>
        <ChoicePanel choice={pendingChoice} onRespond={respondToChoice} />
      </div>
    </div>
  );
}

// ============================================================
// ChoicePanel — handles all Forge choice types
// ============================================================

function ChoicePanel({ choice, onRespond }: {
  choice: ForgeChoiceRequest;
  onRespond: (requestId: string, payload: Record<string, unknown>) => void;
}) {
  const data = choice.data as Record<string, unknown>;
  const prompt = (data.prompt as string) || (data.message as string) || '';
  const choiceType = choice.choiceType;

  console.log('[ForgeChoiceOverlay] choiceType:', choiceType, 'data keys:', Object.keys(data), 'prompt:', prompt);

  // --- choose_action: main priority prompt with legal plays ---
  if (choiceType === 'choose_action') {
    const legalPlays = (data.legalPlays || []) as LegalPlay[];
    const canPass = data.canPassPriority as boolean;
    const phase = data.phase as string;
    const isMain = data.isMainPhase as boolean;

    return (
      <div className="mb-3 rounded-xl border border-gold/30 bg-gold/5" style={{ padding: 'clamp(10px,2vmin,1000px)' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 'clamp(8px,1.5vmin,1000px)' }}>
          <span className="font-semibold text-gold" style={{ fontSize: 'clamp(13px,2.5vmin,1000px)' }}>
            {isMain ? 'Your Turn — Main Phase' : `Priority — ${phase}`}
          </span>
          {canPass && (
          <Button
              onClick={() => onRespond(choice.requestId, { pass: true })}
              className="gap-1.5 font-semibold bg-gold text-gold-foreground hover:bg-gold/90 rounded-lg border border-border/40"
              style={{ height: 'clamp(28px,4vmin,1000px)', padding: '0 clamp(10px,2vmin,1000px)', fontSize: 'clamp(11px,2vmin,1000px)' }}
            >
              Pass
            </Button>
          )}
        </div>

        {legalPlays.length > 0 ? (
          <div className="flex flex-wrap" style={{ gap: 'clamp(4px,0.8vmin,1000px)' }}>
            {legalPlays.map((play) => (
          <Button
                key={play.index}
                onClick={() => onRespond(choice.requestId, { abilityIndex: play.index })}
                className="rounded-lg border border-border/40 bg-card/60 text-left transition-colors hover:border-gold/40 hover:bg-gold/10"
                style={{ padding: 'clamp(4px,0.8vmin,1000px) clamp(8px,1.5vmin,1000px)', fontSize: 'clamp(11px,2vmin,1000px)' }}
              >
                <span className="font-medium text-foreground">{play.cardName || 'Ability'}</span>
                <span className="ml-1 text-muted-foreground">{play.isSpell ? '(spell)' : play.isAbility ? '(ability)' : ''}</span>
                <div className="text-muted-foreground/70 max-w-[200px] truncate" style={{ fontSize: 'clamp(9px,1.5vmin,1000px)' }}>{play.description}</div>
              </Button>
            ))}
          </div>
        ) : canPass ? (
          <p className="text-muted-foreground" style={{ fontSize: 'clamp(11px,2vmin,1000px)' }}>No actions available — pass priority.</p>
        ) : null}
      </div>
    );
  }

  // --- mulligan: keep / mulligan hand ---
  if (choiceType === 'mulligan') {
    return (
      <MulliganOverlay choice={choice} onRespond={onRespond} />
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
      <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/5" style={{ padding: 'clamp(10px,2vmin,1000px)' }}>
        <h3 className="font-semibold text-foreground" style={{ fontSize: 'clamp(13px,2.5vmin,1000px)', marginBottom: 'clamp(8px,1.5vmin,1000px)' }}>{prompt || 'Confirm?'}</h3>
        <div className="flex" style={{ gap: 'clamp(6px,1.2vmin,1000px)' }}>
          <Button onClick={() => onRespond(choice.requestId, { confirmed: true })} className="rounded-lg border bg-card/60 font-medium hover:border-gold/40 hover:bg-gold/10" style={{ height: 'clamp(32px,4.5vmin,1000px)', padding: '0 clamp(12px,2vmin,1000px)', fontSize: 'clamp(12px,2vmin,1000px)' }}>Yes</Button>
          <Button variant="outline" onClick={() => onRespond(choice.requestId, { confirmed: false })} className="rounded-lg border bg-card/60 font-medium hover:border-border/40" style={{ height: 'clamp(32px,4.5vmin,1000px)', padding: '0 clamp(12px,2vmin,1000px)', fontSize: 'clamp(12px,2vmin,1000px)' }}>No</Button>
        </div>
      </div>
    );
  }

  // --- choose_cards / choose_discard / choose_permanents_sacrifice / choose_permanents_destroy / choose_single_entity / choose_entities / choose_cards_zone ---
  if (['choose_cards', 'choose_discard', 'choose_permanents_sacrifice',
       'choose_permanents_destroy', 'choose_single_entity', 'choose_entities',
       'choose_cards_zone'].includes(choiceType)) {
    const cardOptions = (data.options || data.cards || []) as CardOption[];
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
    const defenders = (data.defenders || []) as CardOption[];
    // If no attackers available, use AutoSkipCombat component to auto-skip
    if (attackers.length === 0) {
      return <AutoSkipCombat requestId={choice.requestId} onRespond={onRespond} />;
    }
    // Default defender is the first opponent (usually the only one in 1v1)
    const defaultDefenderId = defenders.length > 0 ? defenders[0].id : -1;
    return (
      <DeclareAttackersPanel
        attackers={attackers}
        defenders={defenders}
        defaultDefenderId={defaultDefenderId}
        requestId={choice.requestId}
        onRespond={onRespond}
      />
    );
  }

  // --- declare_blockers ---
  if (choiceType === 'declare_blockers') {
    const blockers = (data.possibleBlockers || []) as CardOption[];
    return (
      <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/5" style={{ padding: 'clamp(10px,2vmin,1000px)' }}>
        <h3 className="font-semibold text-red-400" style={{ fontSize: 'clamp(13px,2.5vmin,1000px)', marginBottom: 'clamp(6px,1vmin,1000px)' }}>Declare Blockers</h3>
        {blockers.length > 0 ? (
          <div className="flex flex-wrap" style={{ gap: 'clamp(4px,0.8vmin,1000px)', marginBottom: 'clamp(8px,1.5vmin,1000px)' }}>
            {blockers.map((b) => (
          <Button key={b.id} className="rounded-lg border border-border/40 bg-card/60 hover:border-red-500/40 hover:bg-red-500/10" style={{ padding: 'clamp(4px,0.8vmin,1000px) clamp(8px,1.5vmin,1000px)', fontSize: 'clamp(11px,2vmin,1000px)' }}>
                {b.name} {b.power !== undefined ? `${b.power}/${b.toughness}` : ''}
              </Button>
            ))}
          </div>
        ) : null}
          <Button variant="outline" onClick={() => onRespond(choice.requestId, { blocks: [] })} className="rounded-lg border bg-card/60 font-medium hover:border-red-500/40" style={{ height: 'clamp(32px,4.5vmin,1000px)', padding: '0 clamp(12px,2vmin,1000px)', fontSize: 'clamp(12px,2vmin,1000px)' }}>
            No Blocks
          </Button>
      </div>
    );
  }

  // --- choose_type ---
  if (choiceType === 'choose_type') {
    const typeOptions = (data.options || []) as string[];
    return (
      <div className="mb-3 rounded-xl border border-border/30 bg-card/30" style={{ padding: 'clamp(10px,2vmin,1000px)' }}>
        <h3 className="font-semibold" style={{ fontSize: 'clamp(13px,2.5vmin,1000px)', marginBottom: 'clamp(6px,1vmin,1000px)' }}>{prompt || 'Choose a type'}</h3>
        <div className="flex flex-wrap" style={{ gap: 'clamp(4px,0.8vmin,1000px)' }}>
          {typeOptions.map((t, i) => (
            <Button key={i} variant="secondary" onClick={() => onRespond(choice.requestId, { chosen: t })} className="rounded-lg border bg-card/60 font-medium hover:border-gold/40 hover:bg-gold/10" style={{ height: 'clamp(32px,4.5vmin,1000px)', padding: '0 clamp(10px,2vmin,1000px)', fontSize: 'clamp(12px,2vmin,1000px)' }}>
              {String(t)}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  // --- choose_modes: modal/charm spell mode selection ---
  if (choiceType === 'choose_modes') {
    const modes = (data.modes || []) as Array<{ index: number; description: string }>;
    const min = (data.min as number) ?? 1;
    const max = (data.max as number) ?? 1;
    return (
      <ChooseModesPanel
        prompt={prompt || 'Choose mode'}
        modes={modes}
        min={min}
        max={max}
        requestId={choice.requestId}
        onRespond={onRespond}
      />
    );
  }

  // --- choose_ability / choose_single_spell / choose_spell_abilities ---
  if (['choose_ability', 'choose_single_spell', 'choose_spell_abilities'].includes(choiceType)) {
    const abilities = (data.abilities || []) as LegalPlay[];
    return (
      <div className="mb-3 rounded-xl border border-border/30 bg-card/30" style={{ padding: 'clamp(10px,2vmin,1000px)' }}>
        <h3 className="font-semibold" style={{ fontSize: 'clamp(13px,2.5vmin,1000px)', marginBottom: 'clamp(6px,1vmin,1000px)' }}>{prompt || 'Choose an ability'}</h3>
        <div className="flex flex-wrap" style={{ gap: 'clamp(4px,0.8vmin,1000px)' }}>
          {abilities.map((a) => (
          <Button
              key={a.index}
              onClick={() => onRespond(choice.requestId, { index: a.index })}
              className="rounded-lg border border-border/40 bg-card/60 text-left transition-colors hover:border-gold/40 hover:bg-gold/10"
              style={{ padding: 'clamp(4px,0.8vmin,1000px) clamp(8px,1.5vmin,1000px)', fontSize: 'clamp(11px,2vmin,1000px)' }}
            >
              <span className="font-medium">{a.cardName || 'Ability'}</span>
              <div className="text-muted-foreground/70 max-w-[250px] truncate" style={{ fontSize: 'clamp(9px,1.5vmin,1000px)' }}>{a.description}</div>
            </Button>
          ))}
          {abilities.length === 0 && (
            <Button
              variant="outline"
              onClick={() => onRespond(choice.requestId, { cancel: true })}
              className="rounded-lg border bg-card/60 font-medium hover:border-red-500/40 hover:bg-red-500/10"
              style={{ height: 'clamp(32px,4.5vmin,1000px)', padding: '0 clamp(12px,2vmin,1000px)', fontSize: 'clamp(12px,2vmin,1000px)' }}
            >
              Cancel
            </Button>
          )}
        </div>
      </div>
    );
  }

  // --- play_trigger / put_on_top / scry ---
  if (choiceType === 'play_trigger') {
    return (
      <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/5" style={{ padding: 'clamp(10px,2vmin,1000px)' }}>
        <h3 className="font-semibold" style={{ fontSize: 'clamp(13px,2.5vmin,1000px)', marginBottom: 'clamp(6px,1vmin,1000px)' }}>{prompt || 'Play trigger?'}</h3>
        <div className="flex" style={{ gap: 'clamp(6px,1.2vmin,1000px)' }}>
          <Button onClick={() => onRespond(choice.requestId, { play: true })} className="rounded-lg border bg-card/60 font-medium hover:border-gold/40 hover:bg-gold/10" style={{ height: 'clamp(32px,4.5vmin,1000px)', padding: '0 clamp(12px,2vmin,1000px)', fontSize: 'clamp(12px,2vmin,1000px)' }}>Yes</Button>
          <Button variant="outline" onClick={() => onRespond(choice.requestId, { play: false })} className="rounded-lg border bg-card/60 font-medium hover:border-border/40" style={{ height: 'clamp(32px,4.5vmin,1000px)', padding: '0 clamp(12px,2vmin,1000px)', fontSize: 'clamp(12px,2vmin,1000px)' }}>No</Button>
        </div>
      </div>
    );
  }

  if (choiceType === 'put_on_top') {
    return (
      <div className="mb-3 rounded-xl border border-border/30 bg-card/30" style={{ padding: 'clamp(10px,2vmin,1000px)' }}>
        <h3 className="font-semibold" style={{ fontSize: 'clamp(13px,2.5vmin,1000px)', marginBottom: 'clamp(6px,1vmin,1000px)' }}>{prompt || 'Put on top of library?'}</h3>
        <div className="flex" style={{ gap: 'clamp(6px,1.2vmin,1000px)' }}>
          <Button onClick={() => onRespond(choice.requestId, { onTop: true })} className="rounded-lg border bg-card/60 font-medium hover:border-gold/40 hover:bg-gold/10" style={{ height: 'clamp(32px,4.5vmin,1000px)', padding: '0 clamp(12px,2vmin,1000px)', fontSize: 'clamp(12px,2vmin,1000px)' }}>Top</Button>
          <Button variant="outline" onClick={() => onRespond(choice.requestId, { onTop: false })} className="rounded-lg border bg-card/60 font-medium hover:border-border/40" style={{ height: 'clamp(32px,4.5vmin,1000px)', padding: '0 clamp(12px,2vmin,1000px)', fontSize: 'clamp(12px,2vmin,1000px)' }}>Bottom</Button>
        </div>
      </div>
    );
  }

  // --- mana_payment: interactive land selection for mana cost ---
  if (choiceType === 'mana_payment') {
    const manaCost = (data.manaCost as string) || '?';
    const sources = (data.sources || []) as CardOption[];
    const canCancel = data.canCancel as boolean;
    return (
      <ManaPaymentPanel
        prompt={prompt || `Pay mana: ${manaCost}`}
        manaCost={manaCost}
        sources={sources}
        canCancel={canCancel}
        requestId={choice.requestId}
        onRespond={onRespond}
      />
    );
  }

  // --- Fallback for any unhandled type ---
  return (
    <div className="mb-3 rounded-xl border border-border/30 bg-card/30" style={{ padding: 'clamp(10px,2vmin,1000px)' }}>
      <h3 className="font-semibold" style={{ fontSize: 'clamp(13px,2.5vmin,1000px)', marginBottom: 'clamp(6px,1vmin,1000px)' }}>{prompt || `Choice: ${choiceType}`}</h3>
      <Button variant="outline" onClick={() => onRespond(choice.requestId, { pass: true })} className="rounded-lg border bg-card/60 font-medium hover:border-border/40" style={{ height: 'clamp(32px,4.5vmin,1000px)', padding: '0 clamp(12px,2vmin,1000px)', fontSize: 'clamp(12px,2vmin,1000px)' }}>
        OK / Pass
      </Button>
      <details style={{ marginTop: 'clamp(6px,1vmin,1000px)' }}>
        <summary className="cursor-pointer text-muted-foreground" style={{ fontSize: 'clamp(10px,1.6vmin,1000px)' }}>Raw data</summary>
        <pre className="overflow-auto rounded bg-black/50 text-muted-foreground" style={{ marginTop: 'clamp(3px,0.5vmin,1000px)', maxHeight: 'clamp(80px,15vmin,1000px)', padding: 'clamp(4px,0.8vmin,1000px)', fontSize: 'clamp(9px,1.3vmin,1000px)' }}>
          {JSON.stringify(choice, null, 2)}
        </pre>
      </details>
    </div>
  );
}

// ============================================================
// AutoSkipCombat — auto-responds when no attackers available
// ============================================================

function AutoSkipCombat({ requestId, onRespond }: {
  requestId: string;
  onRespond: (requestId: string, payload: Record<string, unknown>) => void;
}) {
  React.useEffect(() => {
    // Auto-skip combat when no attackers available
    onRespond(requestId, { attackers: [] });
  }, [requestId, onRespond]);
  
  return null; // Don't render anything
}

// ============================================================
// MulliganOverlay — full-screen card art display for mulligan decisions
// ============================================================

function MulliganOverlay({ choice, onRespond }: {
  choice: ForgeChoiceRequest;
  onRespond: (requestId: string, payload: Record<string, unknown>) => void;
}) {
  const data = choice.data as Record<string, unknown>;
  const cardsToReturn = (data.cardsToReturn as number) ?? 0;
  const textHandCards = (data.hand || []) as CardOption[];

  // Look up actual CardInstance objects from the game store for art display
  const gameState = useGameStore((s) => s.gameState);
  const resolvedCards = useMemo(() => {
    if (!gameState) return [];
    // Try to get hand cards from the adapted game state
    const handIds = getCardsInZone(gameState, 'player-human', 'hand');
    const instances = handIds
      .map((id) => gameState.cardInstances.get(id))
      .filter((c): c is CardInstance => !!c);
    if (instances.length > 0) return instances;
    // Fallback: match by name from all card instances
    const nameSet = new Set(textHandCards.map((c) => c.name));
    const matched: CardInstance[] = [];
    for (const [, ci] of gameState.cardInstances) {
      if (nameSet.has(ci.cardData.name) && matched.length < textHandCards.length) {
        matched.push(ci);
      }
    }
    return matched;
  }, [gameState, textHandCards]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-md">
      {/* Header */}
      <div className="flex flex-col items-center" style={{ gap: 'clamp(4px,0.8vmin,1000px)', marginBottom: 'clamp(12px,2.5vmin,1000px)' }}>
        <span className="font-black text-primary tracking-wide" style={{ fontSize: 'clamp(20px,4vmin,1000px)' }}>
          Opening Hand
        </span>
        <span className="text-muted-foreground" style={{ fontSize: 'clamp(12px,2vmin,1000px)' }}>
          {cardsToReturn > 0
            ? `Keep hand? You'll put ${cardsToReturn} card(s) on the bottom.`
            : `${textHandCards.length} cards — Keep this hand or mulligan?`}
        </span>
      </div>

      {/* Card grid */}
      <div className="flex flex-wrap items-center justify-center" style={{ gap: 'clamp(8px,1.5vmin,1000px)', padding: '0 clamp(16px,3vmin,1000px)', marginBottom: 'clamp(16px,3vmin,1000px)' }}>
        {resolvedCards.length > 0 ? (
          resolvedCards.map((card) => (
            <div key={card.instanceId}>
              <CardView card={card} mode="art" interactive={false} />
            </div>
          ))
        ) : (
          // Fallback: text cards if no CardInstance data available
          textHandCards.map((card) => (
            <div
              key={card.id}
              className="rounded-xl border border-border/40 bg-card/80 shadow-sm flex flex-col items-center justify-center"
              style={{ width: 'clamp(90px,12vmin,1000px)', height: 'clamp(126px,17vmin,1000px)', padding: 'clamp(6px,1vmin,1000px)' }}
            >
              <span className="font-semibold text-foreground text-center" style={{ fontSize: 'clamp(10px,1.6vmin,1000px)' }}>{card.name}</span>
              {card.type && <span className="text-muted-foreground text-center" style={{ fontSize: 'clamp(8px,1.2vmin,1000px)' }}>{card.type}</span>}
            </div>
          ))
        )}
      </div>

      {/* Buttons */}
      <div className="flex items-center" style={{ gap: 'clamp(8px,1.5vmin,1000px)' }}>
        <Button
          variant="default"
          style={{ height: 'clamp(36px,5.5vmin,1000px)', padding: '0 clamp(16px,3vmin,1000px)', fontSize: 'clamp(14px,2.5vmin,1000px)', borderRadius: 'clamp(8px,1.2vmin,1000px)' }}
          onClick={() => onRespond(choice.requestId, { keep: true })}
        >
          Keep Hand
        </Button>
        <Button
          variant="outline"
          style={{ height: 'clamp(36px,5.5vmin,1000px)', padding: '0 clamp(16px,3vmin,1000px)', fontSize: 'clamp(14px,2.5vmin,1000px)', borderRadius: 'clamp(8px,1.2vmin,1000px)' }}
          onClick={() => onRespond(choice.requestId, { keep: false })}
        >
          Mulligan
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// DeclareAttackersPanel — select creatures to attack with
// Properly formats response for backend: { attackers: [{ cardId, defenderId? }] }
// ============================================================

function DeclareAttackersPanel({ attackers, defenders, defaultDefenderId, requestId, onRespond }: {
  attackers: CardOption[];
  defenders: CardOption[];
  defaultDefenderId: number;
  requestId: string;
  onRespond: (requestId: string, payload: Record<string, unknown>) => void;
}) {
  const [selected, setSelected] = React.useState<Set<number>>(new Set());

  const toggle = (id: number) => {
    setSelected((prev: Set<number>) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirmAttack = () => {
    const attackerDecls = Array.from(selected).map((cardId) => ({
      cardId,
      defenderId: defaultDefenderId,
    }));
    onRespond(requestId, { attackers: attackerDecls });
  };

  const skipCombat = () => {
    onRespond(requestId, { attackers: [] });
  };

  return (
    <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/5" style={{ padding: 'clamp(10px,2vmin,1000px)' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 'clamp(8px,1.5vmin,1000px)' }}>
        <span className="font-semibold text-red-400" style={{ fontSize: 'clamp(13px,2.5vmin,1000px)' }}>Declare Attackers</span>
        {defenders.length > 1 && (
          <span className="text-muted-foreground" style={{ fontSize: 'clamp(11px,2vmin,1000px)' }}>
            Attacking: {defenders.find(d => d.id === defaultDefenderId)?.name || 'Opponent'}
          </span>
        )}
      </div>
      <p className="text-muted-foreground" style={{ fontSize: 'clamp(11px,2vmin,1000px)', marginBottom: 'clamp(6px,1vmin,1000px)' }}>
        Select creatures to attack with ({selected.size} selected)
      </p>
      <div className="flex flex-wrap" style={{ gap: 'clamp(4px,0.8vmin,1000px)', marginBottom: 'clamp(8px,1.5vmin,1000px)' }}>
        {attackers.map((att) => (
          <Button
            key={att.id}
            onClick={() => toggle(att.id)}
            className={`rounded-lg border text-left transition-colors ${
              selected.has(att.id)
                ? 'border-red-400/60 bg-red-400/15 text-red-300 ring-1 ring-red-400/40'
                : 'border-border/40 bg-card/60 hover:border-red-500/30 hover:bg-red-500/10 text-foreground'
            }`}
            style={{ padding: 'clamp(4px,0.8vmin,1000px) clamp(8px,1.5vmin,1000px)', fontSize: 'clamp(11px,2vmin,1000px)' }}
          >
            {att.name}
            {att.power !== undefined && <span className="ml-1 text-muted-foreground">{att.power}/{att.toughness}</span>}
          </Button>
        ))}
      </div>
      <div className="flex" style={{ gap: 'clamp(6px,1.2vmin,1000px)' }}>
        <Button
          onClick={confirmAttack}
          disabled={selected.size === 0}
          className="rounded-lg border bg-red-600 font-medium hover:bg-red-700 text-white disabled:opacity-50 disabled:hover:bg-red-600"
          style={{ height: 'clamp(32px,4.5vmin,1000px)', padding: '0 clamp(12px,2vmin,1000px)', fontSize: 'clamp(12px,2vmin,1000px)' }}
        >
          Attack with {selected.size} Creature{selected.size !== 1 ? 's' : ''}
        </Button>
        <Button
          variant="outline"
          onClick={skipCombat}
          className="rounded-lg border bg-card/60 font-medium hover:border-border/40"
          style={{ height: 'clamp(32px,4.5vmin,1000px)', padding: '0 clamp(12px,2vmin,1000px)', fontSize: 'clamp(12px,2vmin,1000px)' }}
        >
          Skip Combat
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// ManaPaymentPanel — interactive land selection for paying mana
// Backend expects one cardId per response (loops asking for lands one at a time)
// ============================================================

function ManaPaymentPanel({ prompt, manaCost, sources, canCancel, requestId, onRespond }: {
  prompt: string;
  manaCost: string;
  sources: CardOption[];
  canCancel: boolean;
  requestId: string;
  onRespond: (requestId: string, payload: Record<string, unknown>) => void;
}) {
  // Tap a single land - backend will loop and ask again if more mana needed
  const tapLand = (cardId: number) => {
    onRespond(requestId, { cardId });
  };

  const cancel = () => {
    onRespond(requestId, { cancel: true });
  };

  return (
    <div className="mb-3 rounded-xl border border-emerald-500/40 bg-emerald-500/5" style={{ padding: 'clamp(10px,2vmin,1000px)' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 'clamp(8px,1.5vmin,1000px)' }}>
        <span className="font-semibold text-emerald-400" style={{ fontSize: 'clamp(13px,2.5vmin,1000px)' }}>Pay Mana Cost</span>
        <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 font-mono text-emerald-300" style={{ padding: 'clamp(2px,0.4vmin,1000px) clamp(6px,1vmin,1000px)', fontSize: 'clamp(11px,2vmin,1000px)' }}>
          {manaCost}
        </span>
      </div>
      <p className="text-muted-foreground" style={{ fontSize: 'clamp(11px,2vmin,1000px)', marginBottom: 'clamp(8px,1.5vmin,1000px)' }}>
        Click a land to tap it for mana. Continue until cost is paid.
      </p>
      {sources.length > 0 ? (
        <div className="flex flex-wrap" style={{ gap: 'clamp(4px,0.8vmin,1000px)', marginBottom: 'clamp(8px,1.5vmin,1000px)' }}>
          {sources.map((src) => (
            <Button
              key={src.id}
              onClick={() => tapLand(src.id)}
              className="rounded-lg border border-border/40 bg-card/80 text-left transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-300"
              style={{ padding: 'clamp(4px,0.8vmin,1000px) clamp(8px,1.5vmin,1000px)', fontSize: 'clamp(11px,2vmin,1000px)' }}
            >
              <div className="font-medium">{src.name}</div>
              {src.type && <div className="text-muted-foreground" style={{ fontSize: 'clamp(9px,1.5vmin,1000px)' }}>{src.type}</div>}
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-amber-400" style={{ fontSize: 'clamp(11px,2vmin,1000px)', marginBottom: 'clamp(8px,1.5vmin,1000px)' }}>No untapped mana sources available!</p>
      )}
      {canCancel && (
        <Button variant="outline" onClick={cancel} className="rounded-lg border bg-card/60 font-medium hover:border-red-500/40 hover:bg-red-500/10" style={{ height: 'clamp(32px,4.5vmin,1000px)', padding: '0 clamp(12px,2vmin,1000px)', fontSize: 'clamp(12px,2vmin,1000px)' }}>
          Cancel Spell
        </Button>
      )}
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

  // separate named function to avoid stale closure lint warnings
  const skipOrCancel = () => {
    if (formatResponse) {
      onRespond(requestId, formatResponse([]));
    } else {
      onRespond(requestId, { [responseKey]: arrayKeys.has(responseKey) ? [] : null });
    }
  };

  const canSkip = min === 0;
  const hasOptions = options.length > 0;

  return (
    <div className="mb-3 rounded-xl border border-border/30 bg-card/30" style={{ padding: 'clamp(10px,2vmin,1000px)' }}>
      <h3 className="font-semibold" style={{ fontSize: 'clamp(13px,2.5vmin,1000px)', marginBottom: 'clamp(6px,1vmin,1000px)' }}>{prompt}</h3>
      {!isSingle && hasOptions && (
        <p className="text-muted-foreground" style={{ fontSize: 'clamp(11px,2vmin,1000px)', marginBottom: 'clamp(6px,1vmin,1000px)' }}>Select {min === max ? min : `${min}-${max}`} · {selected.size} selected</p>
      )}
      {hasOptions ? (
        <div className="flex flex-wrap" style={{ gap: 'clamp(4px,0.8vmin,1000px)', marginBottom: 'clamp(8px,1.5vmin,1000px)' }}>
          {options.map((opt) => (
          <Button
            key={opt.id}
            onClick={() => toggle(opt.id)}
            className={`rounded-lg border text-left transition-colors ${
              selected.has(opt.id)
                ? 'border-gold/60 bg-gold/15 text-gold'
                : 'border-border/40 bg-card/60 hover:border-border text-foreground'
            }`}
            style={{ padding: 'clamp(4px,0.8vmin,1000px) clamp(8px,1.5vmin,1000px)', fontSize: 'clamp(11px,2vmin,1000px)' }}
          >
            {opt.name}
            {opt.power !== undefined && <span className="ml-1 text-muted-foreground">{opt.power}/{opt.toughness}</span>}
            {opt.type === 'player' && <span className="ml-1 text-muted-foreground">(Life: {opt.life})</span>}
          </Button>
          ))}
        </div>
      ) : (
        <p className="text-amber-400" style={{ fontSize: 'clamp(11px,2vmin,1000px)', marginBottom: 'clamp(8px,1.5vmin,1000px)' }}>No valid options available.</p>
      )}
      <div className="flex" style={{ gap: 'clamp(6px,1.2vmin,1000px)' }}>
        {!isSingle && (
          <Button disabled={selected.size < min} onClick={confirm} className="rounded-lg border bg-gold font-medium hover:bg-gold/90 disabled:opacity-50 disabled:hover:bg-gold" style={{ height: 'clamp(32px,4.5vmin,1000px)', padding: '0 clamp(12px,2vmin,1000px)', fontSize: 'clamp(12px,2vmin,1000px)' }}>
            Confirm ({selected.size})
          </Button>
        )}
        {(canSkip || !hasOptions) && (
          <Button variant="outline" onClick={skipOrCancel} className="rounded-lg border bg-card/60 font-medium hover:border-border/40" style={{ height: 'clamp(32px,4.5vmin,1000px)', padding: '0 clamp(12px,2vmin,1000px)', fontSize: 'clamp(12px,2vmin,1000px)' }}>
            {canSkip ? 'Skip' : 'Cancel'}
          </Button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// ChooseModesPanel — modal/charm spell mode selection
// ============================================================

function ChooseModesPanel({ prompt, modes, min, max, requestId, onRespond }: {
  prompt: string;
  modes: Array<{ index: number; description: string }>;
  min: number;
  max: number;
  requestId: string;
  onRespond: (requestId: string, payload: Record<string, unknown>) => void;
}) {
  const isMulti = max > 1;
  const [modeSelected, setModeSelected] = React.useState<Set<number>>(new Set());

  const toggleMode = (idx: number) => {
    if (!isMulti) {
      onRespond(requestId, { indices: [idx] });
      return;
    }
    setModeSelected((prev: Set<number>) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else if (next.size < max) next.add(idx);
      return next;
    });
  };

  const confirmModes = () => {
    onRespond(requestId, { indices: Array.from(modeSelected) });
  };

  return (
    <div className="mb-3 rounded-xl border border-border/30 bg-card/30" style={{ padding: 'clamp(10px,2vmin,1000px)' }}>
      <h3 className="font-semibold" style={{ fontSize: 'clamp(13px,2.5vmin,1000px)', marginBottom: 'clamp(6px,1vmin,1000px)' }}>{prompt}</h3>
      {isMulti && (
        <p className="text-muted-foreground" style={{ fontSize: 'clamp(11px,2vmin,1000px)', marginBottom: 'clamp(6px,1vmin,1000px)' }}>
          Choose {min === max ? min : `${min}–${max}`} · {modeSelected.size} selected
        </p>
      )}
      <div className="flex flex-col" style={{ gap: 'clamp(4px,0.8vmin,1000px)', marginBottom: 'clamp(8px,1.5vmin,1000px)' }}>
        {modes.map((m) => (
          <Button
            key={m.index}
            onClick={() => toggleMode(m.index)}
            className={`rounded-lg border text-left transition-colors ${
              modeSelected.has(m.index)
                ? 'border-gold/60 bg-gold/15 text-gold'
                : 'border-border/40 bg-card/60 hover:border-gold/40 hover:bg-gold/10 text-foreground'
            }`}
            style={{ padding: 'clamp(4px,0.8vmin,1000px) clamp(8px,1.5vmin,1000px)', fontSize: 'clamp(11px,2vmin,1000px)' }}
          >
            {m.description}
          </Button>
        ))}
      </div>
      {isMulti && (
        <Button
          disabled={modeSelected.size < min}
          onClick={confirmModes}
          className="rounded-lg border bg-gold font-medium hover:bg-gold/90 disabled:opacity-50"
          style={{ height: 'clamp(32px,4.5vmin,1000px)', padding: '0 clamp(12px,2vmin,1000px)', fontSize: 'clamp(12px,2vmin,1000px)' }}
        >
          Confirm ({modeSelected.size})
        </Button>
      )}
    </div>
  );
}
