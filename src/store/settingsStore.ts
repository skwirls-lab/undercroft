import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AIProviderConfig } from '@/ai/types';
import { setSfxEnabled } from '@/lib/audio';

interface SettingsStore {
  aiProvider: AIProviderConfig | null;
  cardDataLoaded: boolean;
  cardDataProgress: number;
  forgeServerUrl: string;
  /** Procedural sound effects during play. */
  sfxEnabled: boolean;

  setAIProvider: (config: AIProviderConfig | null) => void;
  setCardDataLoaded: (loaded: boolean) => void;
  setCardDataProgress: (progress: number) => void;
  setForgeServerUrl: (url: string) => void;
  setSfxEnabled: (enabled: boolean) => void;
  /**
   * Drop settings that belong to the signed-in person rather than to this device.
   * Called on sign-out and on an account switch so one tester's LLM API key is never
   * handed to the next person to use the browser.
   */
  clearUserSettings: () => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      aiProvider: null,
      cardDataLoaded: false,
      cardDataProgress: 0,
      forgeServerUrl: 'ws://localhost:7000/game',
      sfxEnabled: true,

      setAIProvider: (config) => set({ aiProvider: config }),
      setCardDataLoaded: (loaded) => set({ cardDataLoaded: loaded }),
      setCardDataProgress: (progress) => set({ cardDataProgress: progress }),
      setForgeServerUrl: (url) => set({ forgeServerUrl: url }),
      setSfxEnabled: (enabled) => {
        // Keep the audio module's module-level gate in step with the persisted setting.
        setSfxEnabled(enabled);
        set({ sfxEnabled: enabled });
      },
      clearUserSettings: () => set({ aiProvider: null }),
    }),
    {
      name: 'undercroft-settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        aiProvider: state.aiProvider,
        cardDataLoaded: state.cardDataLoaded,
        forgeServerUrl: state.forgeServerUrl,
        sfxEnabled: state.sfxEnabled,
      }),
      // Persisted value must be pushed into the audio module after rehydration, or the
      // in-memory gate stays at its default and ignores the user's choice.
      onRehydrateStorage: () => (state) => {
        if (state) setSfxEnabled(state.sfxEnabled);
      },
    }
  )
);
