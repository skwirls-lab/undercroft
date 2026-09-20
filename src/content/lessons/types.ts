/**
 * Apprentice mode is content, not prose files: typed data the pages render and the tests
 * can check (every quiz answer in range, every link to a lesson that exists, every phase,
 * step and server prompt explained). No model is involved; this is the rulebook, read
 * aloud at the right moment.
 */

import type { Phase, Step } from '@/lib/gameTypes';
import type { IssueKind } from '@/lib/deckRules';

export interface LessonSection {
  /** Stable id for deep links ("/learn/the-turn#combat"). */
  id: string;
  heading: string;
  /** Prose in the app's small markdown: paragraphs, "-" bullets, "1." lists, **bold**. */
  body: string;
  diagram?: 'turn' | 'stack' | 'zones' | 'combat';
}

export interface QuizQuestion {
  q: string;
  choices: string[];
  /** Index into `choices`. */
  answer: number;
  why: string;
}

export interface Lesson {
  id: string;
  title: string;
  eyebrow: string;
  summary: string;
  sections: LessonSection[];
  quiz?: QuizQuestion[];
}

/** A pointer into a lesson, for "Learn more" links. */
export interface LessonRef {
  lesson: string;
  section?: string;
}

export interface PhaseGuide {
  title: string;
  line: string;
  ref: LessonRef;
}

export interface StepGuide {
  /** One line: what happens now. */
  line: string;
  /** What the active player may do in this step, in the player's terms. */
  canDo: string;
  ref: LessonRef;
}

export interface PromptGuide {
  /** What the engine is asking, in one line. */
  what: string;
  /** How to answer it with Undercroft's controls. */
  how: string;
  ref?: LessonRef;
}

export type PhaseGuideMap = Record<Phase, PhaseGuide>;
export type StepGuideMap = Record<Step, StepGuide>;
export type IssueGuideMap = Record<IssueKind, LessonRef>;
