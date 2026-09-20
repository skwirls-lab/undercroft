'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/firebase/auth';
import { useDeckStore } from '@/store/deckStore';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Keystone } from '@/components/brand/Keystone';
import { Arch } from '@/components/brand/Arch';
import { Alcove, Eyebrow } from '@/components/brand/Alcove';
import { ManaSymbol } from '@/components/game/ManaSymbol';
import { rise, riseStagger, settle } from '@/lib/motion';
import {
  Swords,
  Library,
  LogIn,
  Shield,
  Layers,
  Bot,
  ArrowRight,
  ChevronRight,
  Zap,
  Globe,
  Crown,
  Plus,
  GraduationCap,
} from 'lucide-react';

// ─── Root ────────────────────────────────────────────────────────────────────

export default function Home() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-5">
          <Keystone size={72} loading />
          <span className="eyebrow">Opening the vault</span>
        </div>
      </div>
    );
  }

  return user ? <Dashboard /> : <MarketingPage />;
}

// ─── Marketing Page (logged out) ─────────────────────────────────────────────

function MarketingPage() {
  const { signInWithGoogle } = useAuth();

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden">
      {/* ── Nav ────────────────────────────── */}
      <header className="relative z-10 flex items-center justify-between px-5 py-4 sm:px-10">
        <div className="flex items-center gap-3">
          <Keystone size={40} />
          <span className="font-display text-xl font-bold tracking-tight">
            <span className="text-gold">Under</span>croft
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={signInWithGoogle}
          className="gap-2 border-gold/30 text-gold hover:bg-gold/10 hover:text-gold"
        >
          <LogIn className="h-4 w-4" />
          Sign In
        </Button>
      </header>

      {/* ── Hero: the arch ─────────────────── */}
      <section className="relative flex flex-1 flex-col items-center justify-center px-4 pb-16 pt-6 text-center sm:pt-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-[560px]"
          style={{ aspectRatio: '400 / 420' }}
        >
          <Arch lit className="absolute inset-0 h-full w-full" />

          {/* Gems set at the crown */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.25, ...settle }}
            className="absolute left-1/2 top-[3.5%] -translate-x-1/2"
          >
            <Keystone size={132} className="drop-shadow-[0_0_18px_var(--gold-glow)]" />
          </motion.div>

          {/* Inside the opening */}
          <motion.div
            variants={riseStagger(0.09, 0.35)}
            initial="hidden"
            animate="show"
            className="absolute inset-x-[13%] bottom-[5%] top-[47%] flex flex-col items-center justify-center gap-3.5"
          >
            <motion.h1 variants={rise} className="font-display text-[clamp(2.6rem,11vw,4.6rem)] font-bold leading-none tracking-tight">
              <span className="text-gold">Under</span>
              <span className="text-foreground">croft</span>
            </motion.h1>
            <motion.p variants={rise} className="eyebrow text-[0.72rem] sm:text-[0.8rem]">
              Commander &middot; Reimagined
            </motion.p>
            <motion.p variants={rise} className="max-w-[26ch] text-sm leading-relaxed text-muted-foreground sm:text-base">
              Play <strong className="font-semibold text-foreground">Magic: The Gathering Commander</strong> against AI
              opponents, in your browser. Full rules engine, real cards, no downloads.
            </motion.p>
            <motion.div variants={rise}>
              <Button
                size="lg"
                onClick={signInWithGoogle}
                className="gap-2.5 rounded-xl bg-gold px-7 py-6 text-base font-bold text-gold-foreground shadow-[0_0_36px_var(--gold-glow)] hover:bg-gold/90"
              >
                <LogIn className="h-5 w-5" />
                Sign In to Play
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </motion.div>
          </motion.div>
        </motion.div>

        {/* Format strip — says "Commander" in the format's own terms */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9, duration: 0.6 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground/80 sm:text-sm"
        >
          <span className="flex items-center gap-1.5">
            {(['W', 'U', 'B', 'R', 'G'] as const).map((c) => (
              <ManaSymbol key={c} symbol={c} size="sm" />
            ))}
          </span>
          <Stat label="100" sub="card singleton" />
          <Stat label="40" sub="life" />
          <Stat label="21" sub="commander damage" />
          <Stat label="4" sub="player pods" />
        </motion.div>
      </section>

      {/* ── Features ───────────────────────── */}
      <section className="relative z-10 px-5 py-14 sm:px-10">
        <div className="mx-auto max-w-5xl">
          <Eyebrow className="mb-8 justify-center [&>span:last-child]:hidden">Everything you need to play Commander</Eyebrow>
          <motion.div
            variants={riseStagger(0.08)}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4"
          >
            <FeatureCard
              icon={<Shield className="h-5 w-5" />}
              title="Full Rules Engine"
              description="Powered by Forge — the most complete MTG rules implementation. Every keyword, every interaction."
            />
            <FeatureCard
              icon={<Layers className="h-5 w-5" />}
              title="Import Any Deck"
              description="Paste your decklist and play immediately. All Commander-legal cards supported via Scryfall."
            />
            <FeatureCard
              icon={<Bot className="h-5 w-5" />}
              title="AI Opponents"
              description="Battle AI that understands priority, combat, the stack, and mana. Up to 3 opponents at once."
            />
            <FeatureCard
              icon={<Globe className="h-5 w-5" />}
              title="Play Anywhere"
              description="Runs entirely in your browser. No client downloads, no installations. Just open and play."
            />
          </motion.div>
        </div>
      </section>

      {/* ── How it works ───────────────────── */}
      <section className="relative z-10 px-5 py-14 sm:px-10">
        <div className="mx-auto max-w-3xl">
          <Eyebrow className="mb-10 justify-center [&>span:last-child]:hidden">Get started in 3 steps</Eyebrow>
          <motion.div
            variants={riseStagger(0.1)}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
            className="grid grid-cols-1 gap-8 sm:grid-cols-3"
          >
            <StepCard step={1} title="Sign In" description="Sign in with Google — your decks sync across devices automatically." />
            <StepCard step={2} title="Import a Deck" description="Paste a Commander decklist or use one of the built-in starter decks." />
            <StepCard step={3} title="Play" description="Choose your opponents, shuffle up, and battle. The full Commander experience." />
          </motion.div>
        </div>
      </section>

      {/* ── Bottom CTA ─────────────────────── */}
      <section className="relative z-10 px-5 py-12 sm:px-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={settle}
          className="mx-auto max-w-xl"
        >
          <Alcove lit className="px-8 pb-8 pt-12 text-center">
            <Keystone size={64} className="mx-auto mb-4" />
            <h2 className="font-display text-2xl font-bold text-foreground">Ready to play?</h2>
            <p className="mt-2 text-sm text-muted-foreground">Sign in with Google to import your decks and start battling.</p>
            <Button
              size="lg"
              onClick={signInWithGoogle}
              className="mt-6 gap-2 bg-gold text-gold-foreground hover:bg-gold/90"
            >
              <LogIn className="h-4 w-4" />
              Get Started Free
            </Button>
          </Alcove>
        </motion.div>
      </section>

      {/* ── Footer ─────────────────────────── */}
      <footer className="relative z-10 border-t border-border/30 px-6 py-8 text-center">
        <p className="text-xs text-muted-foreground/60">
          Card data provided by Scryfall. Game engine powered by Forge.
          <br />
          Undercroft is not affiliated with Wizards of the Coast.
        </p>
      </footer>
    </div>
  );
}

