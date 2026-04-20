'use client';

import { useState } from 'react';
import type { CardInstance, PendingChoice } from '@/engine/types';
import { CardView } from './CardView';
import { cn } from '@/lib/utils';
import { Search, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SearchPickerProps {
  pendingChoice: PendingChoice;
  cards: CardInstance[];
  onConfirm: (chosenCardIds: string[]) => void;
  onCancel?: () => void;
}

export function SearchPicker({ pendingChoice, cards, onConfirm, onCancel }: SearchPickerProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');

  const filteredCards = filter
    ? cards.filter(c =>
        c.cardData.name.toLowerCase().includes(filter.toLowerCase()) ||
        c.cardData.typeLine.toLowerCase().includes(filter.toLowerCase())
      )
    : cards;

  const toggleCard = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      if (next.size < pendingChoice.maxChoices) {
        next.add(id);
      } else if (pendingChoice.maxChoices === 1) {
        next.clear();
        next.add(id);
      }
    }
    setSelectedIds(next);
  };

  const canConfirm = selectedIds.size >= pendingChoice.minChoices && selectedIds.size <= pendingChoice.maxChoices;
  const canSkip = pendingChoice.minChoices === 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="flex flex-col gap-3 rounded-xl border border-border/30 bg-card p-4 shadow-2xl max-w-[90vw] max-h-[85vh]"
        style={{ minWidth: '400px' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">{pendingChoice.prompt}</h3>
          </div>
          <span className="text-xs text-muted-foreground">
            {cards.length} card{cards.length !== 1 ? 's' : ''} found
          </span>
        </div>

        {/* Filter input */}
        {cards.length > 8 && (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <input
              type="text"
              placeholder="Filter by name or type..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full rounded-md border border-border/20 bg-background/50 py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50"
              autoFocus
            />
          </div>
        )}

        {/* Card grid */}
        <div className="overflow-y-auto max-h-[60vh] pr-1">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
            {filteredCards.map((card) => {
              const isSelected = selectedIds.has(card.instanceId);
              return (
                <div
                  key={card.instanceId}
                  onClick={() => toggleCard(card.instanceId)}
                  className={cn(
                    'relative cursor-pointer rounded-lg transition-all',
                    isSelected
                      ? 'ring-2 ring-primary shadow-lg shadow-primary/20 scale-105'
                      : 'hover:ring-1 hover:ring-primary/40 hover:scale-[1.02]'
                  )}
                >
                  <CardView card={card} mode="art" interactive />
                  {isSelected && (
                    <div className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-3 w-3" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {filteredCards.length === 0 && (
            <div className="flex items-center justify-center py-8 text-xs text-muted-foreground/50 italic">
              No matching cards found
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between border-t border-border/20 pt-3">
          <div className="text-xs text-muted-foreground">
            {selectedIds.size > 0
              ? `${selectedIds.size} selected`
              : canSkip
                ? 'Select a card or skip'
                : 'Select a card'}
          </div>
          <div className="flex gap-2">
            {canSkip && (
              <button
                onClick={() => onConfirm([])}
                className="rounded-md border border-border/30 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/20 transition-colors"
              >
                Skip
              </button>
            )}
            <button
              onClick={() => onConfirm(Array.from(selectedIds))}
              disabled={!canConfirm && selectedIds.size > 0}
              className={cn(
                'rounded-md px-4 py-1.5 text-xs font-medium transition-colors',
                canConfirm
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-muted/20 text-muted-foreground cursor-not-allowed'
              )}
            >
              Confirm
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
