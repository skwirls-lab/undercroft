import { isDevMock, DEV_MOCK_USER } from '@/lib/devMock';

/**
 * Admin allowlist.
 *
 * The admin pages write to the shared `/cards` collection (~90k documents). Anyone who can
 * reach them can rewrite the card database for every player, so they are restricted to an
 * explicit list of Firebase UIDs rather than "any signed-in user".
 *
 * Set `NEXT_PUBLIC_ADMIN_UIDS` to a comma-separated list of Firebase UIDs in the Vercel
 * project settings (and in `.env.local` for development). The same UIDs must be listed in
 * `firestore.rules` — this constant only controls what the UI offers; the rules are what
 * actually enforces it.
 *
 * Set it to your own UID and leave it set — the admin pages are how the card database gets
 * refreshed when a new set releases. With the variable unset, nobody is an admin and the admin
 * pages refuse everyone, including you.
 */
const ADMIN_UIDS: string[] = (process.env.NEXT_PUBLIC_ADMIN_UIDS ?? '')
  .split(',')
  .map((uid) => uid.trim())
  .filter((uid) => uid.length > 0);

export function isAdminUid(uid: string | null | undefined): boolean {
  if (isDevMock() && uid === DEV_MOCK_USER.uid) return true;
  if (!uid) return false;
  return ADMIN_UIDS.includes(uid);
}

export function hasAdminsConfigured(): boolean {
  return ADMIN_UIDS.length > 0;
}
