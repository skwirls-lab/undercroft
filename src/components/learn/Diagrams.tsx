'use client';

/**
 * Small inline drawings for the lessons: the turn as a row of phases with their steps, the
 * stack as a pile that resolves from the top, combat as a timeline, and the zones a card
 * moves between. Plain SVG in the app's palette; no library.
 */

const gold = 'var(--gold)';
const muted = 'oklch(0.55 0.02 60)';
const line = 'oklch(0.35 0.022 62)';

export function TurnDiagram() {
  const phases: Array<{ label: string; steps: string[] }> = [
    { label: 'Beginning', steps: ['Untap', 'Upkeep', 'Draw'] },
    { label: 'Main 1', steps: ['Main'] },
    { label: 'Combat', steps: ['Begin', 'Attackers', 'Blockers', 'Damage', 'End'] },
    { label: 'Main 2', steps: ['Main'] },
    { label: 'End', steps: ['End step', 'Cleanup'] },
  ];
  const total = phases.reduce((s, p) => s + p.steps.length, 0);
  const w = 640; const h = 118; const pad = 8; const unit = (w - pad * 2) / total;
  let x = pad;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="The phases and steps of a turn">
      {phases.map((p, i) => {
        const pw = unit * p.steps.length; const px = x; x += pw;
        return (
          <g key={p.label}>
            <rect x={px + 2} y={22} width={pw - 4} height={30} rx={6} fill={i % 2 ? 'oklch(0.22 0.014 55)' : 'oklch(0.25 0.018 60)'} stroke={line} />
            <text x={px + pw / 2} y={41} textAnchor="middle" fontSize={12} fontWeight={600} fill={i === 2 ? gold : 'oklch(0.85 0.02 80)'}>{p.label}</text>
            {p.steps.map((s, j) => (
              <g key={s}>
                <line x1={px + unit * j + unit / 2} y1={52} x2={px + unit * j + unit / 2} y2={68} stroke={line} />
                <text x={px + unit * j + unit / 2} y={82} textAnchor="middle" fontSize={9.5} fill={muted}>{s}</text>
              </g>
            ))}
          </g>
        );
      })}
      <text x={w / 2} y={108} textAnchor="middle" fontSize={10} fill={muted}>Everyone gets priority in every step except untap and cleanup.</text>
    </svg>
  );
}

export function StackDiagram() {
  const items = ['Counterspell (resolves first)', 'Ancestral Recall (cast first)'];
  return (
    <svg viewBox="0 0 640 132" className="w-full" role="img" aria-label="The stack resolves from the top">
      {items.map((t, i) => (
        <g key={t}>
          <rect x={200} y={18 + i * 44} width={240} height={36} rx={8} fill={i === 0 ? 'oklch(0.28 0.05 80 / 0.5)' : 'oklch(0.24 0.016 58)'} stroke={i === 0 ? gold : line} />
          <text x={320} y={41 + i * 44} textAnchor="middle" fontSize={12} fill="oklch(0.88 0.02 80)">{t}</text>
        </g>
      ))}
      <text x={470} y={40} fontSize={10} fill={gold}>← top: last in, first out</text>
      <text x={470} y={84} fontSize={10} fill={muted}>← bottom: waits its turn</text>
      <text x={320} y={122} textAnchor="middle" fontSize={10} fill={muted}>Priority passes around the table between each resolution.</text>
    </svg>
  );
}

export function CombatDiagram() {
  const steps = ['Begin combat', 'Declare attackers', 'Declare blockers', 'First strike', 'Damage', 'End combat'];
  const w = 640; const unit = (w - 20) / steps.length;
  return (
    <svg viewBox={`0 0 ${w} 96`} className="w-full" role="img" aria-label="The steps of combat">
      <line x1={10} y1={36} x2={w - 10} y2={36} stroke={line} strokeWidth={2} />
      {steps.map((s, i) => (
        <g key={s}>
          <circle cx={10 + unit * i + unit / 2} cy={36} r={7} fill={i === 1 || i === 2 ? gold : 'oklch(0.3 0.02 60)'} stroke={line} />
          <text x={10 + unit * i + unit / 2} y={64} textAnchor="middle" fontSize={10.5} fill={i === 1 || i === 2 ? 'oklch(0.9 0.02 80)' : muted}>{s}</text>
        </g>
      ))}
      <text x={w / 2} y={88} textAnchor="middle" fontSize={10} fill={muted}>Attackers are chosen by the active player, blockers by each defender; damage lands all at once.</text>
    </svg>
  );
}

export function ZonesDiagram() {
  const zones: Array<[string, string, number, number]> = [
    ['Library', 'draw from', 20, 20], ['Hand', 'cast from', 170, 20], ['Stack', 'waits here', 320, 20],
    ['Battlefield', 'permanents stay', 20, 74], ['Graveyard', 'used up', 170, 74], ['Exile', 'gone', 320, 74],
    ['Command zone', 'your commander', 470, 47],
  ];
  return (
    <svg viewBox="0 0 640 128" className="w-full" role="img" aria-label="The zones a card moves between">
      {zones.map(([name, sub, x, y]) => (
        <g key={name}>
          <rect x={x} y={y} width={140} height={40} rx={8} fill={name === 'Battlefield' ? 'oklch(0.28 0.05 80 / 0.4)' : 'oklch(0.24 0.016 58)'} stroke={name === 'Command zone' ? gold : line} />
          <text x={x + 70} y={y + 17} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="oklch(0.88 0.02 80)">{name}</text>
          <text x={x + 70} y={y + 31} textAnchor="middle" fontSize={9.5} fill={muted}>{sub}</text>
        </g>
      ))}
    </svg>
  );
}

export function Diagram({ kind }: { kind: 'turn' | 'stack' | 'zones' | 'combat' }) {
  const inner = kind === 'turn' ? <TurnDiagram /> : kind === 'stack' ? <StackDiagram /> : kind === 'combat' ? <CombatDiagram /> : <ZonesDiagram />;
  return <div className="my-2 rounded-xl border border-border/40 bg-background/40 p-2">{inner}</div>;
}