function Stat({ label, sub }: { label: string; sub: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="font-display text-base font-bold text-foreground sm:text-lg">{label}</span>
      <span>{sub}</span>
    </span>
  );
}

// ─── Dashboard (logged in) ───────────────────────────────────────────────────

function Dashboard() {
  const { user } = useAuth();
  const { decks } = useDeckStore();
  const recent = [...decks].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4);
  const firstName = user?.displayName ? user.displayName.split(' ')[0] : null;

  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-5 py-8 sm:px-10 sm:py-12">
        {/* Welcome */}
        <motion.div variants={riseStagger(0.08)} initial="hidden" animate="show" className="flex flex-col gap-2">
          <motion.p variants={rise} className="eyebrow">
            The undercroft
          </motion.p>
          <motion.h1 variants={rise} className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Welcome back{firstName ? <>, <span className="text-gold">{firstName}</span></> : null}
          </motion.h1>
          <motion.p variants={rise} className="text-sm text-muted-foreground">
            {decks.length === 0
              ? 'Your vault is empty. Import a deck to begin.'
              : `${decks.length} deck${decks.length === 1 ? '' : 's'} in the vault.`}
          </motion.p>
        </motion.div>

        {/* Primary actions */}
        <motion.div
          variants={riseStagger(0.1, 0.15)}
          initial="hidden"
          animate="show"
          className="grid gap-5 sm:grid-cols-5"
        >
          <motion.div variants={rise} className="sm:col-span-3">
            <DashboardCard
              href="/game"
              icon={<Swords className="h-7 w-7" />}
              title="New Game"
              description="Start a Commander match against AI opponents."
              accent
              tall
            />
          </motion.div>
          <motion.div variants={rise} className="sm:col-span-2">
            <DashboardCard
              href="/decks"
              icon={<Library className="h-7 w-7" />}
              title="My Decks"
              description="Import and manage your decklists."
              tall
            />
          </motion.div>
          <motion.div variants={rise} className="sm:col-span-5">
            <Link href="/learn" className="group block" data-dev-learn-card>
              <Alcove flat className="flex items-center gap-4 px-5 py-4 transition-colors group-hover:border-gold/30">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/10 text-gold ring-1 ring-gold/20"><GraduationCap className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-lg font-bold">Learn Commander</span>
                  <span className="block text-sm text-muted-foreground">Eleven short lessons and a glossary. Apprentice mode reads them beside the board as the game reaches each rule.</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-gold" />
              </Alcove>
            </Link>
          </motion.div>
        </motion.div>

        {/* Recent decks */}
        {recent.length > 0 && (
          <motion.section variants={riseStagger(0.06, 0.3)} initial="hidden" animate="show" className="flex flex-col gap-4">
            <motion.div variants={rise}>
              <Eyebrow>Recent decks</Eyebrow>
            </motion.div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {recent.map((deck) => (
                <motion.div key={deck.id} variants={rise}>
                  <Link href={`/decks/${encodeURIComponent(deck.id)}`} className="group block">
                    <Alcove flat className="flex items-center gap-3 p-3 transition-colors group-hover:border-gold/30">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold">
                        <Crown className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{deck.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{deck.commanderName || 'No commander'}</p>
                      </div>
                      <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-gold" />
                    </Alcove>
                  </Link>
                </motion.div>
              ))}
              {decks.length < 4 && (
                <motion.div variants={rise}>
                  <Link href="/decks" className="group block">
                    <div className="flex h-full items-center gap-3 rounded-xl border border-dashed border-border/60 p-3 text-muted-foreground transition-colors group-hover:border-gold/40 group-hover:text-gold">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-current/40">
                        <Plus className="h-5 w-5" />
                      </div>
                      <p className="text-sm font-medium">Import a deck</p>
                    </div>
                  </Link>
                </motion.div>
              )}
            </div>
          </motion.section>
        )}

        {/* First-run guidance */}
        {decks.length === 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, ...settle }}>
            <Alcove flat className="p-6">
              <div className="flex items-start gap-3">
                <Zap className="mt-0.5 h-5 w-5 shrink-0 text-gold/70" />
                <div>
                  <h3 className="font-semibold text-foreground">Get started</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Head to{' '}
                    <Link href="/decks" className="text-gold underline underline-offset-2">
                      My Decks
                    </Link>{' '}
                    to import a Commander decklist, or jump straight into a{' '}
                    <Link href="/game" className="text-gold underline underline-offset-2">
                      New Game
                    </Link>{' '}
                    with a built-in starter deck.
                  </p>
                </div>
              </div>
            </Alcove>
          </motion.div>
        )}
      </main>
    </div>
  );
}

