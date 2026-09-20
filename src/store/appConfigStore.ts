import { create } from 'zustand';
import { DEFAULT_APP_CONFIG, type AppConfig } from '@/lib/appConfig';
import { loadAppConfig, saveAppConfig } from '@/lib/firebase/appConfig';
import { isDevMock } from '@/lib/devMock';

/**
 * App-wide config as the client sees it. Loaded once after sign-in and again whenever an
 * admin saves, so the notice banner and the Archivist's availability follow the document
 * without a reload. Defaults apply until the first load lands and in development mock mode.
 */
interface AppConfigStore {
  config: AppConfig;
  loaded: boolean;
  refresh: () => Promise<void>;
  /** Admin only: merge a patch into the document, then apply it locally. */
  update: (patch: Partial<AppConfig>) => Promise<void>;
}

export const useAppConfigStore = create<AppConfigStore>((set, get) => ({
  config: DEFAULT_APP_CONFIG,
  loaded: false,

  refresh: async () => {
    if (isDevMock()) { set({ loaded: true }); return; }
    try {
      const config = await loadAppConfig();
      set({ config, loaded: true });
    } catch (err) {
      console.error('[appConfig] load failed:', err);
      set({ loaded: true });
    }
  },

  update: async (patch) => {
    const next = { ...get().config, ...patch, allowance: { ...get().config.allowance, ...(patch.allowance ?? {}) } };
    set({ config: next });
    if (isDevMock()) return;
    await saveAppConfig(patch);
  },
}));
