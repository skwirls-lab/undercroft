'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useSettingsStore } from '@/store/settingsStore';
import { useDeckStore } from '@/store/deckStore';
import { useAuth } from '@/lib/firebase/auth';
import { sfxCastSpell } from '@/lib/audio';
import { LogOut, Volume2, VolumeX, Sparkles, User as UserIcon, GraduationCap } from 'lucide-react';
import Link from 'next/link';
import { Keystone } from '@/components/brand/Keystone';
import { SectionLabel, ToggleRow } from '@/components/settings/controls';
import { AdminPanel } from '@/components/admin/AdminPanel';
import { ArchivistSettings } from '@/components/archivist/ArchivistSettings';
import { isAdminUid } from '@/lib/admin';

/**
 * Settings as an overlay rather than a route.
 *
 * It used to be a full page with three sections, two of which configured things that no
 * longer exist: an LLM provider for the retired in-browser game engine, and an IndexedDB
 * card cache that was written but never read. What remained did not justify a page, and
 * leaving the route meant navigating away from whatever you were doing to flip one switch.
 *
 * Every control here changes something real. If a setting has no effect, it does not belong.
 */

interface SettingsSheetContextValue {
  openSettings: () => void;
  closeSettings: () => void;
}

const SettingsSheetContext = createContext<SettingsSheetContextValue>({
  openSettings: () => {},
  closeSettings: () => {},
});

export const useSettingsSheet = () => useContext(SettingsSheetContext);

export function SettingsSheetProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  const value = useMemo(
    () => ({ openSettings: () => setOpen(true), closeSettings: () => setOpen(false) }),
    []
  );

  return (
    <SettingsSheetContext.Provider value={value}>
      {children}
      <SettingsSheet open={open} onOpenChange={setOpen} />
    </SettingsSheetContext.Provider>
  );
}

function SettingsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { sfxEnabled, sfxVolume, reduceMotion, apprenticeMode, setSfxEnabled, setSfxVolume, setReduceMotion, setApprenticeMode } =
    useSettingsStore();
  const { user, signOut } = useAuth();
  const decks = useDeckStore((s) => s.decks);

  // Play a sample on release rather than on every input event, so dragging the slider does
  // not fire a burst of overlapping oscillators.
  const previewVolume = useCallback(() => {
    if (sfxEnabled) sfxCastSpell();
  }, [sfxEnabled]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b border-border/40 pb-4">
          <div className="flex items-center gap-3">
            <Keystone size={40} />
            <div>
              <SheetTitle className="font-display text-xl">Settings</SheetTitle>
              <SheetDescription>Preferences are saved on this device.</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-8 py-6">
          <section className="flex flex-col gap-4">
            <SectionLabel>Sound</SectionLabel>

            <ToggleRow
              label="Sound effects"
              hint="Short tones for casting, damage, life changes and turn starts."
              checked={sfxEnabled}
              onChange={setSfxEnabled}
              icon={sfxEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            />

            <div className={sfxEnabled ? '' : 'pointer-events-none opacity-40'}>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-sm font-medium">Volume</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {Math.round(sfxVolume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round(sfxVolume * 100)}
                onChange={(e) => setSfxVolume(Number(e.target.value) / 100)}
                onMouseUp={previewVolume}
                onTouchEnd={previewVolume}
                onKeyUp={previewVolume}
                aria-label="Sound effect volume"
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-[var(--gold)]"
              />
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <SectionLabel>Display</SectionLabel>
            <ToggleRow
              label="Reduce motion"
              hint="Skip entrance and transition animations across the app."
              checked={reduceMotion}
              onChange={setReduceMotion}
              icon={<Sparkles className="h-4 w-4" />}
            />
          </section>

          <section className="flex flex-col gap-4" data-dev-apprentice-settings>
            <SectionLabel>Learning</SectionLabel>
            <ToggleRow
              label="Apprentice mode"
              hint="A line under the game header explains each step and every prompt, with a link to the lesson. Free, no model involved."
              checked={apprenticeMode}
              onChange={setApprenticeMode}
              icon={<GraduationCap className="h-4 w-4" />}
            />
            <Link href="/learn" onClick={() => onOpenChange(false)} className="px-1 text-xs text-gold underline-offset-4 hover:underline">Read the lessons →</Link>
          </section>

          <ArchivistSettings />

          <section className="flex flex-col gap-3">
            <SectionLabel>Account</SectionLabel>
            <div className="flex items-center gap-3 rounded-lg border border-border/40 px-4 py-3">
              {user?.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.photoURL}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-full border border-border/50"
                />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/50">
                  <UserIcon className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{user?.displayName ?? 'Signed in'}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </div>
            <p className="px-1 text-xs text-muted-foreground">
              {decks.length === 0
                ? 'No decks saved yet.'
                : `${decks.length} deck${decks.length === 1 ? '' : 's'} synced to your account.`}
            </p>
            <Button
              variant="ghost"
              onClick={() => {
                onOpenChange(false);
                void signOut();
              }}
              className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </section>

          {isAdminUid(user?.uid) && <AdminPanel />}

          <p className="border-t border-border/30 pt-5 text-xs leading-relaxed text-muted-foreground/60">
            Powered by the Forge rules engine. Card data from Scryfall. Undercroft is not
            affiliated with Wizards of the Coast.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
