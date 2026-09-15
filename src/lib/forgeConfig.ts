/**
 * Forge Server configuration.
 * The server URL can be overridden via NEXT_PUBLIC_FORGE_SERVER_URL env var.
 */
export const FORGE_SERVER_URL =
  process.env.NEXT_PUBLIC_FORGE_SERVER_URL ||
  'wss://undercroft-forge-server-production.up.railway.app/game';

/**
 * HTTP health endpoint derived from the WebSocket URL.
 *
 * The previous derivation only rewrote `wss://`, so pointing NEXT_PUBLIC_FORGE_SERVER_URL at a
 * local `ws://localhost:7000/game` produced `ws://localhost:7000/health` and every health
 * request failed. Handle both schemes, the way forgeCardCheck already does.
 */
export const FORGE_HEALTH_URL = FORGE_SERVER_URL
  .replace(/^wss:\/\//, 'https://')
  .replace(/^ws:\/\//, 'http://')
  .replace(/\/game$/, '/health');

/**
 * Nudge the Forge server awake without blocking anything.
 *
 * The server sleeps when idle on Railway, so the first connection of the day pays a 10-30s
 * cold start. Firing this when the player lands on a screen that leads to a game usually means
 * the container is already warm by the time they press Start. Deliberately fire-and-forget:
 * a failure here is not worth surfacing, the real connection reports its own errors.
 */
export function prewarmForgeServer(): void {
  try {
    void fetch(FORGE_HEALTH_URL, { method: 'GET', mode: 'no-cors', cache: 'no-store' })
      .catch(() => { /* cold start in progress, or server down - connect() will report it */ });
  } catch {
    /* fetch unavailable (SSR) - nothing to do */
  }
}
