/**
 * Development-only mock mode.
 *
 * Signed-in screens need Firebase credentials to reach, which means they cannot be rendered
 * in an environment without them — including the one most of this app's UI work happens in.
 * With NEXT_PUBLIC_DEV_MOCK_AUTH=1 under `next dev`, the auth provider reports a fake user,
 * Firestore sync is skipped, and a few sample decks are seeded, so every page renders.
 *
 * This can never be on in production: NODE_ENV is inlined at build time, and `next build`
 * sets it to "production", so the second clause is a compile-time `false` in any deployed
 * bundle regardless of what the environment variable says.
 */
export function isDevMock(): boolean {
  return process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_DEV_MOCK_AUTH === '1';
}

export const DEV_MOCK_USER = {
  uid: 'dev-mock-user',
  displayName: 'Dev Tester',
  email: 'dev@example.com',
  photoURL: null,
} as const;
