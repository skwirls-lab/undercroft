'use client';

import { cn } from '@/lib/utils';

/**
 * A Romanesque arch — the round-headed kind that actually holds up an undercroft — drawn
 * as a set of stones so it reads as masonry rather than a rounded rectangle. Decorative:
 * pointer-events off, sized by its container.
 *
 * `lit` paints warm light through the opening, which is how the landing hero uses it.
 */
interface ArchProps {
  className?: string;
  lit?: boolean;
  /** Number of voussoirs across the head. Odd keeps a keystone at the crown. */
  stones?: number;
}

export function Arch({ className, lit = false, stones = 13 }: ArchProps) {
  const w = 400;
  const h = 420;
  const cx = 200;
  const springY = 200; // where the arc meets the piers
  const rOuter = 172;
  const rInner = 140;
  const pierW = rOuter - rInner;

  // Voussoir wedges from 180° to 0° across the head.
  const wedges: string[] = [];
  const step = Math.PI / stones;
  for (let i = 0; i < stones; i++) {
    const a0 = Math.PI - i * step;
    const a1 = Math.PI - (i + 1) * step;
    const p = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(springY - r * Math.sin(a)).toFixed(2)}`;
    wedges.push(
      `M ${p(rOuter, a0)} A ${rOuter} ${rOuter} 0 0 1 ${p(rOuter, a1)} L ${p(rInner, a1)} A ${rInner} ${rInner} 0 0 0 ${p(rInner, a0)} Z`
    );
  }
  const keyIndex = Math.floor(stones / 2);

  // Pier courses (stacked blocks) on each side below the springing line.
  const courses = 5;
  const courseH = (h - springY) / courses;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn('pointer-events-none select-none', className)}
      aria-hidden="true"
      preserveAspectRatio="xMidYMax meet"
    >
      <defs>
        <linearGradient id="arch-stone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.30 0.02 62)" />
          <stop offset="100%" stopColor="oklch(0.19 0.014 55)" />
        </linearGradient>
        <radialGradient id="arch-light" cx="50%" cy="38%" r="60%">
          <stop offset="0%" stopColor="oklch(0.80 0.12 75)" stopOpacity={0.22} />
          <stop offset="55%" stopColor="oklch(0.80 0.12 75)" stopOpacity={0.06} />
          <stop offset="100%" stopColor="oklch(0.80 0.12 75)" stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* Light inside the opening */}
      {lit && (
        <path
          className="torch"
          d={`M ${cx - rInner} ${h} L ${cx - rInner} ${springY} A ${rInner} ${rInner} 0 0 1 ${cx + rInner} ${springY} L ${cx + rInner} ${h} Z`}
          fill="url(#arch-light)"
        />
      )}

      {/* Voussoirs */}
      {wedges.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="url(#arch-stone)"
          stroke={i === keyIndex ? 'var(--gold)' : 'oklch(0.40 0.025 66)'}
          strokeOpacity={i === keyIndex ? 0.9 : 0.55}
          strokeWidth={i === keyIndex ? 1.6 : 1}
          strokeLinejoin="round"
        />
      ))}

      {/* Piers */}
      {[cx - rOuter, cx + rInner].map((x, side) =>
        Array.from({ length: courses }, (_, c) => (
          <rect
            key={`${side}-${c}`}
            x={x}
            y={springY + c * courseH}
            width={pierW}
            height={courseH}
            fill="url(#arch-stone)"
            stroke="oklch(0.40 0.025 66)"
            strokeOpacity={0.5}
            strokeWidth={1}
          />
        ))
      )}

      {/* Impost blocks where the arch springs */}
      {[cx - rOuter - 8, cx + rInner - 8].map((x, i) => (
        <rect key={i} x={x} y={springY - 10} width={pierW + 16} height={12} fill="oklch(0.34 0.022 62)" stroke="var(--gold)" strokeOpacity={0.5} strokeWidth={1} />
      ))}
    </svg>
  );
}
