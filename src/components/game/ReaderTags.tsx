'use client';

import { useState } from 'react';
import { BookOpen, ArrowRight } from 'lucide-react';
import { useGameStore } from '@/store/gameStore';
import { useLessonSheet } from '@/store/lessonSheetStore';
import { keywordBlurb, keywordLabel, counterBlurb } from '@/lib/cardTerms';
import type { CardInstance } from '@/lib/gameTypes';

/**
 * The tags under a card in the reader — keywords, counters, attachments — made answerable.
 * Tap a keyword or a counter for one line on what it does; tap an attachment (or the card
 * this one is attached to) to read that card instead. A player who did not know what
 * Swiftfoot Boots did could see its name on the creature and nothing else.
 */
export function ReaderTags({ card, onSwap, fontSize, gap }: {
  card: CardInstance;
  onSwap: (card: CardInstance) => void;
  fontSize: string;
  gap: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const cardInstances = useGameStore((s) => s.gameState?.cardInstances);

  const attachments = (card.attachments.length > 0
    ? card.attachments.map((id) => cardInstances?.get(id)).filter((c): c is CardInstance => !!c)
    : [...(cardInstances?.values() ?? [])].filter((c) => c.attachedTo === card.instanceId));
  const host = card.attachedTo ? cardInstances?.get(card.attachedTo) ?? null : null;

  const tag = 'rounded font-semibold transition-colors';
  const pad = { fontSize, padding: 'clamp(1px,0.15vmin,1000px) clamp(4px,0.5vmin,1000px)' };
  const toggle = (key: string) => setOpen((o) => (o === key ? null : key));
  const blurbFor = (key: string): { title: string; text: string; lesson?: boolean } | null => {
    if (key.startsWith('kw:')) {
      const raw = key.slice(3);
      const text = keywordBlurb(raw);
      return { title: keywordLabel(raw), text: text ?? 'Not in the glossary yet. The card\'s rules text above says what it does.', lesson: true };
    }
    if (key.startsWith('ct:')) {
      const type = key.slice(3);
      const n = card.counters[type] ?? 0;
      return { title: `${n > 1 ? `${n}× ` : ''}${type} counter${n > 1 ? 's' : ''}`, text: counterBlurb(type) };
    }
    return null;
  };
  const shown = open ? blurbFor(open) : null;

  return (
    <>
      {card.cardData.keywords.length > 0 && (
        <div className="flex flex-wrap" style={{ gap }}>
          {card.cardData.keywords.map((kw) => (
            <button
              type="button"
              key={kw}
              onClick={() => toggle(`kw:${kw}`)}
              aria-pressed={open === `kw:${kw}`}
              className={`${tag} bg-amber-600/80 text-amber-100 hover:bg-amber-500/90 ${open === `kw:${kw}` ? 'ring-1 ring-amber-200/80' : ''}`}
              style={pad}
              title="What does this do?"
              data-dev-reader-keyword
            >
              {keywordLabel(kw)}
            </button>
          ))}
        </div>
      )}
      {Object.keys(card.counters).length > 0 && (
        <div className="flex flex-wrap" style={{ gap }}>
          {Object.entries(card.counters).map(([type, count]) => (
            <button
              type="button"
              key={type}
              onClick={() => toggle(`ct:${type}`)}
              aria-pressed={open === `ct:${type}`}
              className={`${tag} text-white ${type === '+1/+1' ? 'bg-green-600/80 hover:bg-green-500/90' : type === '-1/-1' ? 'bg-red-600/80 hover:bg-red-500/90' : 'bg-purple-600/80 hover:bg-purple-500/90'} ${open === `ct:${type}` ? 'ring-1 ring-white/70' : ''}`}
              style={pad}
              title="What does this counter do?"
              data-dev-reader-counter
            >
              {count > 1 ? `${count}x ` : ''}{type}
            </button>
          ))}
        </div>
      )}
      {(attachments.length > 0 || card.attachmentNames.length > 0) && (
        <div className="flex flex-wrap" style={{ gap }}>
          {attachments.length > 0
            ? attachments.map((a) => (
                <button
                  type="button"
                  key={a.instanceId}
                  onClick={() => onSwap(a)}
                  className={`${tag} flex items-center gap-1 bg-sky-600/80 text-sky-100 hover:bg-sky-500/90`}
                  style={pad}
                  title={`Read ${a.cardData.name}`}
                  data-dev-reader-attachment
                >
                  ⚔ {a.cardData.name} <ArrowRight className="h-2.5 w-2.5" />
                </button>
              ))
            : card.attachmentNames.map((name, i) => (
                <span key={i} className={`${tag} bg-sky-600/80 text-sky-100`} style={pad}>⚔ {name}</span>
              ))}
        </div>
      )}
      {(host || card.attachedToName) && (
        <div className="flex flex-wrap items-center" style={{ gap }}>
          <span className="text-white/50" style={{ fontSize }}>Attached to</span>
          {host ? (
            <button type="button" onClick={() => onSwap(host)} className={`${tag} flex items-center gap-1 bg-sky-600/80 text-sky-100 hover:bg-sky-500/90`} style={pad} title={`Read ${host.cardData.name}`} data-dev-reader-host>
              {host.cardData.name} <ArrowRight className="h-2.5 w-2.5" />
            </button>
          ) : (
            <span className={`${tag} bg-sky-600/80 text-sky-100`} style={pad}>{card.attachedToName}</span>
          )}
        </div>
      )}
      {shown && (
        <div className="rounded-md border border-white/10 bg-white/[0.04] leading-snug text-white/80" style={{ fontSize, padding: 'clamp(4px,0.6vmin,1000px) clamp(6px,0.8vmin,1000px)' }} data-dev-reader-blurb>
          <span className="font-semibold text-white">{shown.title}.</span> {shown.text}
          {shown.lesson && (
            <button type="button" onClick={() => useLessonSheet.getState().open({ lesson: 'keywords', section: 'glossary' })} className="ml-1 inline-flex items-center gap-0.5 whitespace-nowrap text-gold/80 hover:text-gold">
              Glossary <BookOpen className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
      )}
    </>
  );
}
