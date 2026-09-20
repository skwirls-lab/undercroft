'use client';

import { cn } from '@/lib/utils';

/** The small vocabulary every Settings section is built from, shared with the admin panel. */

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="eyebrow">{children}</h3>;
}

export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  icon,
  disabled,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  icon: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border border-border/40 px-4 py-3 text-left transition-colors hover:border-border',
        disabled && 'pointer-events-none opacity-50'
      )}
    >
      <span className="shrink-0 text-gold">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{hint}</span>
      </span>
      <span className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-gold' : 'bg-muted')}>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-background transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
      </span>
    </button>
  );
}

/** A labelled value, for the read-only rows (usage, plan). */
export function StatRow({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/40 px-4 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <span className="shrink-0 text-sm tabular-nums text-foreground">{value}</span>
    </div>
  );
}
