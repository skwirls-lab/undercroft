'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSettingsSheet } from '@/components/SettingsSheet';

/**
 * Settings moved from a route to an overlay (see SettingsSheet.tsx).
 *
 * The route is kept as a redirect rather than deleted, because it is the kind of URL people
 * bookmark and link to. Landing here opens the panel over the dashboard instead of 404ing.
 */
export default function SettingsRedirect() {
  const router = useRouter();
  const { openSettings } = useSettingsSheet();

  useEffect(() => {
    router.replace('/');
    openSettings();
  }, [router, openSettings]);

  return null;
}
