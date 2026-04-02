import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AIProviderConfig } from '@/ai/types';

interface SettingsStore {
  aiProvider: AIProviderConfig | null;
  cardDataLoaded: boolean;
  cardDataProgress: number;

  setAIProvider: (config: AIProviderConfig | null) => void;
  setCardDataLoaded: (loaded: boolean) => void;
  setCardDataProgress: (progress: number) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      aiProvider: null,
      cardDataLoaded: false,
      cardDataProgress: 0,

      setAIProvider: (config) => set({ aiProvider: config }),
      setCardDataLoaded: (loaded) => set({ cardDataLoaded: loaded }),
      setCardDataProgress: (progress) => set({ cardDataProgress: progress }),
    }),
    {
      name: 'undercroft-settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        aiProvider: state.aiProvider,
        cardDataLoaded: state.cardDataLoaded,
      }),
    }
  )
);
