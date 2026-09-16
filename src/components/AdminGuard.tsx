'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/firebase/auth';
import { isAdminUid } from '@/lib/admin';
import { Loader2, ShieldAlert } from 'lucide-react';

/**
 * Wraps an admin page. Requires a signed-in user whose UID is in `NEXT_PUBLIC_ADMIN_UIDS`.
 *
 * Signed-out visitors are redirected to the landing page; signed-in non-admins get an
 * explicit refusal rather than a redirect, so a mistyped UID is diagnosable instead of
 * looking like a broken link. This is a UI gate only — `firestore.rules` is what stops a
 * non-admin who calls Firestore directly.
 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
          <span className="text-sm text-muted-foreground">Loading…</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  if (!isAdminUid(user.uid)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <ShieldAlert className="h-10 w-10 text-destructive" />
          <h1 className="text-xl font-semibold">Admin access required</h1>
          <p className="text-sm text-muted-foreground">
            This page manages the shared card database. Your account is not on the admin list.
          </p>
          <p className="text-xs text-muted-foreground/70">
            Signed in as {user.email ?? user.uid}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
