'use client';

import { AuthProvider } from '@/lib/firebase/auth';
import type { ReactNode } from 'react';
import { FirestoreSyncProvider } from './FirestoreSyncProvider';
import { SettingsSheetProvider } from '@/components/SettingsSheet';
import { AppShell } from '@/components/AppShell';
import { MotionPreference } from '@/components/MotionPreference';
import { PatronProvider } from '@/components/patron/PatronSheet';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <FirestoreSyncProvider>
        <MotionPreference />
        <PatronProvider>
          <SettingsSheetProvider>
            <AppShell>{children}</AppShell>
          </SettingsSheetProvider>
        </PatronProvider>
      </FirestoreSyncProvider>
    </AuthProvider>
  );
}
