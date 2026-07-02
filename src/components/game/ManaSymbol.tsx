'use client';

import { cn } from '@/lib/utils';
import React from 'react';

// ─── Styled circle definitions ───────────────────────────────────────────────

const COLORED_STYLES: Record<string, { bg: string; label: string }> = {
  W: { bg: 'bg-gradient-to-br from-amber-50 to-amber-200 border border-amber-300', label: 'White' },
  U: { bg: 'bg-gradient-to-br from-blue-400 to-blue-600 border border-blue-300', label: 'Blue' },
  B: { bg: 'bg-gradient-to-br from-zinc-700 to-zinc-900 border border-zinc-600', label: 'Black' },
  R: { bg: 'bg-gradient-to-br from-red-500 to-red-700 border border-red-400', label: 'Red' },
  G: { bg: 'bg-gradient-to-br from-green-500 to-green-700 border border-green-400', label: 'Green' },
  C: { bg: 'bg-gradient-to-br from-zinc-300 to-zinc-500 border border-zinc-400', label: 'Colorless' },
};
const GENERIC_BG = 'bg-gradient-to-br from-zinc-400 to-zinc-600 border border-zinc-500 text-white';
const TAP_BG = 'bg-gradient-to-br from-amber-600 to-amber-800 border border-amber-500 text-white';

const SIZES = {
  xs: 'h-3.5 w-3.5 text-[7px]',
  sm: 'h-4 w-4 text-[8px]',
  md: 'h-5 w-5 text-[10px]',
  lg: 'h-6 w-6 text-[11px]',
};

// ─── Single symbol ────────────────────────────────────────────────────────────

interface ManaSymbolProps {
  symbol: string;
  size?: keyof typeof SIZES;
  className?: string;
}

export function ManaSymbol({ symbol, size = 'sm', className }: ManaSymbolProps) {
  const s = symbol.toUpperCase().trim();
  const sizeClass = SIZES[size];
  const base = cn('inline-flex shrink-0 items-center justify-center rounded-full font-bold', sizeClass, className);

  // Pure-color mana — just the filled circle, no letter
  if (COLORED_STYLES[s]) {
    return (
      <span aria-label={COLORED_STYLES[s].label} title={COLORED_STYLES[s].label}
        className={cn(base, COLORED_STYLES[s].bg)} />
    );
  }

  // Tap / Untap
  if (s === 'T') return <span aria-label="Tap" title="Tap" className={cn(base, TAP_BG)}>↷</span>;
  if (s === 'Q') return <span aria-label="Untap" title="Untap" className={cn(base, TAP_BG)}>↺</span>;

  // Hybrid like W/U, 2/U — show smaller text
  if (s.includes('/')) {
    const parts = s.split('/');
    const leftStyle = COLORED_STYLES[parts[0]];
    const rightStyle = COLORED_STYLES[parts[1]];
    // Simple: use the first color as background if it's a color, else generic
    const bg = leftStyle?.bg ?? rightStyle?.bg ?? GENERIC_BG;
    return (
      <span aria-label={s} title={s} className={cn(base, bg)}>
        {!leftStyle && !rightStyle ? s : ''}
      </span>
    );
  }

  // Generic / numeric / X / snow / etc.
  const display = s.length <= 2 ? s : s[0];
  return (
    <span aria-label={`${s} mana`} title={`{${s}}`} className={cn(base, GENERIC_BG)}>
      {display}
    </span>
  );
}

// ─── Parse mana cost string ───────────────────────────────────────────────────

export function parseManaSymbols(manaCost: string): string[] {
  const symbols: string[] = [];
  const regex = /\{([^}]+)\}/g;
  let match;
  while ((match = regex.exec(manaCost)) !== null) {
    symbols.push(match[1]);
  }
  return symbols;
}

// ─── Mana cost row ────────────────────────────────────────────────────────────

interface ManaCostDisplayProps {
  manaCost: string;
  size?: keyof typeof SIZES;
  className?: string;
}

export function ManaCostDisplay({ manaCost, size = 'sm', className }: ManaCostDisplayProps) {
  const symbols = parseManaSymbols(manaCost);
  if (symbols.length === 0) return null;
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      {symbols.map((sym, i) => (
        <ManaSymbol key={i} symbol={sym} size={size} />
      ))}
    </span>
  );
}

// ─── Oracle text with inline mana symbols ────────────────────────────────────

interface OracleTextProps {
  text: string;
  className?: string;
}

export function OracleText({ text, className }: OracleTextProps) {
  if (!text) return null;
  // Normalize literal \n sequences (from Forge data) to real newlines before splitting
  const normalized = text.replace(/\\n/g, '\n');
  const lines = normalized.split('\n');
  return (
    <div className={cn('leading-relaxed', className)}>
      {lines.map((line, li) => {
        const parts = line.split(/(\{[^}]+\})/g);
        return (
          <p key={li} className={li > 0 ? 'mt-1' : ''}>
            {parts.map((part, pi) => {
              const match = part.match(/^\{([^}]+)\}$/);
              if (match) {
                return (
                  <ManaSymbol
                    key={pi}
                    symbol={match[1]}
                    size="xs"
                    className="mx-0.5 relative top-[-1px] align-middle"
                  />
                );
              }
              return <span key={pi}>{part}</span>;
            })}
          </p>
        );
      })}
    </div>
  );
}
