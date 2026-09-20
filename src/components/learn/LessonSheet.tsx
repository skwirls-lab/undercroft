'use client';

import { useEffect, useRef } from 'react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
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
      const scroller = el?.closest<HTMLElement>('[data-dev-lesson-sheet]');
      if (!el || !scroller) return;
      // Scroll the drawer itself, not the page behind it.
      const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 12;
      scroller.scrollTo({ top, behavior: 'smooth' });
    }, 160);
    return () => clearTimeout(t);
  }, [ref]);

  return (
    <Sheet open={!!lesson} onOpenChange={(v) => { if (!v) close(); }}>
      <SheetContent side={narrow ? 'bottom' : 'right'} className={narrow ? 'h-[88dvh] gap-0 overflow-y-auto rounded-t-2xl p-0' : 'w-full gap-0 overflow-y-auto p-0 sm:max-w-xl'} data-dev-lesson-sheet>
        <SheetTitle className="sr-only">{lesson?.title ?? 'Lesson'}</SheetTitle>
        <div ref={bodyRef}>
          {lesson && <LessonView lesson={lesson} embedded onNavigate={(id) => open({ lesson: id })} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
