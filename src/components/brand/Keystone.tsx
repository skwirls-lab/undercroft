'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * The five colours of Magic, set into an arch as its voussoirs — the wedge stones. This is
 * the mark that says "Commander" without a word: it appears in the app bar, on the landing
 * arch, on the favicon and home-screen icon, and lights up in sequence as the loading
 * indicator.
 *
 * The order is WUBRG, left to right, the way every Magic player reads the five colours: white
 * at the left springing, blue on the shoulder, black at the keystone, red on the right
 * shoulder, green at the right springing. Any other order reads as wrong at a glance.
 */

const GEMS: Array<{ id: 'W' | 'U' | 'B' | 'R' | 'G'; color: string; hi: string }> = [
  { id: 'W', color: 'var(--color-mana-white)', hi: '#ffffff' },
  { id: 'U', color: 'var(--color-mana-blue)', hi: '#a8cdf0' },
  { id: 'B', color: 'var(--color-mana-black)', hi: '#9a92a6' },
  { id: 'R', color: 'var(--color-mana-red)', hi: '#f0a090' },
  { id: 'G', color: 'var(--color-mana-green)', hi: '#a6e0b0' },
];

// Angles across the top of a semicircle, left springing (180°) to right (0°).
const ANGLES = [162, 126, 90, 54, 18];

interface KeystoneProps {
  /** Overall width in px. Height is roughly 0.6× this. */
  size?: number;
  /** Animate the gems lighting in sequence — the loading state. */
  loading?: boolean;
  /** Draw the two short piers under the arc. Off for small marks, where they read as noise. */
  piers?: boolean;
  className?: string;
  title?: string;
}

export function Keystone({ size = 44, loading = false, piers = size >= 56, className, title }: KeystoneProps) {
  const w = 100;
  const h = 62;
  const cx = 50;
  const cy = 56;
  const r = 40;
  const gem = 7.2;
  const uid = useId().replace(/[:]/g, '');

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={size}
      height={(size * h) / w}
      className={cn('shrink-0', className)}
      role="img"
      aria-label={title ?? 'Undercroft'}
    >
      <title>{title ?? 'Undercroft'}</title>
      <defs>
        {GEMS.map((g) => (
          <radialGradient key={g.id} id={`gem-${uid}-${g.id}`} cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor={g.hi} stopOpacity={0.95} />
            <stop offset="55%" stopColor={g.color} />
            <stop offset="100%" stopColor={g.color} stopOpacity={0.75} />
          </radialGradient>
        ))}
        <linearGradient id={`ks-arch-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--gold)" stopOpacity={0.9} />
          <stop offset="100%" stopColor="var(--gold)" stopOpacity={0.35} />
        </linearGradient>
      </defs>

      {/* The arch itself: a thin gold arc with two short piers. */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke={`url(#ks-arch-${uid})`}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
      {piers && (
        <>
          <line x1={cx - r} y1={cy} x2={cx - r} y2={h - 2} stroke="var(--gold)" strokeOpacity={0.55} strokeWidth={2.2} strokeLinecap="round" />
          <line x1={cx + r} y1={cy} x2={cx + r} y2={h - 2} stroke="var(--gold)" strokeOpacity={0.55} strokeWidth={2.2} strokeLinecap="round" />
        </>
      )}

      {/* Voussoir gems along the arc, WUBRG left to right; the keystone (B) sits at the crown. */}
      {GEMS.map((g, i) => {
        const a = (ANGLES[i] * Math.PI) / 180;
        const x = cx + r * Math.cos(a);
        const y = cy - r * Math.sin(a);
        const isKey = g.id === 'B';
        return (
          <g key={g.id} className={loading ? 'ks-gem' : undefined} style={loading ? { animationDelay: `${i * 0.14}s` } : undefined}>
            {/* Gold setting */}
            <circle cx={x} cy={y} r={isKey ? gem + 2 : gem + 1.2} fill="var(--background)" stroke="var(--gold)" strokeOpacity={0.9} strokeWidth={1.4} />
            {/* Gem */}
            <circle cx={x} cy={y} r={isKey ? gem : gem - 0.8} fill={`url(#gem-${uid}-${g.id})`} />
            {/* Facet glint */}
            <circle cx={x - gem * 0.32} cy={y - gem * 0.36} r={gem * 0.22} fill="#fff" fillOpacity={0.55} />
          </g>
        );
      })}

      {loading && (
        <style>{`
          @keyframes ks-light { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }
          .ks-gem { animation: ks-light 1.4s ease-in-out infinite; }
        `}</style>
      )}
    </svg>
  );
}
