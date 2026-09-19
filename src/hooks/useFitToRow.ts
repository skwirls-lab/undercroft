'use client';

import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Size N same-shaped cards so they fit a measured box without scrolling.
 *
 * The board used to size cards in vmin, which knows how big the screen is but not how much
 * of it this row was given — so a commander, six creatures, four other permanents and a
 * nine-card hand overflowed and the battlefield scrolled. This measures the row's actual box
 * with a ResizeObserver and solves for the largest card that fits on one line, falling back
 * to two lines when one line would push cards below a readable minimum.
 *
 * Returns integer pixels; the caller passes them to CardView as an explicit size.
 */
interface FitOptions {
  count: number;
  /** Gap between cards, px. */
  gap: number;
  /** Height divided by width. Art-crop cards are 7/5. */
  aspect: number;
  /** Never larger than this, px wide. */
  maxW: number;
  /** Below this width, prefer a second line. */
  minW: number;
  /** Allow wrapping to this many lines at most. */
  maxLines?: number;
}

export interface FitResult {
  cardW: number;
  cardH: number;
  lines: number;
  /** Box size, for callers that want it. */
  boxW: number;
  boxH: number;
}

function solve(boxW: number, boxH: number, o: FitOptions): FitResult {
  const n = Math.max(1, o.count);
  const maxLines = Math.max(1, o.maxLines ?? 2);
  let best: FitResult | null = null;

  for (let lines = 1; lines <= maxLines; lines++) {
    const perLine = Math.ceil(n / lines);
    const byWidth = (boxW - (perLine - 1) * o.gap) / perLine;
    const byHeight = (boxH - (lines - 1) * o.gap) / lines / o.aspect;
    const w = Math.floor(Math.min(o.maxW, byWidth, byHeight));
    const result: FitResult = { cardW: Math.max(0, w), cardH: Math.max(0, Math.floor(w * o.aspect)), lines, boxW, boxH };
    if (w >= o.minW) return result;
    if (!best || w > best.cardW) best = result;
  }
  return best!;
}

export function useFitToRow<T extends HTMLElement = HTMLDivElement>(o: FitOptions) {
  const ref = useRef<T | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // ResizeObserver delivers an initial notification on observe(), so this is the only
    // measurement path — no synchronous setState in the effect body.
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect ?? el.getBoundingClientRect();
      const next = { w: Math.floor(r.width), h: Math.floor(r.height) };
      setBox((prev) => (prev.w === next.w && prev.h === next.h ? prev : next));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = box.w > 0 && box.h > 0 ? solve(box.w, box.h, o) : { cardW: 0, cardH: 0, lines: 1, boxW: 0, boxH: 0 };
  return { ref, ...fit };
}
