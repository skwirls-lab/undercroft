'use client';

import React, { useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useForgeGameStore } from '@/store/forgeGameStore';
import { useGameStore } from '@/store/gameStore';
import { CardView } from './CardView';
import { getCardsInZone } from '@/lib/ZoneManager';
import type { CardInstance } from '@/lib/gameTypes';
import type { ForgeChoiceRequest } from '@/lib/forgeClient';
import type { PendingAbilitySelection } from '@/store/forgeGameStore';
import type { GameAction } from '@/lib/gameTypes';

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

interface ColorOption {
  mask: number;
  name: string;
  symbol: string;
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
  const { pendingChoice, respondToChoice, pendingAbilitySelection, setPendingAbilitySelection } =
    useForgeGameStore();
  const performAction = useGameStore((s) => s.performAction);

  // A server prompt always outranks a local pick. Otherwise, if one card offered several
  // legal plays, ask which mode before committing — previously the first was taken silently.
  if (!pendingChoice && pendingAbilitySelection) {
    return (
      <div className="pointer-events-auto">
        <AbilitySelectionPanel
          selection={pendingAbilitySelection}
          onPick={(action) => {
            setPendingAbilitySelection(null);
            performAction(action);
          }}
          onCancel={() => setPendingAbilitySelection(null)}
        />
      </div>
    );
  }

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
      <div key={pendingChoice.requestId} className="relative z-10 w-full mx-4 pointer-events-auto overflow-y-auto" style={{ maxWidth: 'clamp(400px,80vmin,1200px)', maxHeight: '90vh' }}>
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

