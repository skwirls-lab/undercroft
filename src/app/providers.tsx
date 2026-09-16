'use client';

import { AuthProvider } from '@/lib/firebase/auth';
import type { ReactNode } from 'react';
import { FirestoreSyncProvider } from './FirestoreSyncProvider';
import { SettingsSheetProvider } from '@/components/SettingsSheet';
import { AppShell } from '@/components/AppShell';
import { MotionPreference } from '@/components/MotionPreference';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <FirestoreSyncProvider>
        <MotionPreference />
        <SettingsSheetProvider>
          <AppShell>{children}</AppShell>
        </SettingsSheetProvider>
      </FirestoreSyncProvider>
    </AuthProvider>
  );
}
