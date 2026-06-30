'use client';

import React, { useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useForgeGameStore } from '@/store/forgeGameStore';
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
  // mana_payment is handled inline by GameBoard (land highlighting + cancel banner) — no overlay needed
  if (pendingChoice.choiceType === 'mana_payment') return null;

  // Render as a centered modal overlay for better visibility
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      {/* Semi-transparent backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto" />
      {/* Modal content - key forces re-mount when requestId changes */}
      <div key={pendingChoice.requestId} className="relative z-10 w-full max-w-xl mx-4 pointer-events-auto">
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
              onClick={() => onRespond(choice.requestId, { pass: true })}
              className="h-7 gap-1.5 px-4 text-xs font-semibold bg-gold text-gold-foreground hover:bg-gold/90 rounded-lg border border-border/40"
            >
              Pass
            </Button>
          )}
        </div>

        {legalPlays.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {legalPlays.map((play) => (
              
          <Button
                key={play.index}
                onClick={() => onRespond(choice.requestId, { abilityIndex: play.index })}
                className="rounded-lg border border-border/40 bg-card/60 px-3 py-1.5 text-xs text-left transition-colors hover:border-gold/40 hover:bg-gold/10"
              >
                <span className="font-medium text-foreground">{play.cardName || 'Ability'}</span>
                <span className="ml-1 text-muted-foreground">{play.isSpell ? '(spell)' : play.isAbility ? '(ability)' : ''}</span>
                <div className="text-[10px] text-muted-foreground/70 max-w-[200px] truncate">{play.description}</div>
              </Button>
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
      <div className="mb-3 flex flex-col items-center gap-4 rounded-xl border border-primary/40 bg-primary/5 px-6 py-4 max-w-2xl">
        <span className="text-sm font-semibold text-primary">Mulligan Phase</span>
        <span className="text-xs text-muted-foreground">
          {cardsToReturn > 0
            ? `Keep hand? You'll put ${cardsToReturn} card(s) on the bottom.`
            : 'Review your opening hand below. Keep or mulligan?'}
        </span>
        {/* Display hand cards as preview */}
        {handCards.length > 0 && (
          <div className="w-full">
            <p className="text-xs text-muted-foreground mb-2 text-center">Your Hand ({handCards.length} cards):</p>
            <div className="flex flex-wrap justify-center gap-2">
              {handCards.map((card) => (
                <div
                  key={card.id}
                  className="rounded-lg border border-border/40 bg-card/80 px-3 py-2 text-xs shadow-sm"
                >
                  <div className="font-medium text-foreground">{card.name}</div>
                  {card.type && <div className="text-[10px] text-muted-foreground">{card.type}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-3">
          <Button size="sm" onClick={() => onRespond(choice.requestId, { keep: true })} className="px-4 h-8 rounded-lg border bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90">
            Keep Hand
          </Button>
          <Button variant="outline" size="sm" onClick={() => onRespond(choice.requestId, { keep: false })} className="px-4 h-8 rounded-lg border bg-card/60 text-xs font-medium hover:border-primary/60">
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
          <Button size="sm" onClick={() => onRespond(choice.requestId, { confirmed: true })} className="px-4 h-8 rounded-lg border bg-card/60 text-xs font-medium hover:border-gold/40 hover:bg-gold/10">Yes</Button>
          <Button variant="outline" size="sm" onClick={() => onRespond(choice.requestId, { confirmed: false })} className="px-4 h-8 rounded-lg border bg-card/60 text-xs font-medium hover:border-border/40">No</Button>
        </div>
      </div>
    );
  }

  // --- choose_cards / choose_discard / choose_permanents_sacrifice / choose_permanents_destroy / choose_single_entity / choose_entities / choose_cards_zone ---
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
      <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
        <h3 className="text-sm font-semibold text-red-400 mb-2">Declare Blockers</h3>
        {blockers.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {blockers.map((b) => (
              
          <Button key={b.id} className="rounded-lg border border-border/40 bg-card/60 px-3 py-1.5 text-xs hover:border-red-500/40 hover:bg-red-500/10">
                {b.name} {b.power !== undefined ? `${b.power}/${b.toughness}` : ''}
              </Button>
            ))}
          </div>
        ) : null}
          <Button size="sm" variant="outline" onClick={() => onRespond(choice.requestId, { blocks: [] })} className="px-4 h-8 rounded-lg border bg-card/60 text-xs font-medium hover:border-red-500/40">
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
            <Button key={i} size="sm" variant="secondary" onClick={() => onRespond(choice.requestId, { chosen: t })} className="px-3 h-8 rounded-lg border bg-card/60 text-xs font-medium hover:border-gold/40 hover:bg-gold/10">
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
            
          <Button
              key={a.index}
              onClick={() => onRespond(choice.requestId, { index: a.index })}
              className="rounded-lg border border-border/40 bg-card/60 px-3 py-1.5 text-xs text-left transition-colors hover:border-gold/40 hover:bg-gold/10"
            >
              <span className="font-medium">{a.cardName || 'Ability'}</span>
              <div className="text-[10px] text-muted-foreground/70 max-w-[250px] truncate">{a.description}</div>
            </Button>
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
          <Button size="sm" onClick={() => onRespond(choice.requestId, { play: true })} className="px-4 h-8 rounded-lg border bg-card/60 text-xs font-medium hover:border-gold/40 hover:bg-gold/10">Yes</Button>
          <Button variant="outline" size="sm" onClick={() => onRespond(choice.requestId, { play: false })} className="px-4 h-8 rounded-lg border bg-card/60 text-xs font-medium hover:border-border/40">No</Button>
        </div>
      </div>
    );
  }

  if (choiceType === 'put_on_top') {
    return (
      <div className="mb-3 rounded-xl border border-border/30 bg-card/30 p-4">
        <h3 className="text-sm font-semibold mb-2">{prompt || 'Put on top of library?'}</h3>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onRespond(choice.requestId, { onTop: true })} className="px-4 h-8 rounded-lg border bg-card/60 text-xs font-medium hover:border-gold/40 hover:bg-gold/10">Top</Button>
          <Button variant="outline" size="sm" onClick={() => onRespond(choice.requestId, { onTop: false })} className="px-4 h-8 rounded-lg border bg-card/60 text-xs font-medium hover:border-border/40">Bottom</Button>
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
    <div className="mb-3 rounded-xl border border-border/30 bg-card/30 p-4">
      <h3 className="text-sm font-semibold mb-2">{prompt || `Choice: ${choiceType}`}</h3>
      <Button size="sm" variant="outline" onClick={() => onRespond(choice.requestId, { pass: true })} className="px-4 h-8 rounded-lg border bg-card/60 text-xs font-medium hover:border-border/40">
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
    <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-red-400">Declare Attackers</span>
        {defenders.length > 1 && (
          <span className="text-xs text-muted-foreground">
            Attacking: {defenders.find(d => d.id === defaultDefenderId)?.name || 'Opponent'}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-2">
        Select creatures to attack with ({selected.size} selected)
      </p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {attackers.map((att) => (
          <Button
            key={att.id}
            onClick={() => toggle(att.id)}
            className={`rounded-lg border px-3 py-1.5 text-xs text-left transition-colors ${
              selected.has(att.id)
                ? 'border-red-400/60 bg-red-400/15 text-red-300 ring-1 ring-red-400/40'
                : 'border-border/40 bg-card/60 hover:border-red-500/30 hover:bg-red-500/10 text-foreground'
            }`}
          >
            {att.name}
            {att.power !== undefined && <span className="ml-1 text-muted-foreground">{att.power}/{att.toughness}</span>}
          </Button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={confirmAttack}
          disabled={selected.size === 0}
          className="px-4 h-8 rounded-lg border bg-red-600 text-xs font-medium hover:bg-red-700 text-white disabled:opacity-50 disabled:hover:bg-red-600"
        >
          Attack with {selected.size} Creature{selected.size !== 1 ? 's' : ''}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={skipCombat}
          className="px-4 h-8 rounded-lg border bg-card/60 text-xs font-medium hover:border-border/40"
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
    <div className="mb-3 rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4 max-w-lg">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-emerald-400">Pay Mana Cost</span>
        <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-mono text-emerald-300">
          {manaCost}
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Click a land to tap it for mana. Continue until cost is paid.
      </p>
      {sources.length > 0 ? (
        <div className="flex flex-wrap gap-2 mb-3">
          {sources.map((src) => (
            <Button
              key={src.id}
              onClick={() => tapLand(src.id)}
              className="rounded-lg border border-border/40 bg-card/80 px-3 py-2 text-xs text-left transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-300"
            >
              <div className="font-medium">{src.name}</div>
              {src.type && <div className="text-[10px] text-muted-foreground">{src.type}</div>}
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-amber-400 mb-3">No untapped mana sources available!</p>
      )}
      {canCancel && (
        <Button size="sm" variant="outline" onClick={cancel} className="px-4 h-8 rounded-lg border bg-card/60 text-xs font-medium hover:border-red-500/40 hover:bg-red-500/10">
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

  return (
    <div className="mb-3 rounded-xl border border-border/30 bg-card/30 p-4">
      <h3 className="text-sm font-semibold mb-2">{prompt}</h3>
      {!isSingle && (
        <p className="text-xs text-muted-foreground mb-2">Select {min === max ? min : `${min}-${max}`} · {selected.size} selected</p>
      )}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {options.map((opt) => (
          
          <Button
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
          </Button>
        ))}
      </div>
      {!isSingle && (
        <div className="flex gap-2">
          <Button size="sm" disabled={selected.size < min} onClick={confirm} className="px-4 h-8 rounded-lg border bg-gold text-xs font-medium hover:bg-gold/90 disabled:opacity-50 disabled:hover:bg-gold">
            Confirm ({selected.size})
          </Button>
          {min === 0 && (
            <Button size="sm" variant="outline" onClick={() => onRespond(requestId, { [responseKey]: [] })} className="px-4 h-8 rounded-lg border bg-card/60 text-xs font-medium hover:border-border/40">
              Skip
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
