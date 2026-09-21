'use client';

import { GraduationCap, BookOpen } from 'lucide-react';
import { useSettingsStore } from '@/store/settingsStore';
import { PROMPT_GUIDE } from '@/content/lessons';
import { useLessonSheet } from '@/store/lessonSheetStore';

/**
 * The Apprentice's line at the foot of a server prompt: what is being asked and how to
 * answer it with these controls. Shown only while Apprentice mode is on, and never for the
 * priority prompt itself (the strip covers that).
 */
export function PromptGuide({ choiceType }: { choiceType: string }) {
  const on = useSettingsStore((s) => s.apprenticeMode);
  const guide = PROMPT_GUIDE[choiceType];
  if (!on || !guide || choiceType === 'choose_action') return null;
  return (
    <div className="mt-2 flex items-start gap-2 rounded-lg border border-gold/25 bg-gold/[0.06] px-3 py-2" data-dev-prompt-guide style={{ fontSize: 'clamp(10px,1.8vmin,1000px)' }}>
      <GraduationCap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
      <p className="min-w-0 flex-1 leading-snug text-foreground/85">
        <span className="font-medium text-foreground">{guide.what}</span> {guide.how}
        {guide.ref && (
          <button type="button" onClick={() => useLessonSheet.getState().open(guide.ref!)} className="ml-1.5 inline-flex items-center gap-0.5 whitespace-nowrap text-gold/80 hover:text-gold">Learn more <BookOpen className="h-3 w-3" /></button>
        )}
        {choiceType !== 'mulligan' && (
          <span className="block text-foreground/60">Need to check the boards first? <span className="font-medium text-foreground/80">Peek at the table</span> hides this prompt until you come back; nothing is sent meanwhile.</span>
        )}
      </p>
    </div>
  );
}
