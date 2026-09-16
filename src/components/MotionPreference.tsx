'use client';

import { useEffect } from 'react';
import { useSettingsStore } from '@/store/settingsStore';

/**
 * Applies the "reduce motion" preference as a document-level attribute, so a single CSS rule
 * in globals.css can neutralise animations everywhere — including framer-motion's inline
 * transitions, which respect `transition-duration: 0s` on the element.
 *
 * Also seeds the setting from the OS on first run: someone who has asked their system for
 * reduced motion should not have to ask again here. Only on first run, so an explicit choice
 * in the app is never overridden on the next visit.
 */
export function MotionPreference() {
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);
  const setReduceMotion = useSettingsStore((s) => s.setReduceMotion);

  useEffect(() => {
    const KEY = 'undercroft-motion-seeded';
    try {
      if (!localStorage.getItem(KEY)) {
        localStorage.setItem(KEY, '1');
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          setReduceMotion(true);
        }
      }
    } catch {
      /* private mode / blocked storage — the default (animations on) is fine */
    }
  }, [setReduceMotion]);

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = reduceMotion ? 'true' : 'false';
  }, [reduceMotion]);

  return null;
}
