'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/firebase/auth';
import { useDeckStore } from '@/store/deckStore';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Swords,
  Library,
  Settings,
  LogIn,
  LogOut,
  Loader2,
  Shield,
  Layers,
  Bot,
  Sparkles,
  ArrowRight,
  ChevronRight,
  Zap,
  Globe,
} from 'lucide-react';

// ─── Root ────────────────────────────────────────────────────────────────────

export default function Home() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
          <span className="text-sm text-muted-foreground">Loading…</span>
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
    <div className="flex min-h-screen flex-col overflow-hidden">
      {/* ── Nav ────────────────────────────── */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/15">
            <Swords className="h-4 w-4 text-gold" />
          </div>
          <span className="text-lg font-bold tracking-tight">
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

      {/* ── Hero ───────────────────────────── */}
      <section className="relative flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        {/* Ambient glows */}
        <div className="pointer-events-none absolute inset-0 select-none">
          <div className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 h-[700px] w-[900px] bg-[radial-gradient(ellipse,rgba(212,169,68,0.07),transparent_60%)]" />
          <div className="absolute right-0 top-0 h-[500px] w-[500px] bg-[radial-gradient(circle,rgba(100,60,180,0.06),transparent_70%)]" />
          <div className="absolute bottom-0 left-0 h-[400px] w-[400px] bg-[radial-gradient(circle,rgba(60,120,200,0.05),transparent_70%)]" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="relative z-10 flex flex-col items-center gap-7"
        >
          {/* Logo */}
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 180, damping: 18 }}
            className="relative flex h-28 w-28 items-center justify-center rounded-3xl border border-gold/30 bg-card/80 shadow-[0_0_40px_rgba(212,169,68,0.15)]"
          >
            <Swords className="h-14 w-14 text-gold" />
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-gold/15 to-transparent pointer-events-none" />
            {/* Pulse ring */}
            <div className="absolute inset-0 rounded-3xl animate-ping opacity-[0.06] bg-gold" style={{ animationDuration: '3s' }} />
          </motion.div>

          {/* Title */}
          <div>
            <h1 className="text-5xl font-black tracking-tight sm:text-7xl lg:text-8xl">
              <span className="text-gold">Under</span>
              <span className="text-foreground">croft</span>
            </h1>
            <p className="mt-3 text-sm font-semibold uppercase tracking-[0.25em] text-gold/50 sm:text-base">
              Commander &middot; Reimagined
            </p>
          </div>

          {/* Tagline */}
          <p className="max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
            Play <strong className="text-foreground">Magic: The Gathering Commander</strong> against
            AI opponents — right in your browser. Full rules engine, real cards, no downloads.
          </p>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.5 }}
          >
            <Button
              size="lg"
              onClick={signInWithGoogle}
              className="gap-2.5 bg-gold text-gold-foreground hover:bg-gold/90 shadow-[0_0_32px_rgba(212,169,68,0.3)] font-bold text-base px-8 py-6 rounded-xl"
            >
              <LogIn className="h-5 w-5" />
              Sign In to Play
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </motion.div>
        </motion.div>
      </section>

      {/* ── Features ───────────────────────── */}
      <section className="relative z-10 px-6 py-16 sm:px-10">
        <motion.h2
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mb-8 text-center text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/50"
        >
          Everything you need to play Commander
        </motion.h2>
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <FeatureCard
            icon={<Shield className="h-5 w-5" />}
            title="Full Rules Engine"
            description="Powered by Forge — the most complete MTG rules implementation. Every keyword, every interaction."
            delay={0}
          />
          <FeatureCard
            icon={<Layers className="h-5 w-5" />}
            title="Import Any Deck"
            description="Paste your decklist and play immediately. All Commander-legal cards supported via Scryfall."
            delay={0.08}
          />
          <FeatureCard
            icon={<Bot className="h-5 w-5" />}
            title="AI Opponents"
            description="Battle AI that understands priority, combat, the stack, and mana. Up to 3 opponents at once."
            delay={0.16}
          />
          <FeatureCard
            icon={<Globe className="h-5 w-5" />}
            title="Play Anywhere"
            description="Runs entirely in your browser. No client downloads, no installations. Just open and play."
            delay={0.24}
          />
        </div>
      </section>

      {/* ── How it works ───────────────────── */}
      <section className="relative z-10 px-6 py-16 sm:px-10">
        <div className="mx-auto max-w-3xl">
          <motion.h2
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="mb-10 text-center text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/50"
          >
            Get started in 3 steps
          </motion.h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <StepCard step={1} title="Sign In" description="Sign in with Google — your decks sync across devices automatically." />
            <StepCard step={2} title="Import a Deck" description="Paste a Commander decklist or use one of the built-in starter decks." />
            <StepCard step={3} title="Play" description="Choose your opponents, shuffle up, and battle. The full Commander experience." />
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ─────────────────────── */}
      <section className="relative z-10 px-6 py-12 sm:px-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-xl rounded-2xl border border-gold/20 bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-sm p-8 text-center shadow-[0_0_40px_rgba(212,169,68,0.06)]"
        >
          <Sparkles className="mx-auto mb-4 h-8 w-8 text-gold/50" />
          <h2 className="text-xl font-bold text-foreground">Ready to play?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in with Google to import your decks and start battling.
          </p>
          <Button
            size="lg"
            variant="outline"
            onClick={signInWithGoogle}
            className="mt-6 gap-2 border-gold/30 text-gold hover:bg-gold/10 hover:text-gold"
          >
            <LogIn className="h-4 w-4" />
            Get Started Free
          </Button>
        </motion.div>
      </section>

      {/* ── Footer ─────────────────────────── */}
      <footer className="relative z-10 border-t border-border/20 px-6 py-8 text-center">
        <p className="text-xs text-muted-foreground/50">
          Card data provided by Scryfall. Game engine powered by Forge.
          <br />
          Undercroft is not affiliated with Wizards of the Coast.
        </p>
      </footer>
    </div>
  );
}