  // --- choose_cards / choose_discard / choose_permanents_sacrifice / choose_permanents_destroy / choose_single_entity / choose_single_card_zone / choose_entities / choose_cards_zone ---
  if (['choose_cards', 'choose_discard', 'choose_permanents_sacrifice',
       'choose_permanents_destroy', 'choose_single_entity', 'choose_single_card_zone',
       'choose_entities', 'choose_cards_zone'].includes(choiceType)) {
    const cardOptions = (data.options || data.cards || []) as CardOption[];
    const min = (data.min as number) ?? (data.optional ? 0 : 1);
    const max = (data.max as number) ?? cardOptions.length;
    const isSingle = choiceType === 'choose_single_entity' || choiceType === 'choose_single_card_zone';
    // The response key is NOT implied by single-selection. choose_single_entity is read as
    // `entityId` (scalar) by the server, but choose_single_card_zone — every tutor/fetch —
    // is read as `selectedIds` (array). Sending entityId for it made the server fall through
    // to fetchList.get(0), silently discarding the player's pick.
    const singleResponseKey = choiceType === 'choose_single_entity' ? 'entityId' : 'selectedIds';
    return (
      <CardSelectPanel
        prompt={prompt || `Choose ${isSingle ? 'one' : `${min}-${max}`}`}
        options={cardOptions}
        min={isSingle ? 1 : min}
        max={isSingle ? 1 : max}
        requestId={choice.requestId}
        onRespond={onRespond}
        responseKey={isSingle ? singleResponseKey : choiceType === 'choose_entities' ? 'entityIds' : 'selectedIds'}
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
        canCancel
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
    // The blocker buttons previously had no onClick at all, and the panel ignored
    // data.attackers entirely — so the only reachable outcome was "No Blocks" and the player
    // could never block. DeclareBlockersPanel pairs a blocker with an attacker and sends the
    // {blocks:[{blockerId, attackerId}]} shape the server actually parses.
    return (
      <DeclareBlockersPanel
        blockers={(data.possibleBlockers || []) as CardOption[]}
        attackers={(data.attackers || []) as CardOption[]}
        requestId={choice.requestId}
        onRespond={onRespond}
      />
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
    // choose_ability and choose_single_spell are read as a scalar `index`, but
    // choose_spell_abilities is read as an `indices` array. Sending `index` for it meant the
    // server never saw a selection and silently auto-picked the first `num` abilities.
    const abilityResponse = (index: number): Record<string, unknown> =>
      choiceType === 'choose_spell_abilities' ? { indices: [index] } : { index };
    // Cancel sends index -1, not {cancel:true}: the server has no `cancel` handling here, and
    // with no `index` key at all it defaults to 0 and plays ability 0. getAbilityToPlay
    // bounds-checks and returns null for -1, which is a genuine "chose nothing".
    return (
      <div className="mb-3 rounded-xl border border-border/30 bg-card/30" style={{ padding: 'clamp(10px,2vmin,1000px)' }}>
        <h3 className="font-semibold" style={{ fontSize: 'clamp(13px,2.5vmin,1000px)', marginBottom: 'clamp(6px,1vmin,1000px)' }}>{prompt || 'Choose an ability'}</h3>
        <div className="flex flex-wrap" style={{ gap: 'clamp(4px,0.8vmin,1000px)' }}>
          {abilities.map((a) => (
          <Button
              key={a.index}
              onClick={() => onRespond(choice.requestId, abilityResponse(a.index))}
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
              onClick={() => onRespond(choice.requestId, { index: -1 })}
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

  // --- scry: choose cards to put on bottom ---
  if (choiceType === 'scry') {
    // arrangeForScry reads `bottomIds`; sending selectedIds made scry — and surveil, which
    // delegates to the same server handler — a no-op that always kept every card on top.
    const cards = (data.cards || []) as CardOption[];
    return (
      <CardSelectPanel
        prompt={prompt || 'Scry: Choose cards to put on bottom'}
        options={cards}
        min={0}
        max={cards.length}
        requestId={choice.requestId}
        onRespond={onRespond}
        responseKey="bottomIds"
      />
    );
  }

  // --- choose_order: damage assignment order, zone-move order ---
  if (choiceType === 'choose_order') {
    return (
      <OrderCardsPanel
        prompt={prompt || 'Choose an order'}
        cards={(data.cards || []) as CardOption[]}
        requestId={choice.requestId}
        onRespond={onRespond}
      />
    );
  }

  // --- announce_number: X costs, multikicker, "choose a number" on cast ---
  // Without this renderer the prompt fell through to the generic panel, which replies
  // {pass:true}; announceRequirements then reads no `value` and returns 0, so EVERY X spell
  // resolved with X = 0.
  if (choiceType === 'announce_number') {
    return (
      <AnnounceNumberPanel
        prompt={prompt || 'Choose a value'}
        description={(data.abilityDescription as string) || ''}
        min={(data.min as number) ?? 0}
        max={(data.max as number) ?? undefined}
        requestId={choice.requestId}
        onRespond={onRespond}
      />
    );
  }

  // --- choose_binary: tap/untap, play/draw, heads/tails, top/bottom ---
  if (choiceType === 'choose_binary') {
    return (
      <BinaryChoicePanel
        prompt={prompt || 'Choose'}
        kind={(data.choiceType as string) || ''}
        requestId={choice.requestId}
        onRespond={onRespond}
      />
    );
  }

  // --- choose_color: "add one mana of any color", protection, etc. ---
  if (choiceType === 'choose_color') {
    const colors = (data.colors || []) as ColorOption[];
    return (
      <ColorChoicePanel
        prompt={prompt || 'Choose a color'}
        colors={colors}
        requestId={choice.requestId}
        onRespond={onRespond}
      />
    );
  }

  // --- assign_combat_damage: allocate damage across multiple blockers ---
  if (choiceType === 'assign_combat_damage') {
    return (
      <AssignDamagePanel
        prompt={prompt || `Assign ${data.totalDamage ?? 0} damage`}
        attackerName={(data.attackerName as string) || 'Attacker'}
        totalDamage={(data.totalDamage as number) ?? 0}
        blockers={(data.blockers || []) as CardOption[]}
        requestId={choice.requestId}
        onRespond={onRespond}
      />
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
  // This is a BUG, not a normal state. The server is blocked on a decision this client cannot
  // render; replying {pass:true} carries no key any handler reads, so the engine falls back to
  // a hardcoded default and the mechanic silently does nothing. Make that loud rather than
  // dressing it up as a normal "OK" button.
  console.error(
    `[ForgeChoiceOverlay] UNIMPLEMENTED PROMPT: "${choiceType}" has no renderer. ` +
    `Responding will let the server apply a silent default. Payload:`, choice
  );
  return (
    <div className="mb-3 rounded-xl border border-red-500/60 bg-red-500/10" style={{ padding: 'clamp(10px,2vmin,1000px)' }}>
      <h3 className="font-semibold text-red-400" style={{ fontSize: 'clamp(13px,2.5vmin,1000px)', marginBottom: 'clamp(4px,0.8vmin,1000px)' }}>
        Unimplemented prompt: {choiceType}
      </h3>
      <p className="text-red-300/80" style={{ fontSize: 'clamp(10px,1.7vmin,1000px)', marginBottom: 'clamp(6px,1vmin,1000px)' }}>
        {prompt ? `"${prompt}" — ` : ''}this client has no UI for this decision. Continuing lets
        the engine apply a default, which usually means the card does nothing.
      </p>
      <Button variant="outline" onClick={() => onRespond(choice.requestId, { pass: true })} className="rounded-lg border border-red-500/40 bg-card/60 font-medium hover:border-red-500/60" style={{ height: 'clamp(32px,4.5vmin,1000px)', padding: '0 clamp(12px,2vmin,1000px)', fontSize: 'clamp(12px,2vmin,1000px)' }}>
        Continue with default
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
// AbilitySelectionPanel — pick which mode of a card to play
// Local only: the server sent one legalPlay per mode, all for the same card.
// ============================================================

function AbilitySelectionPanel({ selection, onPick, onCancel }: {
  selection: PendingAbilitySelection;
  onPick: (action: GameAction) => void;
  onCancel: () => void;
}) {
  return (
    <div className="mb-3 rounded-xl border border-gold/40 bg-card/40" style={{ padding: 'clamp(10px,2vmin,1000px)' }}>
      <h3 className="font-semibold" style={{ fontSize: 'clamp(13px,2.5vmin,1000px)', marginBottom: 'clamp(6px,1vmin,1000px)' }}>
        How do you want to play {selection.cardName}?
      </h3>
      <div className="flex flex-wrap" style={{ gap: 'clamp(4px,0.8vmin,1000px)', marginBottom: 'clamp(8px,1.5vmin,1000px)' }}>
        {selection.actions.map((action, i) => (
          <Button
            key={`${action.payload.forgeAbilityIndex ?? i}`}
            onClick={() => onPick(action)}
            className="rounded-lg border border-border/40 bg-card/60 text-left hover:border-gold/40 hover:bg-gold/10"
            style={{ padding: 'clamp(4px,0.8vmin,1000px) clamp(8px,1.5vmin,1000px)', fontSize: 'clamp(11px,2vmin,1000px)', maxWidth: 'clamp(200px,32vmin,1000px)' }}
          >
            <span className="block truncate">
              {(action.payload.forgeDescription as string) || action.type.replace(/_/g, ' ').toLowerCase()}
            </span>
          </Button>
        ))}
      </div>
      <Button
        variant="outline"
        onClick={onCancel}
        className="rounded-lg border bg-card/60 font-medium hover:border-border/40"
        style={{ height: 'clamp(32px,4.5vmin,1000px)', padding: '0 clamp(12px,2vmin,1000px)', fontSize: 'clamp(12px,2vmin,1000px)' }}
      >
        Cancel
      </Button>
    </div>
  );
}

// ============================================================
// OrderCardsPanel — put cards in a sequence by clicking them in order
// Click-to-sequence rather than drag: it works on touch and needs no library.
// ============================================================

function OrderCardsPanel({ prompt, cards, requestId, onRespond }: {
  prompt: string;
  cards: CardOption[];
  requestId: string;
  onRespond: (requestId: string, payload: Record<string, unknown>) => void;
}) {
  const [order, setOrder] = React.useState<number[]>([]);

  const toggle = (id: number) => {
    setOrder((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const remaining = cards.filter((c) => !order.includes(c.id));
  const label = (c: CardOption) =>
    `${c.name}${c.power !== undefined ? ` ${c.power}/${c.toughness}` : ''}`;

  return (
    <div className="mb-3 rounded-xl border border-gold/40 bg-card/40" style={{ padding: 'clamp(10px,2vmin,1000px)' }}>
      <h3 className="font-semibold" style={{ fontSize: 'clamp(13px,2.5vmin,1000px)', marginBottom: 'clamp(2px,0.4vmin,1000px)' }}>{prompt}</h3>
      <div className="text-muted-foreground/80" style={{ fontSize: 'clamp(10px,1.7vmin,1000px)', marginBottom: 'clamp(6px,1vmin,1000px)' }}>
        Click cards in the order you want. {remaining.length} left to place.
      </div>

      {order.length > 0 && (
        <div className="flex flex-wrap" style={{ gap: 'clamp(4px,0.8vmin,1000px)', marginBottom: 'clamp(6px,1vmin,1000px)' }}>
          {order.map((id, i) => {
            const c = cards.find((x) => x.id === id);
            if (!c) return null;
            return (
              <Button
                key={id}
                onClick={() => toggle(id)}
                className="rounded-lg border border-gold/50 bg-gold/15 hover:bg-gold/25"
                style={{ padding: 'clamp(4px,0.8vmin,1000px) clamp(8px,1.5vmin,1000px)', fontSize: 'clamp(11px,2vmin,1000px)' }}
              >
                {i + 1}. {label(c)}
              </Button>
            );
          })}
        </div>
      )}

      {remaining.length > 0 && (
        <div className="flex flex-wrap" style={{ gap: 'clamp(4px,0.8vmin,1000px)', marginBottom: 'clamp(8px,1.5vmin,1000px)' }}>
          {remaining.map((c) => (
            <Button
              key={c.id}
              onClick={() => toggle(c.id)}
              className="rounded-lg border border-border/40 bg-card/60 hover:border-gold/40 hover:bg-gold/10"
              style={{ padding: 'clamp(4px,0.8vmin,1000px) clamp(8px,1.5vmin,1000px)', fontSize: 'clamp(11px,2vmin,1000px)' }}
            >
              {label(c)}
            </Button>
          ))}
        </div>
      )}

      <Button
        disabled={remaining.length > 0}
        onClick={() => onRespond(requestId, { orderedIds: order })}
        className="rounded-lg border border-gold/40 bg-gold/15 font-medium hover:bg-gold/25 disabled:opacity-40"
        style={{ height: 'clamp(32px,4.5vmin,1000px)', padding: '0 clamp(12px,2vmin,1000px)', fontSize: 'clamp(12px,2vmin,1000px)' }}
      >
        {remaining.length > 0 ? `Place ${remaining.length} more` : 'Confirm order'}
      </Button>
    </div>
  );
}

// ============================================================
// DeclareBlockersPanel — assign each blocker to an attacker
// ============================================================

function DeclareBlockersPanel({ blockers, attackers, requestId, onRespond }: {
  blockers: CardOption[];
  attackers: CardOption[];
  requestId: string;
  onRespond: (requestId: string, payload: Record<string, unknown>) => void;
}) {
  // blockerId -> attackerId
  const [blocks, setBlocks] = React.useState<Record<number, number>>({});
  const [activeBlocker, setActiveBlocker] = React.useState<number | null>(null);

  const label = (c: CardOption) =>
    `${c.name}${c.power !== undefined ? ` ${c.power}/${c.toughness}` : ''}`;

  const assign = (attackerId: number) => {
    if (activeBlocker == null) return;
    setBlocks((prev) => ({ ...prev, [activeBlocker]: attackerId }));
    setActiveBlocker(null);
  };

  const clearBlocker = (blockerId: number) => {
    setBlocks((prev) => {
      const next = { ...prev };
      delete next[blockerId];
      return next;
    });
  };

  const submit = () =>
    onRespond(requestId, {
      blocks: Object.entries(blocks).map(([blockerId, attackerId]) => ({
        blockerId: Number(blockerId),
        attackerId,
      })),
    });

  return (
    <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/5" style={{ padding: 'clamp(10px,2vmin,1000px)' }}>
      <h3 className="font-semibold text-red-400" style={{ fontSize: 'clamp(13px,2.5vmin,1000px)', marginBottom: 'clamp(2px,0.4vmin,1000px)' }}>Declare Blockers</h3>
      <div className="text-muted-foreground/80" style={{ fontSize: 'clamp(10px,1.7vmin,1000px)', marginBottom: 'clamp(6px,1vmin,1000px)' }}>
        {activeBlocker == null
          ? 'Select a blocker, then choose the attacker it blocks.'
          : `Blocking with ${label(blockers.find((b) => b.id === activeBlocker) ?? { id: 0, name: '?' })} — pick an attacker.`}
      </div>

      <div style={{ marginBottom: 'clamp(6px,1vmin,1000px)' }}>
        <div className="text-muted-foreground/70" style={{ fontSize: 'clamp(9px,1.5vmin,1000px)' }}>Your creatures</div>
        <div className="flex flex-wrap" style={{ gap: 'clamp(4px,0.8vmin,1000px)' }}>
          {blockers.map((b) => {
            const assignedTo = blocks[b.id];
            const attacker = attackers.find((a) => a.id === assignedTo);
            return (
              <Button
                key={b.id}
                onClick={() => (assignedTo !== undefined ? clearBlocker(b.id) : setActiveBlocker(activeBlocker === b.id ? null : b.id))}
                className={`rounded-lg border bg-card/60 hover:bg-red-500/10 ${activeBlocker === b.id ? 'border-gold/60' : assignedTo !== undefined ? 'border-green-500/50' : 'border-border/40'}`}
                style={{ padding: 'clamp(4px,0.8vmin,1000px) clamp(8px,1.5vmin,1000px)', fontSize: 'clamp(11px,2vmin,1000px)' }}
              >
                {label(b)}{attacker ? ` → ${attacker.name}` : ''}
              </Button>
            );
          })}
        </div>
      </div>

      <div style={{ marginBottom: 'clamp(8px,1.5vmin,1000px)' }}>
        <div className="text-muted-foreground/70" style={{ fontSize: 'clamp(9px,1.5vmin,1000px)' }}>Attackers</div>
        <div className="flex flex-wrap" style={{ gap: 'clamp(4px,0.8vmin,1000px)' }}>
          {attackers.map((a) => (
            <Button
              key={a.id}
              disabled={activeBlocker == null}
              onClick={() => assign(a.id)}
              className="rounded-lg border border-border/40 bg-card/60 hover:border-gold/40 hover:bg-gold/10 disabled:opacity-40"
              style={{ padding: 'clamp(4px,0.8vmin,1000px) clamp(8px,1.5vmin,1000px)', fontSize: 'clamp(11px,2vmin,1000px)' }}
            >
              {label(a)}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex" style={{ gap: 'clamp(6px,1.2vmin,1000px)' }}>
        <Button
          onClick={submit}
          className="rounded-lg border border-red-500/40 bg-red-500/15 font-medium hover:bg-red-500/25"
          style={{ height: 'clamp(32px,4.5vmin,1000px)', padding: '0 clamp(12px,2vmin,1000px)', fontSize: 'clamp(12px,2vmin,1000px)' }}
        >
          Confirm blocks ({Object.keys(blocks).length})
        </Button>
        <Button
          variant="outline"
          onClick={() => onRespond(requestId, { blocks: [] })}
          className="rounded-lg border bg-card/60 font-medium hover:border-red-500/40"
          style={{ height: 'clamp(32px,4.5vmin,1000px)', padding: '0 clamp(12px,2vmin,1000px)', fontSize: 'clamp(12px,2vmin,1000px)' }}
        >
          No Blocks
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// AnnounceNumberPanel — X costs, multikicker, "announce a number"
// ============================================================

function AnnounceNumberPanel({ prompt, description, min, max, requestId, onRespond }: {
  prompt: string;
  description: string;
  min: number;
  max?: number;
  requestId: string;
  onRespond: (requestId: string, payload: Record<string, unknown>) => void;
}) {
  const [value, setValue] = React.useState(min);
  const clamp = (n: number) => Math.max(min, max !== undefined ? Math.min(max, n) : n);

  return (
    <div className="mb-3 rounded-xl border border-gold/40 bg-card/40" style={{ padding: 'clamp(10px,2vmin,1000px)' }}>
      <h3 className="font-semibold" style={{ fontSize: 'clamp(13px,2.5vmin,1000px)', marginBottom: 'clamp(4px,0.8vmin,1000px)' }}>{prompt}</h3>
      {description ? (
        <div className="text-muted-foreground/70 truncate" style={{ fontSize: 'clamp(9px,1.5vmin,1000px)', marginBottom: 'clamp(6px,1vmin,1000px)' }}>{description}</div>
      ) : null}
      <div className="flex items-center" style={{ gap: 'clamp(6px,1.2vmin,1000px)' }}>
        <Button
          variant="outline"
          onClick={() => setValue((v) => clamp(v - 1))}
          className="rounded-lg border bg-card/60 font-bold"
          style={{ height: 'clamp(32px,4.5vmin,1000px)', width: 'clamp(32px,4.5vmin,1000px)', fontSize: 'clamp(14px,2.4vmin,1000px)' }}
        >
          −
        </Button>
        <span className="font-bold tabular-nums text-center" style={{ fontSize: 'clamp(18px,3.5vmin,1000px)', minWidth: 'clamp(40px,6vmin,1000px)' }}>{value}</span>
        <Button
          variant="outline"
          onClick={() => setValue((v) => clamp(v + 1))}
          className="rounded-lg border bg-card/60 font-bold"
          style={{ height: 'clamp(32px,4.5vmin,1000px)', width: 'clamp(32px,4.5vmin,1000px)', fontSize: 'clamp(14px,2.4vmin,1000px)' }}
        >
          +
        </Button>
        <Button
          onClick={() => onRespond(requestId, { value })}
          className="rounded-lg border border-gold/40 bg-gold/15 font-medium hover:bg-gold/25"
          style={{ height: 'clamp(32px,4.5vmin,1000px)', padding: '0 clamp(12px,2vmin,1000px)', fontSize: 'clamp(12px,2vmin,1000px)', marginLeft: 'clamp(4px,0.8vmin,1000px)' }}
        >
          Confirm
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// BinaryChoicePanel — two-option prompts (BinaryChoiceType)
// ============================================================

const BINARY_LABELS: Record<string, [string, string]> = {
  HeadsOrTails: ['Heads', 'Tails'],
  TapOrUntap: ['Tap', 'Untap'],
  PlayOrDraw: ['Play', 'Draw'],
  OddsOrEvens: ['Odds', 'Evens'],
  UntapOrLeaveTapped: ['Untap', 'Leave tapped'],
  UntapTimeVault: ['Untap', 'Leave tapped'],
  LeftOrRight: ['Left', 'Right'],
  AddOrRemove: ['Add', 'Remove'],
};

function BinaryChoicePanel({ prompt, kind, requestId, onRespond }: {
  prompt: string;
  kind: string;
  requestId: string;
  onRespond: (requestId: string, payload: Record<string, unknown>) => void;
}) {
  const [yes, no] = BINARY_LABELS[kind] ?? ['Yes', 'No'];
  return (
    <div className="mb-3 rounded-xl border border-border/30 bg-card/30" style={{ padding: 'clamp(10px,2vmin,1000px)' }}>
      <h3 className="font-semibold" style={{ fontSize: 'clamp(13px,2.5vmin,1000px)', marginBottom: 'clamp(6px,1vmin,1000px)' }}>{prompt}</h3>
      <div className="flex" style={{ gap: 'clamp(6px,1.2vmin,1000px)' }}>
        <Button
          onClick={() => onRespond(requestId, { result: true })}
          className="rounded-lg border border-gold/40 bg-gold/15 font-medium hover:bg-gold/25"
          style={{ height: 'clamp(32px,4.5vmin,1000px)', padding: '0 clamp(12px,2vmin,1000px)', fontSize: 'clamp(12px,2vmin,1000px)' }}
        >
          {yes}
        </Button>
        <Button
          variant="outline"
          onClick={() => onRespond(requestId, { result: false })}
          className="rounded-lg border bg-card/60 font-medium hover:border-border/40"
          style={{ height: 'clamp(32px,4.5vmin,1000px)', padding: '0 clamp(12px,2vmin,1000px)', fontSize: 'clamp(12px,2vmin,1000px)' }}
        >
          {no}
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// ColorChoicePanel — "choose a color" (mana, protection, ...)
// ============================================================

const COLOR_SWATCH: Record<string, string> = {
  W: 'bg-[#f8f6d8] text-black',
  U: 'bg-[#c1d7e9] text-black',
  B: 'bg-[#bab1ab] text-black',
  R: 'bg-[#e49977] text-black',
  G: 'bg-[#a3c095] text-black',
  C: 'bg-[#ccc2c0] text-black',
};

function ColorChoicePanel({ prompt, colors, requestId, onRespond }: {
  prompt: string;
  colors: ColorOption[];
  requestId: string;
  onRespond: (requestId: string, payload: Record<string, unknown>) => void;
}) {
  return (
    <div className="mb-3 rounded-xl border border-border/30 bg-card/30" style={{ padding: 'clamp(10px,2vmin,1000px)' }}>
      <h3 className="font-semibold" style={{ fontSize: 'clamp(13px,2.5vmin,1000px)', marginBottom: 'clamp(6px,1vmin,1000px)' }}>{prompt}</h3>
      <div className="flex flex-wrap" style={{ gap: 'clamp(6px,1.2vmin,1000px)' }}>
        {colors.map((c) => (
          <Button
            key={c.mask}
            onClick={() => onRespond(requestId, { mask: c.mask })}
            className={`rounded-lg border border-border/40 font-bold ${COLOR_SWATCH[c.symbol] ?? 'bg-card/60'}`}
            style={{ height: 'clamp(32px,4.5vmin,1000px)', padding: '0 clamp(12px,2vmin,1000px)', fontSize: 'clamp(12px,2vmin,1000px)' }}
          >
            {c.symbol} · {c.name}
          </Button>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// AssignDamagePanel — allocate combat damage across blockers
// ============================================================

function AssignDamagePanel({ prompt, attackerName, totalDamage, blockers, requestId, onRespond }: {
  prompt: string;
  attackerName: string;
  totalDamage: number;
  blockers: CardOption[];
  requestId: string;
  onRespond: (requestId: string, payload: Record<string, unknown>) => void;
}) {
  const [assigned, setAssigned] = React.useState<Record<number, number>>({});
  const used = Object.values(assigned).reduce((a, b) => a + b, 0);
  const remaining = totalDamage - used;

  const bump = (id: number, delta: number) => {
    setAssigned((prev) => {
      const current = prev[id] ?? 0;
      const next = Math.max(0, Math.min(current + delta, current + remaining));
      return { ...prev, [id]: next };
    });
  };

  return (
    <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/5" style={{ padding: 'clamp(10px,2vmin,1000px)' }}>
      <h3 className="font-semibold text-red-400" style={{ fontSize: 'clamp(13px,2.5vmin,1000px)', marginBottom: 'clamp(2px,0.4vmin,1000px)' }}>{prompt}</h3>
      <div className="text-muted-foreground/80" style={{ fontSize: 'clamp(10px,1.7vmin,1000px)', marginBottom: 'clamp(6px,1vmin,1000px)' }}>
        {attackerName} · {remaining} of {totalDamage} left to assign
      </div>
      <div className="flex flex-col" style={{ gap: 'clamp(4px,0.8vmin,1000px)', marginBottom: 'clamp(8px,1.5vmin,1000px)' }}>
        {blockers.map((b) => (
          <div key={b.id} className="flex items-center justify-between rounded-lg border border-border/30 bg-card/40" style={{ padding: 'clamp(4px,0.8vmin,1000px) clamp(8px,1.5vmin,1000px)', gap: 'clamp(6px,1.2vmin,1000px)' }}>
            <span style={{ fontSize: 'clamp(11px,1.9vmin,1000px)' }}>
              {b.name}{b.power !== undefined ? ` ${b.power}/${b.toughness}` : ''}
            </span>
            <div className="flex items-center" style={{ gap: 'clamp(4px,0.8vmin,1000px)' }}>
              <Button variant="outline" onClick={() => bump(b.id, -1)} className="rounded border bg-card/60 font-bold" style={{ height: 'clamp(24px,3.4vmin,1000px)', width: 'clamp(24px,3.4vmin,1000px)', fontSize: 'clamp(12px,2vmin,1000px)' }}>−</Button>
              <span className="tabular-nums font-semibold text-center" style={{ fontSize: 'clamp(12px,2.1vmin,1000px)', minWidth: 'clamp(20px,3vmin,1000px)' }}>{assigned[b.id] ?? 0}</span>
              <Button variant="outline" onClick={() => bump(b.id, 1)} className="rounded border bg-card/60 font-bold" style={{ height: 'clamp(24px,3.4vmin,1000px)', width: 'clamp(24px,3.4vmin,1000px)', fontSize: 'clamp(12px,2vmin,1000px)' }}>+</Button>
            </div>
          </div>
        ))}
      </div>
      <Button
        disabled={remaining !== 0}
        onClick={() => onRespond(requestId, { assignments: Object.fromEntries(blockers.map((b) => [String(b.id), assigned[b.id] ?? 0])) })}
        className="rounded-lg border border-red-500/40 bg-red-500/15 font-medium hover:bg-red-500/25 disabled:opacity-40"
        style={{ height: 'clamp(32px,4.5vmin,1000px)', padding: '0 clamp(12px,2vmin,1000px)', fontSize: 'clamp(12px,2vmin,1000px)' }}
      >
        {remaining === 0 ? 'Confirm damage' : `Assign ${remaining} more`}
      </Button>
    </div>
  );
}

// ============================================================
// CardSelectPanel — reusable multi-select card picker
// Used for discard, sacrifice, search, targets, etc.
// ============================================================

function CardSelectPanel({ prompt, options, min, max, requestId, onRespond, responseKey, formatResponse, canCancel }: {
  prompt: string;
  options: CardOption[];
  min: number;
  max: number;
  requestId: string;
  onRespond: (requestId: string, payload: Record<string, unknown>) => void;
  responseKey: string;
  formatResponse?: (ids: number[]) => Record<string, unknown>;
  canCancel?: boolean;
}) {
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [previewId, setPreviewId] = React.useState<number | null>(null);
  const isSingle = max === 1;

  // Keys that the server expects as arrays even for single selection
  const arrayKeys = new Set(['selectedIds', 'entityIds', 'targetIds', 'attackerCardIds', 'bottomIds']);

  // Resolve card options to CardInstance objects for art display
  const gameState = useGameStore((s) => s.gameState);
  const resolvedCards = useMemo(() => {
    if (!gameState) return new Map<number, CardInstance>();
    const map = new Map<number, CardInstance>();
    for (const opt of options) {
      if (opt.type === 'player') continue;
      const instanceId = `forge-${opt.id}`;
      const instance = gameState.cardInstances.get(instanceId);
      if (instance) map.set(opt.id, instance);
    }
    return map;
  }, [gameState, options]);

  const toggle = (id: number) => {
    if (isSingle) {
      // Single-select: highlight first, don't auto-respond
      setPreviewId(previewId === id ? null : id);
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else if (next.size < max) { next.add(id); }
      return next;
    });
  };

  const confirmSingle = () => {
    if (previewId == null) return;
    if (formatResponse) {
      onRespond(requestId, formatResponse([previewId]));
    } else {
      const value = arrayKeys.has(responseKey) ? [previewId] : previewId;
      onRespond(requestId, { [responseKey]: value });
    }
  };

  const confirm = () => {
    const ids = Array.from(selected);
    if (formatResponse) {
      onRespond(requestId, formatResponse(ids));
    } else {
      onRespond(requestId, { [responseKey]: ids });
    }
  };

  const skipOrCancel = () => {
    if (formatResponse) {
      onRespond(requestId, formatResponse([]));
    } else {
      onRespond(requestId, { [responseKey]: arrayKeys.has(responseKey) ? [] : null });
    }
  };

  const canSkip = min === 0;
  const hasOptions = options.length > 0;
  const previewCard = previewId != null ? resolvedCards.get(previewId) : null;
  const previewOpt = previewId != null ? options.find(o => o.id === previewId) : null;

  return (
    <div className="mb-3 rounded-xl border border-border/30 bg-card/30" style={{ padding: 'clamp(10px,2vmin,1000px)' }}>
      <h3 className="font-semibold" style={{ fontSize: 'clamp(13px,2.5vmin,1000px)', marginBottom: 'clamp(6px,1vmin,1000px)' }}>{prompt}</h3>
      {!isSingle && hasOptions && (
        <p className="text-muted-foreground" style={{ fontSize: 'clamp(11px,2vmin,1000px)', marginBottom: 'clamp(6px,1vmin,1000px)' }}>Select {min === max ? min : `${min}-${max}`} · {selected.size} selected</p>
      )}
      {hasOptions ? (
        <div className="flex flex-wrap items-end" style={{ gap: 'clamp(6px,1.2vmin,1000px)', marginBottom: 'clamp(8px,1.5vmin,1000px)' }}>
          {options.map((opt) => {
            const resolved = resolvedCards.get(opt.id);
            const isActive = isSingle ? previewId === opt.id : selected.has(opt.id);
            return (
              <div
                key={opt.id}
                onClick={() => toggle(opt.id)}
                className={`relative rounded-lg cursor-pointer transition-all duration-150 ${
                  isActive
                    ? 'ring-2 ring-gold/60 scale-105 z-10 shadow-[0_0_12px_rgba(212,169,68,0.3)]'
                    : 'hover:ring-1 hover:ring-border/60'
                }`}
              >
                {resolved ? (
                  <CardView card={resolved} mode="art" interactive={false} />
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-lg border border-border/40 bg-card/60" style={{ width: 'clamp(80px,12vmin,200px)', height: 'clamp(110px,17vmin,280px)', padding: 'clamp(4px,0.6vmin,1000px)' }}>
                    <span className="font-semibold text-center leading-tight" style={{ fontSize: 'clamp(10px,1.6vmin,1000px)' }}>{opt.name}</span>
                    {opt.power !== undefined && <span className="text-muted-foreground" style={{ fontSize: 'clamp(9px,1.4vmin,1000px)' }}>{opt.power}/{opt.toughness}</span>}
                    {opt.type === 'player' && <span className="text-muted-foreground" style={{ fontSize: 'clamp(9px,1.4vmin,1000px)' }}>Life: {opt.life}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-amber-400" style={{ fontSize: 'clamp(11px,2vmin,1000px)', marginBottom: 'clamp(8px,1.5vmin,1000px)' }}>No valid options available.</p>
      )}
      {/* Preview info for selected card */}
      {isSingle && previewCard && previewOpt && (
        <div className="rounded-lg border border-gold/30 bg-gold/5 flex items-center" style={{ padding: 'clamp(6px,1vmin,1000px)', marginBottom: 'clamp(8px,1.5vmin,1000px)', gap: 'clamp(6px,1vmin,1000px)' }}>
          <span className="font-semibold text-gold" style={{ fontSize: 'clamp(11px,2vmin,1000px)' }}>{previewOpt.name}</span>
          {previewCard.cardData.typeLine && <span className="text-muted-foreground" style={{ fontSize: 'clamp(10px,1.6vmin,1000px)' }}>— {previewCard.cardData.typeLine}</span>}
          {previewCard.cardData.oracleText && <span className="text-foreground/70 hidden sm:inline" style={{ fontSize: 'clamp(9px,1.4vmin,1000px)' }}>| {previewCard.cardData.oracleText.slice(0, 80)}{previewCard.cardData.oracleText.length > 80 ? '...' : ''}</span>}
        </div>
      )}
      <div className="flex" style={{ gap: 'clamp(6px,1.2vmin,1000px)' }}>
        {isSingle && (
          <Button disabled={previewId == null} onClick={confirmSingle} className="rounded-lg border bg-gold font-medium hover:bg-gold/90 disabled:opacity-50 disabled:hover:bg-gold" style={{ height: 'clamp(32px,4.5vmin,1000px)', padding: '0 clamp(12px,2vmin,1000px)', fontSize: 'clamp(12px,2vmin,1000px)' }}>
            Select{previewOpt ? `: ${previewOpt.name}` : ''}
          </Button>
        )}
        {!isSingle && (
          <Button disabled={selected.size < min} onClick={confirm} className="rounded-lg border bg-gold font-medium hover:bg-gold/90 disabled:opacity-50 disabled:hover:bg-gold" style={{ height: 'clamp(32px,4.5vmin,1000px)', padding: '0 clamp(12px,2vmin,1000px)', fontSize: 'clamp(12px,2vmin,1000px)' }}>
            Confirm ({selected.size})
          </Button>
        )}
        {(canSkip || canCancel || !hasOptions) && (
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
