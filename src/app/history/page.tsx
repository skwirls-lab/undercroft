'use client';

import { AuthGuard } from '@/components/AuthGuard';
import { MatchHistory } from '@/components/history/MatchHistory';

/** The ledger: every match on record, and what the Archivist made of each. */
export default function HistoryPage() {
  return (
    <AuthGuard>
      <MatchHistory />
    </AuthGuard>
  );
}
