/**
 * Forge Server configuration.
 * The server URL can be overridden via NEXT_PUBLIC_FORGE_SERVER_URL env var.
 */
export const FORGE_SERVER_URL =
  process.env.NEXT_PUBLIC_FORGE_SERVER_URL ||
  'wss://undercroft-forge-server-production.up.railway.app/game';

export const FORGE_HEALTH_URL =
  process.env.NEXT_PUBLIC_FORGE_SERVER_URL?.replace('wss://', 'https://').replace('/game', '/health') ||
  'https://undercroft-forge-server-production.up.railway.app/health';
