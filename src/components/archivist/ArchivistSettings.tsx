'use client';

import { BookOpen } from 'lucide-react';
import { SectionLabel, ToggleRow, StatRow } from '@/components/settings/controls';
import { useSettingsStore } from '@/store/settingsStore';
import { useEntitlements } from '@/hooks/useEntitlements';
import { ArchivistNotice } from './Notice';
import { RESTING } from './access';

/** The Archivist's row in Settings: the in-match switch and this month's meter. */
export function ArchivistSettings() {
  const { archivistInMatch, setArchivistInMatch } = useSettingsStore();
  const { archivist, plan, notice, canStrict } = useEntitlements();
  const matchAllowed = canStrict('archivist.match');
  return (
    <section className="flex flex-col gap-4" data-dev-archivist-settings>
      <SectionLabel>The Archivist</SectionLabel>
      {!archivist.enabled && <ArchivistNotice state="resting" message={notice || RESTING} />}
      <ToggleRow
        label="Show in matches"
        hint={matchAllowed ? 'A book in the game header opens the Archivist beside the board. Nothing is sent until you ask.' : 'In-match advice is a Patron feature. The book stays hidden on the free plan.'}
        checked={archivistInMatch && matchAllowed}
        onChange={setArchivistInMatch}
        disabled={!matchAllowed}
        icon={<BookOpen className="h-4 w-4" />}
      />
      <StatRow
        label="Requests this month"
        value={<span className={archivist.remaining === 0 ? 'text-amber-300' : undefined}>{archivist.used} / {archivist.allowed}</span>}
        hint={plan === 'patron' ? 'Patron allowance. Resets on the 1st.' : 'Free allowance. Resets on the 1st. Patrons get more, plus advice during matches.'}
      />
    </section>
  );
}
