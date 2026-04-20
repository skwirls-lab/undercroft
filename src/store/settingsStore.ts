import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AIProviderConfig } from '@/ai/types';

interface SettingsStore {
  aiProvider: AIProviderConfig | null;
  cardDataLoaded: boolean;
  cardDataProgress: number;
  forgeServerUrl: string;

  setAIProvider: (config: AIProviderConfig | null) => void;
  setCardDataLoaded: (loaded: boolean) => void;
  setCardDataProgress: (progress: number) => void;
  setForgeServerUrl: (url: string) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      aiProvider: null,
      cardDataLoaded: false,
      cardDataProgress: 0,
      forgeServerUrl: 'ws://localhost:7000/game',

      setAIProvider: (config) => set({ aiProvider: config }),
      setCardDataLoaded: (loaded) => set({ cardDataLoaded: loaded }),
      setCardDataProgress: (progress) => set({ cardDataProgress: progress }),
      setForgeServerUrl: (url) => set({ forgeServerUrl: url }),
    }),
    {
      name: 'undercroft-settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        aiProvider: state.aiProvider,
        cardDataLoaded: state.cardDataLoaded,
        forgeServerUrl: state.forgeServerUrl,
      }),
    }
  )
);
