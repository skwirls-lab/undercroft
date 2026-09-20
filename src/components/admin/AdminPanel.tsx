'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SectionLabel, ToggleRow, StatRow } from '@/components/settings/controls';
import { useAppConfigStore } from '@/store/appConfigStore';
import { findUserByEmail, setUserPlan, getMonthStats, type AdminUserRow, type MonthStats } from '@/lib/firebase/adminOps';
import { monthKey, usageThisMonth, resolvePlan } from '@/lib/plan';
import { BookOpen, Search, Loader2, Crown, ShieldCheck, Megaphone, Gauge } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Administration, inside Settings, for the admin allowlist only. Four things:
 *   - the Archivist's master switch, model id, and monthly allowances (config/app)
 *   - a notice banner for every player
 *   - grant or revoke Patron by email, with an optional expiry
 *   - this month's usage and an estimated cost
 *
 * Every write here is also refused by firestore.rules unless the caller is an admin; the UI
 * gate is a convenience, the rules are the lock.
 */
export function AdminPanel() {
  const config = useAppConfigStore((s) => s.config);
  const update = useAppConfigStore((s) => s.update);
  const refresh = useAppConfigStore((s) => s.refresh);

  useEffect(() => { void refresh(); }, [refresh]);

  const save = async (patch: Parameters<typeof update>[0], what: string) => {
    try {
      await update(patch);
      toast.success(`${what} saved.`);
    } catch (err) {
      console.error('[admin]', err);
      toast.error(`Could not save ${what.toLowerCase()}. Is your UID in the rules allowlist?`);
    }
  };

  return (
    <section className="flex flex-col gap-4" data-dev-admin>
      <SectionLabel>Administration</SectionLabel>
      <p className="-mt-2 px-1 text-xs text-muted-foreground">Only you see this. Changes apply to every player at once.</p>

      {/* The Archivist */}
      <ToggleRow
        label="The Archivist"
        hint={config.archivistEnabled ? 'Answering. Switch off to stop every AI request app-wide.' : 'Resting. Every AI entry point says so; no request reaches the model.'}
        checked={config.archivistEnabled}
        onChange={(v) => save({ archivistEnabled: v }, 'The Archivist')}
        icon={<BookOpen className="h-4 w-4" />}
      />
      <Field
        label="Model"
        hint="OpenRouter model id. Change it here if the slug is renamed upstream."
        value={config.archivistModel}
        onSave={(v) => save({ archivistModel: v }, 'Model')}
        mono
      />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Free requests / month" value={String(config.allowance.free)} numeric onSave={(v) => save({ allowance: { ...config.allowance, free: Number(v) } }, 'Free allowance')} />
        <Field label="Patron requests / month" value={String(config.allowance.patron)} numeric onSave={(v) => save({ allowance: { ...config.allowance, patron: Number(v) } }, 'Patron allowance')} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="$ per 1M input tokens" value={String(config.costPerMillionIn)} numeric onSave={(v) => save({ costPerMillionIn: Number(v) }, 'Input rate')} />
        <Field label="$ per 1M output tokens" value={String(config.costPerMillionOut)} numeric onSave={(v) => save({ costPerMillionOut: Number(v) }, 'Output rate')} />
      </div>

      {/* Notice */}
      <Field
        label="Notice to all players"
        hint="Shown as a banner under the app bar. Leave empty to hide."
        value={config.notice}
        placeholder="e.g. The Archivist is resting while we sort out costs."
        onSave={(v) => save({ notice: v }, 'Notice')}
        icon={<Megaphone className="h-3.5 w-3.5" />}
      />

      <PatronGrants />
      <UsagePanel />
    </section>
  );
}

// ─── Patron grants ───────────────────────────────────────────────────────────

