/**
 * Opt-in debug logging for the Forge game path.
 *
 * These traces were invaluable while the bridge protocol was being built, but several ran on
 * every render or every `game_state` push — and a `game_state` is sent before *every* choice,
 * so a normal game floods the console. Anyone who opens devtools sees a dev tool rather than a
 * product.
 *
 * Enable by setting NEXT_PUBLIC_FORGE_DEBUG=1 in `.env.local`, or at runtime in the console:
 *   localStorage.setItem('forge-debug', '1'); location.reload();
 */
const envEnabled = process.env.NEXT_PUBLIC_FORGE_DEBUG === '1';

function storageEnabled(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem('forge-debug') === '1';
  } catch {
    // Private mode / blocked storage — fall back to the env flag alone.
    return false;
  }
}

export function forgeDebugEnabled(): boolean {
  return envEnabled || storageEnabled();
}

/** Log only when Forge debugging is switched on. Arguments are evaluated either way. */
export function debugLog(...args: unknown[]): void {
  if (forgeDebugEnabled()) console.log(...args);
}

/**
 * Log only when debugging is on, deferring construction of the message.
 * Use when building the arguments is itself expensive (mapping over zones, etc).
 */
export function debugLogLazy(build: () => unknown[]): void {
  if (forgeDebugEnabled()) console.log(...build());
}
