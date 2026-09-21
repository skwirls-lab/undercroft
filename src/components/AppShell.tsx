'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/firebase/auth';
import { useSettingsSheet } from '@/components/SettingsSheet';
import { useAppConfigStore } from '@/store/appConfigStore';
import { useForgeGameStore } from '@/store/forgeGameStore';
import { Megaphone } from 'lucide-react';
import { Keystone } from '@/components/brand/Keystone';
import { Library, Settings, Swords, Home, GraduationCap, ScrollText } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Persistent app chrome: a top bar on desktop, a bottom tab bar on phones.
 *
 * Absent on two routes: the signed-out landing page, which has its own hero chrome, and
 * /game/forge, where the board is full-bleed and every pixel of vertical space is in use.
 */

const TABS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/game', label: 'Play', icon: Swords },
  { href: '/decks', label: 'Decks', icon: Library },
  { href: '/history', label: 'History', icon: ScrollText },
  { href: '/learn', label: 'Learn', icon: GraduationCap },
] as const;

const HIDDEN_ON = ['/game/forge', '/dev/'];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const { openSettings } = useSettingsSheet();
  const notice = useAppConfigStore((s) => s.config.notice);
  // A match left running behind the rest of the app (the keystone, a lesson, the vault).
  const matchRunning = useForgeGameStore((s) => s.connectionStatus === 'connected' && s.gameState !== null && !s.isGameOver);

  const hidden = loading || !user || HIDDEN_ON.some((p) => pathname.startsWith(p));
  if (hidden) return <>{children}</>;

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <div className="flex min-h-screen flex-col">
      {/* Desktop / tablet: top bar */}
      <header className="sticky top-0 z-40 hidden border-b border-border/40 bg-background/75 backdrop-blur-md sm:block">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-1 px-6">
          <Link href="/" className="mr-5 flex items-center gap-2.5" aria-label="Home">
            <Keystone size={34} />
            <span className="font-display text-lg font-bold tracking-tight">
              <span className="text-gold">Under</span>croft
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            {TABS.filter((t) => t.href !== '/').map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(href) ? 'page' : undefined}
                className={cn(
                  'relative flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive(href) ? 'text-gold' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
                {isActive(href) && (
                  <span className="absolute inset-x-3 -bottom-[13px] h-px bg-gradient-to-r from-transparent via-gold to-transparent" />
                )}
              </Link>
            ))}
          </nav>

          <div className="flex-1" />

          <button
            onClick={openSettings}
            aria-label="Settings"
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          >
            <Settings className="h-4 w-4" />
            <span className="hidden md:inline">Settings</span>
          </button>

          {user.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.photoURL}
              alt=""
              onClick={openSettings}
              className="ml-2 h-8 w-8 cursor-pointer rounded-full border border-gold/30 ring-2 ring-background"
            />
          ) : null}
        </div>
      </header>

      {/* Admin notice — one line, every player, until the admin clears it */}
      {notice && (
        <div role="status" className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-200">
          <Megaphone className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" />
          {notice}
        </div>
      )}

      {/* A match is waiting: one line, every page, until it ends */}
      {matchRunning && (
        <Link href="/game/forge" className="flex items-center justify-center gap-2 border-b border-gold/30 bg-gold/10 px-4 py-2 text-center text-xs font-medium text-gold transition-colors hover:bg-gold/15" data-dev-return-banner>
          <Swords className="h-3.5 w-3.5" />
          A match is in progress — return to the table
        </Link>
      )}

      <div className="flex flex-1 flex-col pb-[calc(3.9rem+env(safe-area-inset-bottom))] sm:pb-0">{children}</div>

      {/* Phones: bottom tab bar, thumb-reachable */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/40 bg-background/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden">
        <div className="flex h-[3.9rem] items-stretch">
          {TABS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? 'page' : undefined}
              className={cn(
                'relative flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors',
                isActive(href) ? 'text-gold' : 'text-muted-foreground'
              )}
            >
              {isActive(href) && (
                <span className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-gold to-transparent" />
              )}
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          ))}
          <button
            onClick={openSettings}
            aria-label="Settings"
            className="flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium text-muted-foreground transition-colors"
          >
            <Settings className="h-5 w-5" />
            Settings
          </button>
        </div>
      </nav>
    </div>
  );
}
