import type { Transition, Variants } from 'framer-motion';

/**
 * One motion vocabulary for the whole app. Slow, weighty, settled — things in a vault do
 * not bounce. Reduce-motion is handled globally in CSS (see MotionPreference), so nothing
 * here needs to check it.
 */

export const easeVault = [0.22, 1, 0.36, 1] as const;

export const settle: Transition = { duration: 0.55, ease: easeVault };
export const settleFast: Transition = { duration: 0.3, ease: easeVault };
export const settleSlow: Transition = { duration: 0.9, ease: easeVault };

/** Rise into place. Use for anything appearing on a page. */
export const rise: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: settle },
};

/** Parent that staggers `rise` children. */
export const riseStagger = (stagger = 0.07, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren: delay } },
});

/** For cards arriving on the battlefield: from slightly below and small, settling flat. */
export const cardArrive: Variants = {
  initial: { opacity: 0, y: 10, scale: 0.94 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.42, ease: easeVault } },
  exit: { opacity: 0, y: -8, scale: 0.9, transition: { duration: 0.24, ease: easeVault } },
};

/** Route transition: a short fade-rise so navigation feels like moving, not reloading. */
export const routeEnter = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.32, ease: easeVault } },
};
