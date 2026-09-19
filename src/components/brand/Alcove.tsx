'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * A carved recess in the vault wall: the standard content panel. Arch-topped by default so
 * the motif carries through every screen; `flat` for panels that sit inside other panels.
 * `lit` for the one panel on a screen that wants your attention.
 */
interface AlcoveProps extends React.HTMLAttributes<HTMLDivElement> {
  lit?: boolean;
  flat?: boolean;
  as?: 'div' | 'section' | 'article';
}

export const Alcove = forwardRef<HTMLDivElement, AlcoveProps>(function Alcove(
  { className, lit, flat, children, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(
        'alcove overflow-hidden',
        flat ? 'rounded-xl' : 'arch-top rounded-b-xl',
        lit && 'alcove-lit',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
});

/** Small-caps section label with a hairline that fades out. */
export function Eyebrow({ children, className, rule = true }: { children: React.ReactNode; className?: string; rule?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="eyebrow">{children}</span>
      {rule && <span className="h-px flex-1 bg-gradient-to-r from-gold/25 to-transparent" />}
    </div>
  );
}
