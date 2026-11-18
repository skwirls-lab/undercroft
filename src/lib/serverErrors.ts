/**
 * Errors from the game server that the player has to be told about.
 *
 * The server used to fail silently in three ways: a game whose engine died left a board that
 * never answered again; a full server had no way to say so; and a start that was refused left
 * the player on "Loading game…" forever. It now sends an `error` message with a `code` for
 * each, and this turns the code into what to show and what to offer. Errors without a known
 * code stay in the console, as before.
 *
 * Pure, so it can be tested without a browser.
 */

export type ServerErrorCode = 'server_full' | 'auth_required' | 'auth_unavailable' | 'start_failed' | 'game_crashed';

export interface ServerError {
  code: ServerErrorCode;
  message: string;
  activeGames?: number;
  maxGames?: number;
}

const CODES: ServerErrorCode[] = ['server_full', 'auth_required', 'auth_unavailable', 'start_failed', 'game_crashed'];

export function parseServerError(payload: unknown): ServerError | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  const code = typeof p.code === 'string' ? (p.code as ServerErrorCode) : null;
  if (!code || !CODES.includes(code)) return null;
  return {
    code,
    message: typeof p.message === 'string' ? p.message : '',
    activeGames: typeof p.activeGames === 'number' ? p.activeGames : undefined,
    maxGames: typeof p.maxGames === 'number' ? p.maxGames : undefined,
  };
}

/** What the primary button does. `back` (to the setup screen) is always offered as well. */
export type ServerErrorAction = 'retry' | 'refresh' | 'none';

export interface ServerErrorView {
  title: string;
  body: string;
  /** A second, quieter line: what is safe, or what to try. */
  note: string | null;
  action: ServerErrorAction;
  actionLabel: string | null;
}

export function describeServerError(error: ServerError): ServerErrorView {
  switch (error.code) {
    case 'server_full': {
      const count = !error.maxGames ? '' : error.maxGames === 1 ? ' Its one table is in use.' : ` All ${error.maxGames} tables are in use.`;
      return {
        title: 'Every table is taken',
        body: `The game server is full right now.${count} Nothing was started.`,
        note: 'A table frees up as soon as another game ends. Try again in a few minutes.',
        action: 'retry',
        actionLabel: 'Try again',
      };
    }
    case 'auth_required':
      return {
        title: 'Sign in to play',
        body: 'The game server could not confirm that you are signed in, so the game was not started.',
        note: 'Refreshing the page renews your sign-in. If that does not help, sign out and back in.',
        action: 'refresh',
        actionLabel: 'Refresh the page',
      };
    case 'auth_unavailable':
      return {
        title: 'Sign-in could not be checked',
        body: 'The game server could not reach the sign-in service just now, so the game was not started.',
        note: 'This is usually brief. Try again in a minute.',
        action: 'retry',
        actionLabel: 'Try again',
      };
    case 'start_failed':
      return {
        title: 'The game could not be started',
        body: error.message || 'The game server could not set up this game.',
        note: 'Go back to the setup screen and check the decks, then start again.',
        action: 'none',
        actionLabel: null,
      };
    case 'game_crashed':
      return {
        title: 'This game has stopped',
        body: error.message || 'The game server had to end this game.',
        note: 'Nothing you did caused this. Your decks and your match history are safe.',
        action: 'retry',
        actionLabel: 'Start again with the same decks',
      };
  }
}
