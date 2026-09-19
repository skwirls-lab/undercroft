'use client';

import { motion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { routeEnter } from '@/lib/motion';

/**
 * Route transition. A template re-mounts on every navigation (unlike a layout), which is
 * what lets each new page rise into place. Kept short — 320ms — so it reads as movement
 * rather than waiting. The game board is excluded: it manages a full-bleed 100dvh layout
 * and any wrapper transform would break its position: fixed overlays.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith('/game/forge') || pathname.startsWith('/dev/')) {
    return <>{children}</>;
  }
  return (
    <motion.div initial={routeEnter.initial} animate={routeEnter.animate} className="flex min-h-full flex-1 flex-col">
      {children}
    </motion.div>
  );
}
