'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Tour, TourStep } from '@/content/tours';
import { cn } from '@/lib/utils';

interface Rect { top: number; left: number; width: number; height: number }

const PAD = 8;
const CARD_W = 320;
const GAP = 12;

/**
 * A spotlight over one control at a time: a dark mask with a hole cut where the target is,
 * a ring around it, and a card that explains it. The card sits on the side the step asks
 * for and flips when there is no room; on a phone it docks to the top or bottom of the
 * screen, whichever the target is not in. Keyboard: arrows to move, Escape to leave.
 * Steps whose target is not on the page are skipped.
 */
export function TourOverlay({ tour, onDone }: { tour: Tour; onDone: () => void }) {
  const steps = tour.steps;
  const [index, setIndex] = useState(() => firstPresent(steps, 0));
  const [rect, setRect] = useState<Rect | null>(null);
  const [vw, setVw] = useState({ w: 0, h: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(160);

  const step = index >= 0 && index < steps.length ? steps[index] : null;
  const present = steps.map((s, i) => (i === index ? true : !!find(s)));
  const lastIndex = lastPresent(steps);

  // Measure the target and keep measuring while anything moves.
  useLayoutEffect(() => {
    if (!step) return;
    const el = find(step);
    if (!el) return;
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' as ScrollBehavior });
    let raf = 0;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      setVw({ w: window.innerWidth, h: window.innerHeight });
      setCardH(cardRef.current?.offsetHeight ?? 160);
    };
    const loop = () => { measure(); raf = requestAnimationFrame(loop); };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [step]);

  const go = useCallback((dir: 1 | -1) => {
    setIndex((i) => {
      let n = i + dir;
      while (n >= 0 && n < steps.length && !find(steps[n])) n += dir;
      return n;
    });
  }, [steps]);

  const finish = useCallback(() => onDone(), [onDone]);

  useEffect(() => {
    if (index >= steps.length || index < 0) finish();
  }, [index, steps.length, finish]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); finish(); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); if (index >= lastIndex) finish(); else go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, finish, index, lastIndex]);

  if (!step || typeof document === 'undefined') return null;

  const hole = rect ? { x: rect.left - PAD, y: rect.top - PAD, w: rect.width + PAD * 2, h: rect.height + PAD * 2 } : null;
  const phone = vw.w > 0 && vw.w < 640;
  const pos = hole ? placeCard(hole, step.placement ?? 'bottom', vw, cardH, phone) : { top: 24, left: 24 };
  const stepNo = present.slice(0, index).filter(Boolean).length + 1;
  const total = present.filter(Boolean).length;
  const isLast = index >= lastIndex;

  return createPortal(
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-labelledby="tour-title" data-tour-overlay data-tour-step={index} data-tour-target={step.target}>
      {/* The mask: everything dark except a rounded hole over the target. */}
      <svg className="absolute inset-0 h-full w-full" width={vw.w} height={vw.h} aria-hidden>
        <defs>
          <mask id="tour-mask">
            <rect x={0} y={0} width="100%" height="100%" fill="white" />
            {hole && <rect x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx={10} fill="black" />}
          </mask>
        </defs>
        <rect x={0} y={0} width="100%" height="100%" fill="oklch(0.08 0.01 55 / 0.72)" mask="url(#tour-mask)" onClick={finish} />
        {hole && <rect x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx={10} fill="none" stroke="var(--gold)" strokeWidth={2} className="drop-shadow-[0_0_18px_var(--gold-glow)]" />}
      </svg>

      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          ref={cardRef}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
          className={cn('absolute rounded-2xl border border-gold/40 bg-card p-4 shadow-[0_20px_60px_-20px_oklch(0_0_0/0.9)]', phone ? 'inset-x-3' : '')}
          style={phone ? { top: pos.top, width: 'auto' } : { top: pos.top, left: pos.left, width: CARD_W }}
          data-tour-card
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow">{tour.title} · {stepNo} of {total}</p>
              <h3 id="tour-title" className="mt-1 font-display text-lg font-bold leading-tight">{step.title}</h3>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={finish} aria-label="Skip the tour" className="-mr-1 -mt-1 shrink-0 text-muted-foreground"><X className="h-4 w-4" /></Button>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-foreground/85">{step.body}</p>
          <div className="mt-3 flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => go(-1)} disabled={stepNo === 1} className="gap-1 text-muted-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Back</Button>
            <div className="flex items-center gap-2">
              {!isLast && <Button variant="ghost" size="sm" onClick={finish} className="text-muted-foreground">Skip</Button>}
              <Button size="sm" onClick={() => (isLast ? finish() : go(1))} className="gap-1 bg-gold text-gold-foreground hover:bg-gold/90" data-tour-next>
                {isLast ? 'Done' : 'Next'} {!isLast && <ArrowRight className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>,
    document.body
  );
}

function find(step: TourStep): HTMLElement | null {
  const els = document.querySelectorAll<HTMLElement>(`[data-tour="${step.target}"]`);
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

function firstPresent(steps: TourStep[], from: number): number {
  if (typeof document === 'undefined') return from;
  for (let i = from; i < steps.length; i++) if (find(steps[i])) return i;
  return steps.length;
}

function lastPresent(steps: TourStep[]): number {
  if (typeof document === 'undefined') return steps.length - 1;
  for (let i = steps.length - 1; i >= 0; i--) if (find(steps[i])) return i;
  return -1;
}

function placeCard(hole: { x: number; y: number; w: number; h: number }, want: NonNullable<TourStep['placement']>, vw: { w: number; h: number }, cardH: number, phone: boolean): { top: number; left: number } {
  if (phone) {
    // Dock to whichever half the target is not in.
    const targetMid = hole.y + hole.h / 2;
    return targetMid > vw.h / 2 ? { top: 16, left: 12 } : { top: Math.max(16, vw.h - cardH - 16), left: 12 };
  }
  const fits = {
    bottom: hole.y + hole.h + GAP + cardH <= vw.h,
    top: hole.y - GAP - cardH >= 0,
    right: hole.x + hole.w + GAP + CARD_W <= vw.w,
    left: hole.x - GAP - CARD_W >= 0,
  };
  const order: Array<keyof typeof fits> = [want, 'bottom', 'top', 'right', 'left'];
  const side = order.find((s) => fits[s]) ?? 'bottom';
  const clampX = (x: number) => Math.min(Math.max(12, x), vw.w - CARD_W - 12);
  const clampY = (y: number) => Math.min(Math.max(12, y), Math.max(12, vw.h - cardH - 12));
  switch (side) {
    case 'top': return { top: clampY(hole.y - GAP - cardH), left: clampX(hole.x + hole.w / 2 - CARD_W / 2) };
    case 'right': return { top: clampY(hole.y + hole.h / 2 - cardH / 2), left: clampX(hole.x + hole.w + GAP) };
    case 'left': return { top: clampY(hole.y + hole.h / 2 - cardH / 2), left: clampX(hole.x - GAP - CARD_W) };
    default: return { top: clampY(hole.y + hole.h + GAP), left: clampX(hole.x + hole.w / 2 - CARD_W / 2) };
  }
}
