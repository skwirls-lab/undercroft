'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { GraduationCap, ChevronRight, BookOpen } from 'lucide-react';
import { Alcove } from '@/components/brand/Alcove';
import { LESSONS } from '@/content/lessons';
import { useSettingsStore } from '@/store/settingsStore';
import { ToggleRow } from '@/components/settings/controls';
import { rise, riseStagger } from '@/lib/motion';

export function LearnIndex() {
  const { apprenticeMode, setApprenticeMode } = useSettingsStore();
  return (
    <div className="mx-auto w-full max-w-5xl px-5 pb-16 pt-6 sm:px-10 sm:pt-8">
      <motion.div variants={riseStagger(0.06, 0.05)} initial="hidden" animate="show" className="flex flex-col gap-8">
        <motion.header variants={rise} className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">The Apprentice</p>
            <h1 className="mt-1.5 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">Learn Commander</h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">The rules as the engine plays them, in the order a new player needs them. Free, no account needed. With Apprentice mode on, the same lessons appear beside the board as the game reaches them.</p>
          </div>
          <div className="sm:w-80">
            <ToggleRow label="Apprentice mode" hint="A line under the game header says what is happening and what you can do." checked={apprenticeMode} onChange={setApprenticeMode} icon={<GraduationCap className="h-4 w-4" />} />
          </div>
        </motion.header>

        <motion.div variants={rise} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LESSONS.map((l, i) => (
            <Link key={l.id} href={`/learn/${l.id}`} className="group block h-full" data-dev-lesson={l.id}>
              <Alcove className="flex h-full flex-col px-5 pb-5 pt-10 transition-colors group-hover:border-gold/30">
                <p className="eyebrow">{l.eyebrow}</p>
                <h2 className="mt-1 font-display text-xl font-bold">{l.title}</h2>
                <p className="mt-2 flex-1 text-sm text-muted-foreground">{l.summary}</p>
                <span className="mt-4 flex items-center gap-1.5 text-xs font-medium text-gold">
                  {l.quiz ? <><GraduationCap className="h-3.5 w-3.5" /> {l.sections.length} sections · quiz</> : <><BookOpen className="h-3.5 w-3.5" /> {i === LESSONS.length - 1 ? 'reference' : `${l.sections.length} sections`}</>}
                  <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-gold" />
                </span>
              </Alcove>
            </Link>
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
}
