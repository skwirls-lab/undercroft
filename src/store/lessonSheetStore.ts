import { create } from 'zustand';
import type { LessonRef } from '@/content/lessons';

/**
 * The lesson drawer: a lesson opened beside whatever the player is doing, so "Learn more"
 * during a match never leaves the table. Module state rather than a context so the strip
 * and the prompt guide (which lives inside the choice overlay) can both open it.
 */
interface LessonSheetStore {
  ref: LessonRef | null;
  open: (ref: LessonRef) => void;
  close: () => void;
}

export const useLessonSheet = create<LessonSheetStore>((set) => ({
  ref: null,
  open: (ref) => set({ ref }),
  close: () => set({ ref: null }),
}));
