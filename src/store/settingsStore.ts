import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { setSfxEnabled, setSfxVolume } from '@/lib/audio';

interface SettingsStore {
  /** Procedural sound effects during play. */
  sfxEnabled: boolean;
  /** Effect volume, 0-1. */
  sfxVolume: number;
  /** Skip entrance/transition animations. Mirrors prefers-reduced-motion when the OS sets it. */
  reduceMotion: boolean;
  /** Show the Archivist's book in the game header. Off hides every in-match entry point. */
  archivistInMatch: boolean;

  setSfxEnabled: (enabled: boolean) => void;
  setSfxVolume: (volume: number) => void;
  setReduceMotion: (reduce: boolean) => void;
  setArchivistInMatch: (on: boolean) => void;

  /**
   * Reset the preferences that belong to a person rather than to this device.
   * Called on sign-out and on an account switch so one tester's choices do not silently
   * become the next person's on a shared browser.
   */
  clearUserSettings: () => void;
}

const DEFAULTS = {
  sfxEnabled: true,
  sfxVolume: 0.7,
  reduceMotion: false,
  archivistInMatch: true,
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULTS,

      setSfxEnabled: (enabled) => {
        // Keep the audio module's module-level gate in step with the persisted setting.
        setSfxEnabled(enabled);
        set({ sfxEnabled: enabled });
      },
      setSfxVolume: (volume) => {
        setSfxVolume(volume);
        set({ sfxVolume: volume });
      },
      setReduceMotion: (reduce) => set({ reduceMotion: reduce }),
      setArchivistInMatch: (on) => set({ archivistInMatch: on }),

      clearUserSettings: () => {
        setSfxEnabled(DEFAULTS.sfxEnabled);
        setSfxVolume(DEFAULTS.sfxVolume);
        set({ ...DEFAULTS });
      },
    }),
    {
      name: 'undercroft-settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sfxEnabled: state.sfxEnabled,
        sfxVolume: state.sfxVolume,
        reduceMotion: state.reduceMotion,
        archivistInMatch: state.archivistInMatch,
      }),
      // Persisted values must be pushed into the audio module after rehydration, or the
      // in-memory gates stay at their defaults and ignore the user's choices.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        setSfxEnabled(state.sfxEnabled);
        setSfxVolume(state.sfxVolume);
      },
    }
  )
);
