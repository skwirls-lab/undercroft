/**
 * App-wide configuration, kept in the Firestore document `config/app` so an admin can change
 * it from the Settings panel without a deploy. Readable by any signed-in player (the client
 * needs the allowances and the notice); writable only by an admin (see firestore.rules).
 *
 * Shared between client and server: this file must not import anything server-only.
 */

export interface AppConfig {
  /** Master switch for the Archivist. Off means every AI entry point rests, no call is made. */
  archivistEnabled: boolean;
  /** OpenRouter model id. Editable so a rename upstream is a settings change, not a deploy. */
  archivistModel: string;
  /** Archivist requests per calendar month, by plan. */
  allowance: { free: number; patron: number };
  /** Optional banner shown to every player (maintenance, "AI paused", etc.). Empty hides it. */
  notice: string;
  /** For the admin cost estimate: USD per million tokens, as OpenRouter lists for the model. */
  costPerMillionIn: number;
  costPerMillionOut: number;
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  archivistEnabled: true,
  archivistModel: 'deepseek/deepseek-v4-flash-0731',
  allowance: { free: 10, patron: 300 },
  notice: '',
  costPerMillionIn: 0,
  costPerMillionOut: 0,
};

/** Read a config document, filling anything missing or malformed from the defaults. */
export function parseAppConfig(data: Record<string, unknown> | null | undefined): AppConfig {
  const d = data ?? {};
  const allowance = (d.allowance && typeof d.allowance === 'object' ? d.allowance : {}) as Record<string, unknown>;
  return {
    archivistEnabled: typeof d.archivistEnabled === 'boolean' ? d.archivistEnabled : DEFAULT_APP_CONFIG.archivistEnabled,
    archivistModel: typeof d.archivistModel === 'string' && d.archivistModel.trim() ? d.archivistModel.trim() : DEFAULT_APP_CONFIG.archivistModel,
    allowance: {
      free: nonNeg(allowance.free, DEFAULT_APP_CONFIG.allowance.free),
      patron: nonNeg(allowance.patron, DEFAULT_APP_CONFIG.allowance.patron),
    },
    notice: typeof d.notice === 'string' ? d.notice.slice(0, 280) : '',
    costPerMillionIn: nonNeg(d.costPerMillionIn, 0),
    costPerMillionOut: nonNeg(d.costPerMillionOut, 0),
  };
}

function nonNeg(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
}
