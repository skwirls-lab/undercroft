'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, X, GraduationCap } from 'lucide-react';
import { Alcove, Eyebrow } from '@/components/brand/Alcove';
import { Prose } from '@/components/Prose';
import { Diagram } from './Diagrams';
import { KEYWORDS, LESSONS, type Lesson, type QuizQuestion } from '@/content/lessons';
import { rise, riseStagger } from '@/lib/motion';
import { cn } from '@/lib/utils';

/** One lesson: sections with their diagrams, the glossary when it is that lesson, a quiz at the end. */
export function LessonView({ lesson }: { lesson: Lesson }) {
  const index = LESSONS.findIndex((l) => l.id === lesson.id);
  const prev = index > 0 ? LESSONS[index - 1] : null;
  const next = index < LESSONS.length - 1 ? LESSONS[index + 1] : null;
  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-16 pt-6 sm:px-8 sm:pt-8">
      <Link href="/learn" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-gold"><ArrowLeft className="h-4 w-4" /> All lessons</Link>
      <motion.div variants={riseStagger(0.06, 0.05)} initial="hidden" animate="show" className="flex flex-col gap-6">
        <motion.header variants={rise}>
          <p className="eyebrow">{lesson.eyebrow}</p>
          <h1 className="mt-1.5 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{lesson.title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{lesson.summary}</p>
        </motion.header>

        {lesson.sections.map((s) => (
          <motion.section key={s.id} id={s.id} variants={rise} className="scroll-mt-20">
            <Alcove flat className="px-5 py-5 sm:px-6">
              <Eyebrow className="mb-3">{s.heading}</Eyebrow>
              {s.diagram && <Diagram kind={s.diagram} />}
              {lesson.id === 'keywords' && s.id === 'glossary' ? <Glossary /> : <Prose text={s.body} className="text-[0.95rem]" />}
            </Alcove>
          </motion.section>
        ))}

        {lesson.quiz && lesson.quiz.length > 0 && (
          <motion.section variants={rise} id="quiz" className="scroll-mt-20">
            <Alcove lit className="px-5 pb-5 pt-10 sm:px-6">
              <Eyebrow className="mb-3"><span className="flex items-center gap-1.5"><GraduationCap className="h-3.5 w-3.5" /> Check yourself</span></Eyebrow>
              <Quiz questions={lesson.quiz} />
            </Alcove>
          </motion.section>
        )}

        <motion.nav variants={rise} className="flex items-center justify-between gap-3 pt-2">
          {prev ? <Link href={`/learn/${prev.id}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-gold"><ArrowLeft className="h-4 w-4" /> {prev.title}</Link> : <span />}
          {next ? <Link href={`/learn/${next.id}`} className="flex items-center gap-1.5 text-sm font-medium text-gold hover:underline">{next.title} <ArrowRight className="h-4 w-4" /></Link> : <span />}
        </motion.nav>
      </motion.div>
    </div>
  );
}

function Glossary() {
  const sorted = [...KEYWORDS].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {sorted.map((k) => (
        <div key={k.name} className="rounded-lg border border-border/40 px-3 py-2">
          <dt className="text-sm font-semibold">{k.name}</dt>
          <dd className="mt-0.5 text-xs leading-snug text-muted-foreground">{k.text}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Instant, deterministic feedback; nothing is stored beyond this page. */
function Quiz({ questions }: { questions: QuizQuestion[] }) {
  const [picked, setPicked] = useState<Record<number, number>>({});
  const done = questions.filter((_, i) => picked[i] === questions[i].answer).length;
  return (
    <div className="flex flex-col gap-5">
      {questions.map((q, i) => {
        const p = picked[i];
        return (
          <div key={i} className="flex flex-col gap-2">
            <p className="text-sm font-medium">{i + 1}. {q.q}</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {q.choices.map((c, j) => {
                const chosen = p === j; const right = j === q.answer;
                return (
                  <button
                    key={j}
                    type="button"
                    onClick={() => setPicked((prev) => ({ ...prev, [i]: j }))}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                      p == null ? 'border-border/50 hover:border-gold/40' : chosen && right ? 'border-emerald-500/50 bg-emerald-500/10' : chosen ? 'border-destructive/50 bg-destructive/10' : right ? 'border-emerald-500/30' : 'border-border/30 text-muted-foreground'
                    )}
                    data-dev-quiz-choice
                  >
                    {p != null && (chosen || right) && (right ? <Check className="h-4 w-4 shrink-0 text-emerald-300" /> : <X className="h-4 w-4 shrink-0 text-destructive" />)}
                    {c}
                  </button>
                );
              })}
            </div>
            {p != null && <p className={cn('text-xs leading-snug', p === q.answer ? 'text-emerald-200' : 'text-muted-foreground')}>{q.why}</p>}
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">{done} of {questions.length} right{done === questions.length ? '. Onward.' : '.'}</p>
    </div>
  );
}
