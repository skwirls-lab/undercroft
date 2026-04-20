'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/firebase/auth';
import { Button } from '@/components/ui/button';
import {
  Swords,
  Library,
  Settings,
  LogIn,
  LogOut,
  Loader2,
} from 'lucide-react';

export default function Home() {
  const { user, loading, signInWithGoogle, signOut } = useAuth();

  return (
    <div className="flex min-h-screen flex-col">
      {/* Nav */}
      <header className="flex items-center justify-between border-b border-border/50 px-6 py-4">
        <h2 className="text-lg font-semibold tracking-tight text-gold">
          Undercroft
        </h2>
        <div className="flex items-center gap-3">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : user ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {user.displayName || user.email}
              </span>
              <Button variant="ghost" size="sm" onClick={signOut}>
                <LogOut className="mr-1 h-4 w-4" />
                Sign out
              </Button>
            </div>
          ) : (
            <Button variant="ghost" size="sm" onClick={signInWithGoogle}>
              <LogIn className="mr-1 h-4 w-4" />
              Sign in
            </Button>
          )}
        </div>
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center justify-center gap-10 px-6">
        <div className="flex flex-col items-center gap-5 text-center">
          {/* Logo placeholder — replace with actual logo */}
          <div className="relative flex h-24 w-24 items-center justify-center rounded-2xl border border-gold/30 bg-card/80 glow-gold">
            <Swords className="h-12 w-12 text-gold" />
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-gold/10 to-transparent pointer-events-none" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            <span className="text-gold">Under</span><span className="text-foreground">croft</span>
          </h1>
          <p className="max-w-lg text-lg leading-relaxed text-muted-foreground">
            Play Magic: The Gathering Commander against AI opponents.
            <br className="hidden sm:block" />
            Modern, fast, in your browser.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/game">
            <Button size="lg" className="w-full sm:w-auto gap-2 bg-gold text-gold-foreground hover:bg-gold/90 shadow-[0_0_20px_rgba(212,169,68,0.2)] font-semibold">
              <Swords className="h-5 w-5" />
              New Game
            </Button>
          </Link>
          <Link href="/decks">
            <Button size="lg" variant="secondary" className="w-full sm:w-auto gap-2">
              <Library className="h-5 w-5" />
              My Decks
            </Button>
          </Link>
          <Link href="/settings">
            <Button size="lg" variant="outline" className="w-full sm:w-auto gap-2 border-border/40">
              <Settings className="h-5 w-5" />
              Settings
            </Button>
          </Link>
        </div>

        <div className="mt-4 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
          <FeatureCard
            title="AI Opponents"
            description="Play Commander against LLM-powered AI that makes strategic decisions."
          />
          <FeatureCard
            title="Import Decks"
            description="Paste a decklist and start playing immediately. No setup friction."
          />
          <FeatureCard
            title="Modern UI"
            description="Clean, responsive interface designed for both desktop and mobile."
          />
        </div>
      </main>

      <footer className="border-t border-border/50 px-6 py-4 text-center text-sm text-muted-foreground">
        Card data provided by Scryfall. Undercroft is not affiliated with Wizards of the Coast.
      </footer>
    </div>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5 transition-colors hover:border-gold/20 hover:bg-card/80">
      <h3 className="mb-1.5 font-semibold text-foreground">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}
