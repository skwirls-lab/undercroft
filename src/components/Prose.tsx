'use client';

import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The app's small, predictable markdown: "##" headings, "-" bullets, numbered lists, and
 * **bold** for card names and terms. Used for the Archivist's answers (streaming safely: a
 * half-written line is a paragraph until it finishes) and for the Apprentice lessons.
 * Bold names become buttons when a handler is given.
 */
export function Prose({ text, onCard, className }: { text: string; onCard?: (name: string) => void; className?: string }) {
  const blocks = toBlocks(text);
  return (
    <div className={cn('flex flex-col gap-2.5 text-sm leading-relaxed text-foreground/90', className)}>
      {blocks.map((b, i) => {
        if (b.kind === 'heading') return <h4 key={i} className="eyebrow mt-1.5 !text-gold">{inline(b.text, onCard)}</h4>;
        if (b.kind === 'ul') return <ul key={i} className="flex list-disc flex-col gap-1 pl-5 marker:text-gold/70">{b.items.map((it, j) => <li key={j}>{inline(it, onCard)}</li>)}</ul>;
        if (b.kind === 'ol') return <ol key={i} className="flex list-decimal flex-col gap-1 pl-5 marker:text-gold/70">{b.items.map((it, j) => <li key={j}>{inline(it, onCard)}</li>)}</ol>;
        return <p key={i}>{inline(b.text, onCard)}</p>;
      })}
    </div>
  );
}

export type Block = { kind: 'heading'; text: string } | { kind: 'ul'; items: string[] } | { kind: 'ol'; items: string[] } | { kind: 'p'; text: string };

export function toBlocks(text: string): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { out.push({ kind: 'p', text: para.join(' ') }); para = []; } };
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const h = /^#{1,4}\s+(.*)$/.exec(line);
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (h) { flush(); out.push({ kind: 'heading', text: h[1] }); continue; }
    if (ul) { flush(); const last = out[out.length - 1]; if (last?.kind === 'ul') last.items.push(ul[1]); else out.push({ kind: 'ul', items: [ul[1]] }); continue; }
    if (ol) { flush(); const last = out[out.length - 1]; if (last?.kind === 'ol') last.items.push(ol[1]); else out.push({ kind: 'ol', items: [ol[1]] }); continue; }
    if (!line.trim()) { flush(); continue; }
    para.push(line.trim());
  }
  flush();
  return out;
}

function inline(text: string, onCard?: (name: string) => void): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const m = /^\*\*([^*]+)\*\*$/.exec(part);
    if (!m) return <Fragment key={i}>{unemphasise(part)}</Fragment>;
    const name = m[1];
    if (!onCard) return <strong key={i} className="font-semibold text-foreground">{name}</strong>;
    return (
      <button key={i} type="button" onClick={() => onCard(name)} className="font-semibold text-foreground underline decoration-gold/40 decoration-dotted underline-offset-4 transition-colors hover:text-gold">
        {name}
      </button>
    );
  });
}

/** Single-asterisk emphasis is shown plain; the voice does not need italics. */
function unemphasise(s: string): string {
  return s.replace(/(^|\s)\*([^*]+)\*(?=\s|[.,;:!?]|$)/g, '$1$2');
}
