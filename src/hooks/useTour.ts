'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { useDeckStore } from '@/store/deckStore';
import { saveToursDone } from '@/lib/firebase/firestore';
import { TOURS, type TourName } from '@/content/tours';
import { isDevMock } from '@/lib/devMock';

/**
 * Runs a tour on first visit while "Show tutorials" is on, and on demand from Settings
 * (`?tour=<name>` on the page). Completion is remembered on this device and mirrored to
 * the profile, so a second device does not replay what the first has seen.
 */
export function useTour(name: TourName, options: { ready?: boolean } = {}) {
  const ready = options.ready ?? true;
  const showTours = useSettingsStore((s) => s.showTours);
  const done = useSettingsStore((s) => s.toursDone.includes(name));
  const markTourDone = useSettingsStore((s) => s.markTourDone);
  const requestedTour = useSettingsStore((s) => s.requestedTour);
  const requestTour = useSettingsStore((s) => s.requestTour);
  const [active, setActive] = useState(false);
  const [requested, setRequested] = useState(false);

  // A replay from Settings, or `?tour=name` (the harness), runs regardless of the done flag.
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get('tour');
    if (v === name || requestedTour === name) setRequested(true);
  }, [name, requestedTour]);

  useEffect(() => {
    if (!ready || active) return;
    // In the dev harness a tour runs only when asked for, so every other screenshot stays clean.
    if (!(requested || (showTours && !done && !isDevMock()))) return;
    // Let the page settle and animate in before the spotlight lands.
    const t = setTimeout(() => setActive(true), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, requested, showTours, done]);

  const finish = useCallback(() => {
    setActive(false);
    setRequested(false);
    if (requestedTour === name) requestTour(null);
    markTourDone(name);
    const uid = useDeckStore.getState().syncedUserId;
    if (uid) void saveToursDone(uid, useSettingsStore.getState().toursDone).catch(console.error);
  }, [markTourDone, name, requestedTour, requestTour]);

  const start = useCallback(() => setActive(true), []);

  return { active, tour: TOURS[name], start, finish };
}
