import { notFound } from 'next/navigation';
import { DevBoard } from './DevBoard';

/**
 * Development-only game board preview.
 *
 * Renders the real game screen against a seeded mid-game state, with no server and no
 * sign-in. Exists because the board could not otherwise be looked at without Firebase
 * credentials and a live Railway game — which is how layout bugs sat unseen for months.
 *
 * NODE_ENV is inlined at build time, so under `next build` this is a compile-time 404.
 */
export default function DevBoardPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <DevBoard />;
}