// ─── Shared sub-components ───────────────────────────────────────────────────

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <motion.div variants={rise} className="group h-full">
      <Alcove className="flex h-full flex-col px-6 pb-6 pt-9 transition-all group-hover:border-gold/30">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gold/10 text-gold ring-1 ring-gold/20 transition-colors group-hover:bg-gold/15">
          {icon}
        </div>
        <h3 className="mb-1.5 font-display text-lg font-bold text-foreground">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </Alcove>
    </motion.div>
  );
}

function StepCard({ step, title, description }: { step: number; title: string; description: string }) {
  return (
    <motion.div variants={rise} className="flex flex-col items-center gap-3 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-gold/40 bg-gold/10 font-display text-lg font-bold text-gold shadow-[0_0_20px_var(--gold-glow-soft)]">
        {step}
      </div>
      <h3 className="font-display text-lg font-bold text-foreground">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
    </motion.div>
  );
}

function DashboardCard({
  href,
  icon,
  title,
  description,
  accent,
  tall,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  accent?: boolean;
  tall?: boolean;
}) {
  return (
    <Link href={href} className="group block h-full">
      <Alcove
        lit={accent}
        className={cn(
          'flex h-full flex-col justify-end px-6 pb-6 pt-14 transition-all',
          tall && 'min-h-[200px] sm:min-h-[240px]',
          !accent && 'group-hover:border-gold/30'
        )}
      >
        <div
          className={cn(
            'mb-4 flex h-12 w-12 items-center justify-center rounded-xl ring-1 transition-colors',
            accent ? 'bg-gold text-gold-foreground ring-gold/60 shadow-[0_0_24px_var(--gold-glow)]' : 'bg-gold/10 text-gold ring-gold/20'
          )}
        >
          {icon}
        </div>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h3 className="font-display text-2xl font-bold text-foreground">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          <ChevronRight className="mb-1 h-5 w-5 shrink-0 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-gold" />
        </div>
      </Alcove>
    </Link>
  );
}
