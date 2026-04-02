'use client';

import type { ReactNode } from 'react';
import { useFirestoreSync } from '@/hooks/useFirestoreSync';

export function FirestoreSyncProvider({ children }: { children: ReactNode }) {
  useFirestoreSync();
  return <>{children}</>;
}
