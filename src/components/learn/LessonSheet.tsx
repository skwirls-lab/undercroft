'use client';

import { useEffect, useRef } from 'react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { GraduationCap, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useLessonSheet } from '@/store/lessonSheetStore';
import { LESSON_BY_ID } from '@/content/lessons';
import { LessonView } from './LessonView';

/**
 * A lesson in a drawer: right side on a desktop, most of the screen on a phone. Opens at
 * the section the link named. The game underneath keeps running; closing returns to it.
 */
export function LessonSheet() {
  const ref = useLessonSheet((s) => s.ref);
  const open = useLessonSheet((s) => s.open);
  const close = useLessonSheet((s) => s.close);
  const narrow = useMediaQuery('(max-width: 640px)');
  const bodyRef = useRef<HTMLDivElement>(null);
  const lesson = ref ? LESSON_BY_ID.get(ref.lesson) ?? null : null;

  useEffect(() => {
    if (!ref?.section || !bodyRef.current) return;
    const t = setTimeout(() => {
      const el = bodyRef.current?.querySelector<HTMLElement>(`[data-section="${ref.section}"]`);
      const scroller = el?.closest<HTMLElement>('[data-dev-lesson-scroll]');
      if (!el || !scroller) return;
      // Scroll the drawer itself, not the page behind it.
      const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 12;
      scroller.scrollTo({ top, behavior: 'smooth' });
    }, 160);
    return () => clearTimeout(t);
  }, [ref]);

  return (
    <Sheet open={!!lesson} onOpenChange={(v) => { if (!v) close(); }}>
      {/* The height must carry the side variant's prefix: the base style sets a bottom sheet
          to h-auto, which otherwise wins and lets the drawer grow to the lesson's full
          length, top and close button off the screen and nothing left to scroll. */}
      <SheetContent
        side={narrow ? 'bottom' : 'right'}
        showCloseButton={false}
        className={cn('flex flex-col gap-0 overflow-hidden p-0', narrow ? 'data-[side=bottom]:h-[88dvh] data-[side=bottom]:max-h-[88dvh] rounded-t-2xl' : 'w-full sm:max-w-xl')}
        data-dev-lesson-sheet
      >
        <SheetTitle className="sr-only">{lesson?.title ?? 'Lesson'}</SheetTitle>
        <div className="flex shrink-0 items-center gap-2 border-b border-border/40 px-4 py-2">
          <GraduationCap className="h-4 w-4 shrink-0 text-gold" />
          <p className="min-w-0 flex-1 truncate text-sm font-medium">{lesson?.title}</p>
          <Button variant="ghost" size="icon-sm" onClick={close} aria-label="Close the lesson" className="text-muted-foreground" data-dev-lesson-close><X className="h-4 w-4" /></Button>
        </div>
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-dev-lesson-scroll>
          {lesson && <LessonView lesson={lesson} embedded onNavigate={(id) => open({ lesson: id })} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