// ─── Dashboard (logged in) ───────────────────────────────────────────────────

function Dashboard() {
  const { user, signOut } = useAuth();
  const { decks } = useDeckStore();

  return (
    <div className="flex min-h-screen flex-col">
      {/* ── Nav ────────────────────────────── */}
      <header className="flex items-center justify-between border-b border-border/30 px-6 py-4 sm:px-10">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold/15">
            <Swords className="h-3.5 w-3.5 text-gold" />
          </div>
          <span className="text-lg font-bold tracking-tight">
            <span className="text-gold">Under</span>croft
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {user?.displayName || user?.email}
          </span>
          <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground hover:text-foreground">
            <LogOut className="mr-1.5 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </header>

      {/* ── Content ────────────────────────── */}
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-6 py-10 sm:px-10">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Welcome back
            <span className="text-gold">
              {user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}
            </span>
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            What would you like to do?
          </p>
        </div>

        {/* Quick actions */}
        <div className="grid gap-4 sm:grid-cols-3">
          <DashboardCard
            href="/game"
            icon={<Swords className="h-7 w-7 text-gold" />}
            title="New Game"
            description="Start a Commander match against AI opponents"
            accent
          />
          <DashboardCard
            href="/decks"
            icon={<Library className="h-7 w-7 text-gold" />}
            title="My Decks"
            description={`Import and manage your decklists${decks.length > 0 ? ` · ${decks.length} deck${decks.length !== 1 ? 's' : ''}` : ''}`}
          />
          <DashboardCard
            href="/settings"
            icon={<Settings className="h-7 w-7 text-gold" />}
            title="Settings"
            description="AI provider, card database, preferences"
          />
        </div>

        {/* Quick tips for new users */}
        {decks.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-gold/20 bg-gold/[0.03] p-6"
          >
            <div className="flex items-start gap-3">
              <Zap className="mt-0.5 h-5 w-5 shrink-0 text-gold/60" />
              <div>
                <h3 className="font-semibold text-foreground">Get started</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Head to <Link href="/decks" className="text-gold underline underline-offset-2">My Decks</Link> to
                  import a Commander decklist, or jump straight into
                  a <Link href="/game" className="text-gold underline underline-offset-2">New Game</Link> with
                  a built-in starter deck.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </main>

      <footer className="border-t border-border/20 px-6 py-5 text-center text-xs text-muted-foreground/50">
        Card data provided by Scryfall. Undercroft is not affiliated with Wizards of the Coast.
      </footer>
    </div>
  );
}

// ─── Shared sub-components ───────────────────────────────────────────────────

function FeatureCard({
  icon,
  title,
  description,
  delay = 0,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay }}
      className="group rounded-2xl border border-border/25 bg-card/30 p-6 transition-all hover:border-gold/20 hover:bg-card/50 hover:shadow-[0_0_24px_rgba(212,169,68,0.05)]"
    >
      <div className="mb-3.5 flex h-10 w-10 items-center justify-center rounded-xl bg-gold/10 text-gold transition-colors group-hover:bg-gold/15">
        {icon}
      </div>
      <h3 className="mb-1.5 font-bold text-foreground">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
    </motion.div>
  );
}

function StepCard({ step, title, description }: { step: number; title: string; description: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: step * 0.1 }}
      className="flex flex-col items-center gap-3 text-center"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/30 bg-gold/10 text-sm font-black text-gold">
        {step}
      </div>
      <h3 className="font-bold text-foreground">{title}</h3>
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
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  accent?: boolean;
}) {
  return (
    <Link href={href}>
      <div
        className={cn(
          'group flex h-full flex-col gap-4 rounded-2xl border p-6 transition-all cursor-pointer hover:shadow-lg',
          accent
            ? 'border-gold/30 bg-gold/[0.04] hover:border-gold/50 hover:bg-gold/[0.07] hover:shadow-[0_0_24px_rgba(212,169,68,0.1)]'
            : 'border-border/30 bg-card/30 hover:border-border/50 hover:bg-card/50'
        )}
      >
        <div className="flex items-center justify-between">
          {icon}
          <ChevronRight className="h-4 w-4 text-muted-foreground/30 transition-all group-hover:translate-x-0.5 group-hover:text-muted-foreground/60" />
        </div>
        <div>
          <h3 className="font-bold text-foreground">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </Link>
  );
}
