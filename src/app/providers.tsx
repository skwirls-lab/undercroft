'use client';

import { AuthProvider } from '@/lib/firebase/auth';
import type { ReactNode } from 'react';
import { FirestoreSyncProvider } from './FirestoreSyncProvider';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <FirestoreSyncProvider>
        {children}
      </FirestoreSyncProvider>
    </AuthProvider>
  );
}