function PatronGrants() {
  const [email, setEmail] = useState('');
  const [row, setRow] = useState<AdminUserRow | null | undefined>(undefined);
  const [searching, setSearching] = useState(false);
  const [until, setUntil] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const search = async () => {
    setSearching(true);
    try {
      const found = await findUserByEmail(email);
      setRow(found);
      setNote(found?.profile.planNote ?? '');
      setUntil(found?.profile.patronUntil ? new Date(found.profile.patronUntil).toISOString().slice(0, 10) : '');
    } catch (err) {
      console.error('[admin] lookup', err);
      toast.error('Lookup failed. Is your UID in the rules allowlist?');
    } finally {
      setSearching(false);
    }
  };

  const grant = async (patron: boolean) => {
    if (!row) return;
    setBusy(true);
    try {
      const untilMs = patron && until ? Date.parse(`${until}T23:59:59Z`) : null;
      await setUserPlan(row.uid, { patron, until: untilMs, note: note.trim() || null });
      setRow({ ...row, profile: { ...row.profile, plan: patron ? 'patron' : 'free', planSource: patron ? 'admin' : null, patronUntil: untilMs, planNote: note.trim() || null } });
      toast.success(patron ? `${row.email ?? row.uid} is now a Patron.` : `${row.email ?? row.uid} is back on the free plan.`);
    } catch (err) {
      console.error('[admin] grant', err);
      toast.error('Could not change the plan.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/40 p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium"><Crown className="h-4 w-4 text-gold" /> Patron grants</p>
      <p className="text-xs text-muted-foreground">Look a player up by the email they sign in with. A grant made here is never undone by billing.</p>
      <form onSubmit={(e) => { e.preventDefault(); void search(); }} className="flex gap-2">
        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="player@example.com" type="email" className="h-9" aria-label="Player email" />
        <Button type="submit" size="sm" variant="outline" disabled={!email.trim() || searching} className="h-9 gap-1.5 border-border/60 text-foreground">
          {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Find
        </Button>
      </form>

      {row === null && <p className="text-xs text-destructive">No player has signed in with that email.</p>}
      {row && (
        <div className="flex flex-col gap-2 rounded-md bg-background/50 p-3 ring-1 ring-border/50">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{row.displayName ?? row.email ?? row.uid}</p>
              <p className="truncate text-xs text-muted-foreground">{row.email} · {row.uid}</p>
            </div>
            <PlanChip row={row} />
          </div>
          <p className="text-xs text-muted-foreground">
            This month: {usageThisMonth(row.profile).archivist} Archivist requests
            {row.profile.planSource === 'stripe' && ' · billed through Stripe'}
            {row.profile.planNote && ` · ${row.profile.planNote}`}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Until (optional)
              <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="h-9" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Note
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="playtester" maxLength={80} className="h-9" />
            </label>
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => grant(true)} className="gap-1.5 bg-gold text-gold-foreground hover:bg-gold/90"><Crown className="h-3.5 w-3.5" /> Grant Patron</Button>
            <Button size="sm" variant="outline" disabled={busy || resolvePlan(row.profile) !== 'patron'} onClick={() => grant(false)} className="border-border/60 text-foreground">Revoke</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function PlanChip({ row }: { row: AdminUserRow }) {
  const plan = resolvePlan(row.profile);
  const expired = row.profile.plan === 'patron' && plan === 'free';
  return (
    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', plan === 'patron' ? 'bg-gold/15 text-gold' : 'bg-muted/60 text-muted-foreground')}>
      {plan === 'patron' ? 'Patron' : expired ? 'Expired' : 'Free'}
      {plan === 'patron' && row.profile.patronUntil ? ` · until ${new Date(row.profile.patronUntil).toLocaleDateString()}` : ''}
    </span>
  );
}

// ─── Usage ───────────────────────────────────────────────────────────────────

function UsagePanel() {
  const config = useAppConfigStore((s) => s.config);
  const [stats, setStats] = useState<MonthStats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    getMonthStats()
      .then((s) => { if (alive) setStats(s); })
      .catch((err) => { console.error('[admin] stats', err); if (alive) setError(true); });
    return () => { alive = false; };
  }, []);

  const cost = stats ? (stats.tokensIn / 1e6) * config.costPerMillionIn + (stats.tokensOut / 1e6) * config.costPerMillionOut : 0;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/40 p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium"><Gauge className="h-4 w-4 text-gold" /> The Archivist this month <span className="ml-auto text-xs font-normal text-muted-foreground">{monthKey()}</span></p>
      {error ? (
        <p className="text-xs text-destructive">Could not read the usage totals.</p>
      ) : !stats ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Tile label="Requests" value={String(stats.calls)} sub={stats.failed ? `${stats.failed} failed` : undefined} />
            <Tile label="Tokens" value={compact(stats.tokensIn + stats.tokensOut)} sub={`${compact(stats.tokensIn)} in · ${compact(stats.tokensOut)} out`} />
            <Tile label="Est. cost" value={config.costPerMillionIn || config.costPerMillionOut ? `$${cost.toFixed(2)}` : '—'} sub={config.costPerMillionIn || config.costPerMillionOut ? undefined : 'set the rates above'} />
          </div>
          {Object.keys(stats.byTask).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(stats.byTask).sort((a, b) => b[1] - a[1]).map(([task, n]) => (
                <span key={task} className="rounded-md bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground"><span className="text-foreground">{n}</span> {task}</span>
              ))}
            </div>
          )}
        </>
      )}
      <StatRow label="Rules allowlist" hint="Your UID must be in firestore.rules for any of this to save." value={<ShieldCheck className="h-4 w-4 text-emerald-400" />} />
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="plaque flex flex-col rounded-md px-2.5 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="font-display text-lg font-bold leading-tight">{value}</span>
      {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

function compact(n: number): string {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n);
}

// ─── A field that saves on blur or Enter ─────────────────────────────────────

function Field({ label, hint, value, onSave, placeholder, numeric, mono, icon }: {
  label: string; hint?: string; value: string; onSave: (v: string) => void; placeholder?: string; numeric?: boolean; mono?: boolean; icon?: React.ReactNode;
}) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  // Follow external changes (another admin, a refresh) unless the field is mid-edit. Derived
  // state is adjusted during render, the way React asks, rather than in an effect.
  const [seen, setSeen] = useState(value);
  if (value !== seen && !editing) {
    setSeen(value);
    setDraft(value);
  }

  const commit = () => {
    setEditing(false);
    const v = draft.trim();
    if (v === value) return;
    if (numeric && (v === '' || !Number.isFinite(Number(v)) || Number(v) < 0)) { setDraft(value); return; }
    onSave(v);
  };

  return (
    <label className="flex flex-col gap-1 rounded-lg border border-border/40 px-3 py-2">
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">{icon}{label}</span>
      <Input
        value={draft}
        placeholder={placeholder}
        inputMode={numeric ? 'decimal' : undefined}
        onFocus={() => setEditing(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
        className={cn('h-8 border-0 bg-transparent px-0 text-sm focus-visible:ring-0', mono && 'font-mono text-xs')}
      />
      {hint && <span className="text-[11px] leading-snug text-muted-foreground/80">{hint}</span>}
    </label>
  );
}
