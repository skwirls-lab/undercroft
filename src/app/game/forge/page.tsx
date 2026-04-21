'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useForgeGameStore, mapChoiceToUI, getChoicePrompt, getChoiceCards } from '@/store/forgeGameStore';
import { FORGE_SERVER_URL, FORGE_HEALTH_URL } from '@/lib/forgeConfig';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Wifi,
  WifiOff,
  Loader2,
  Swords,
  Heart,
  Skull,
  Shield,
  Zap,
  ChevronDown,
  ChevronUp,
  Flag,
} from 'lucide-react';
import type { ForgeCard, ForgePlayer, ForgeChoiceRequest } from '@/lib/forgeClient';

// ============================================================
// Forge Game Page — connects to the Java Forge server via WS
// ============================================================

export default function ForgeGamePage() {
  const {
    connectionStatus,
    gameState,
    pendingChoice,
    gameEvents,
    isGameOver,
    winner,
    connect,
    disconnect,
    startGame,
    respondToChoice,
    concede,
  } = useForgeGameStore();

  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [eventLogOpen, setEventLogOpen] = useState(false);

  // Check server health on mount
  useEffect(() => {
    fetch(FORGE_HEALTH_URL)
      .then((res) => setServerOnline(res.ok))
      .catch(() => setServerOnline(false));
  }, []);

  // Auto-connect when page loads
  useEffect(() => {
    if (connectionStatus === 'disconnected' && serverOnline) {
      setConnectError(null);
      connect(FORGE_SERVER_URL).catch((e) => {
        setConnectError(String(e));
      });
    }
    return () => {
      // Don't disconnect on unmount — let the game keep running
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverOnline]);

  // --- Render ---

  // Connection screen
  if (connectionStatus !== 'connected') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
        <Link href="/game" className="absolute left-4 top-4">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
        </Link>

        {serverOnline === null && (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-gold" />
            <p className="text-muted-foreground">Checking Forge server...</p>
          </>
        )}

        {serverOnline === false && (
          <>
            <WifiOff className="h-10 w-10 text-red-500" />
            <p className="font-semibold text-red-400">Forge server is offline</p>
            <p className="max-w-md text-center text-sm text-muted-foreground">
              The server may be starting up (takes ~30s to load 94K cards). Try refreshing in a moment.
            </p>
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </>
        )}

        {serverOnline && connectionStatus === 'connecting' && (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-gold" />
            <p className="text-muted-foreground">Connecting to Forge server...</p>
          </>
        )}

        {serverOnline && connectionStatus === 'error' && (
          <>
            <WifiOff className="h-10 w-10 text-red-500" />
            <p className="font-semibold text-red-400">Connection failed</p>
            {connectError && (
              <p className="max-w-md text-center text-xs text-muted-foreground">{connectError}</p>
            )}
            <Button variant="secondary" onClick={() => connect(FORGE_SERVER_URL)}>
              Retry
            </Button>
          </>
        )}
      </div>
    );
  }

  // Connected but no game yet — show start button
  if (!gameState && !isGameOver) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
        <Link href="/game" className="absolute left-4 top-4">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
        </Link>

        <div className="flex items-center gap-2 text-green-400">
          <Wifi className="h-5 w-5" />
          <span className="text-sm font-medium">Connected to Forge Server</span>
        </div>

        <div className="flex flex-col items-center gap-4 rounded-xl border border-border/50 bg-card/50 p-8">
          <Swords className="h-10 w-10 text-gold" />
          <h2 className="text-xl font-bold">Start a Forge Game</h2>
          <p className="max-w-sm text-center text-sm text-muted-foreground">
            This will start a Commander game on the Forge engine server with an AI opponent.
            The server has 94K+ real MTG cards loaded.
          </p>
          <Button
            size="lg"
            className="gap-2"
            onClick={() => {
              // Test deck: basic mono-red burn
              const testDeck = [
                '1 Krenko, Mob Boss',
                ...Array(38).fill('1 Mountain'),
                '1 Lightning Bolt',
                '1 Shock',
                '1 Goblin Guide',
                '1 Monastery Swiftspear',
                '1 Eidolon of the Great Revel',
                '1 Goblin Rabblemaster',
                '1 Goblin Chieftain',
                '1 Siege-Gang Commander',
                '1 Skirk Prospector',
                '1 Goblin Warchief',
                '1 Goblin Matron',
                '1 Goblin Recruiter',
                '1 Goblin Ringleader',
                '1 Mogg War Marshal',
                '1 Goblin Trashmaster',
                '1 Goblin Chainwhirler',
                '1 Purphoros, God of the Forge',
                '1 Impact Tremors',
                '1 Shared Animosity',
                '1 Coat of Arms',
                '1 Sol Ring',
                '1 Ruby Medallion',
                '1 Skullclamp',
                '1 Lightning Greaves',
                '1 Swiftfoot Boots',
                '1 Chaos Warp',
                '1 Reverberate',
                '1 Gamble',
                '1 Wheel of Fortune',
                '1 Faithless Looting',
                '1 Mana Vault',
                '1 Arcane Signet',
                '1 Fire Diamond',
                '1 Wayfarer\'s Bauble',
                '1 Mana Crypt',
                '1 Throne of the God-Pharaoh',
                '1 Phyrexian Arena',
                '1 Vandalblast',
                '1 Blasphemous Act',
                '1 Shattering Spree',
                '1 By Force',
                '1 Goblin Bushwhacker',
                '1 Reckless Bushwhacker',
                '1 Goblin Instigator',
                '1 Krenko\'s Command',
                '1 Dragon Fodder',
                '1 Hordeling Outburst',
                '1 Empty the Warrens',
                '1 Muxus, Goblin Grandee',
                '1 Pashalik Mons',
                '1 Sling-Gang Lieutenant',
                '1 Goblin King',
                '1 Battle Hymn',
                '1 Brightstone Ritual',
                '1 Goblin War Strike',
                '1 Massive Raid',
                '1 Mob Justice',
                '1 Goblin Bombardment',
              ];
              startGame(testDeck, 'Krenko, Mob Boss', 'Player');
            }}
          >
            <Swords className="h-5 w-5" />
            Start Test Game (Krenko Goblins)
          </Button>
        </div>
      </div>
    );
  }

  // Game in progress
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border/30 px-4 py-2 shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/game">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-1 h-4 w-4" /> Leave
            </Button>
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <Wifi className="h-3.5 w-3.5 text-green-400" />
            <span className="font-semibold text-gold">Forge Game</span>
            {gameState?.turn && (
              <span className="text-muted-foreground">
                &middot; Turn {gameState.turn.turnNumber} &middot; {gameState.turn.phase}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-1 text-red-400" onClick={concede}>
            <Flag className="h-3.5 w-3.5" /> Concede
          </Button>
          <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={disconnect}>
            Disconnect
          </Button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Game board area */}
        <main className="flex-1 overflow-auto p-4">
          {/* Game Over overlay */}
          {isGameOver && (
            <div className="mb-4 rounded-xl border border-gold/30 bg-gold/10 p-6 text-center">
              <h2 className="text-2xl font-bold text-gold">Game Over</h2>
              <p className="mt-2 text-lg">{winner === 'draw' ? 'Draw!' : `Winner: ${winner}`}</p>
              <Button className="mt-4" onClick={() => window.location.reload()}>
                New Game
              </Button>
            </div>
          )}

          {/* Choice prompt */}
          {pendingChoice && <ChoicePanel choice={pendingChoice} onRespond={respondToChoice} />}

          {/* Players */}
          {gameState?.players.map((player) => (
            <PlayerBoard key={player.id} player={player} isHuman={!player.isAI} />
          ))}

          {/* Stack */}
          {gameState?.stack && gameState.stack.length > 0 && (
            <div className="my-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <h3 className="mb-2 text-sm font-semibold text-amber-400">Stack ({gameState.stack.length})</h3>
              {gameState.stack.map((item, i) => (
                <div key={i} className="text-sm text-muted-foreground">
                  <span className="text-foreground">{item.cardName || 'Ability'}</span>
                  {' — '}{item.description} <span className="text-xs">({item.controller})</span>
                </div>
              ))}
            </div>
          )}
        </main>

        {/* Event log sidebar */}
        <aside className="hidden lg:flex w-[240px] shrink-0 border-l border-border/20 bg-card/10 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/10 px-3 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Events</h3>
            <span className="text-xs text-muted-foreground">{gameEvents.length}</span>
          </div>
          <div className="flex-1 overflow-auto p-2 text-xs">
            {gameEvents.slice(-50).reverse().map((evt, i) => (
              <div key={i} className="mb-1 text-muted-foreground">
                <span className="text-amber-400">{evt.eventType}</span>
                {': '}
                {JSON.stringify(evt).substring(0, 80)}
              </div>
            ))}
          </div>
        </aside>
      </div>

      {/* Mobile event log toggle */}
      <div className="lg:hidden border-t border-border/20">
        <button
          onClick={() => setEventLogOpen(!eventLogOpen)}
          className="flex w-full items-center justify-between px-4 py-2 text-xs text-muted-foreground"
        >
          Events ({gameEvents.length})
          {eventLogOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
        </button>
        {eventLogOpen && (
          <div className="max-h-40 overflow-auto px-4 pb-2 text-xs">
            {gameEvents.slice(-20).reverse().map((evt, i) => (
              <div key={i} className="mb-1 text-muted-foreground">
                <span className="text-amber-400">{evt.eventType}</span>
                {': '}
                {JSON.stringify(evt).substring(0, 60)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function PlayerBoard({ player, isHuman }: { player: ForgePlayer; isHuman: boolean }) {
  const [expanded, setExpanded] = useState(isHuman);

  return (
    <div className={`mb-4 rounded-xl border p-4 ${isHuman ? 'border-gold/30 bg-gold/5' : 'border-border/30 bg-card/30'}`}>
      {/* Player header */}
      <button onClick={() => setExpanded(!expanded)} className="flex w-full items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`text-lg font-bold ${isHuman ? 'text-gold' : 'text-muted-foreground'}`}>
            {player.name}
          </span>
          <div className="flex items-center gap-2 text-sm">
            <span className="flex items-center gap-1">
              <Heart className="h-3.5 w-3.5 text-red-400" /> {player.life}
            </span>
            {player.poison > 0 && (
              <span className="flex items-center gap-1">
                <Skull className="h-3.5 w-3.5 text-green-400" /> {player.poison}
              </span>
            )}
            <span className="text-muted-foreground">
              Library: {player.librarySize}
            </span>
          </div>
          {player.isActivePlayer && (
            <span className="rounded bg-gold/20 px-2 py-0.5 text-xs font-medium text-gold">Active</span>
          )}
          {player.hasPriority && (
            <span className="rounded bg-blue-500/20 px-2 py-0.5 text-xs font-medium text-blue-400">Priority</span>
          )}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {/* Hand (only show for human) */}
          {isHuman && player.hand.length > 0 && (
            <Zone title="Hand" cards={player.hand} color="cyan" />
          )}
          {!isHuman && player.hand.length > 0 && (
            <div className="text-xs text-muted-foreground">Hand: {player.hand.length} cards</div>
          )}

          {/* Battlefield */}
          {player.battlefield.length > 0 && (
            <Zone title="Battlefield" cards={player.battlefield} color="emerald" />
          )}

          {/* Graveyard */}
          {player.graveyard.length > 0 && (
            <Zone title="Graveyard" cards={player.graveyard} color="gray" collapsed />
          )}

          {/* Command zone */}
          {player.command.length > 0 && (
            <Zone title="Command Zone" cards={player.command} color="gold" />
          )}
        </div>
      )}
    </div>
  );
}

function Zone({ title, cards, color, collapsed: initialCollapsed = false }: {
  title: string;
  cards: ForgeCard[];
  color: string;
  collapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const colorClass = {
    cyan: 'text-cyan-400 border-cyan-400/20',
    emerald: 'text-emerald-400 border-emerald-400/20',
    gray: 'text-gray-400 border-gray-400/20',
    gold: 'text-gold border-gold/20',
    red: 'text-red-400 border-red-400/20',
  }[color] || 'text-muted-foreground border-border/20';

  return (
    <div>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className={`mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider ${colorClass}`}
      >
        {title} ({cards.length})
        {collapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
      </button>
      {!collapsed && (
        <div className="flex flex-wrap gap-1.5">
          {cards.map((card) => (
            <ForgeCardView key={card.id} card={card} />
          ))}
        </div>
      )}
    </div>
  );
}

function ForgeCardView({ card }: { card: ForgeCard }) {
  const isCreature = card.typeLine?.includes('Creature');
  const isLand = card.typeLine?.includes('Land');

  return (
    <div
      className={`group relative rounded-lg border px-2.5 py-1.5 text-xs transition-colors hover:bg-white/5 ${
        card.tapped ? 'rotate-6 opacity-60 border-border/20' : 'border-border/40'
      }`}
      title={`${card.name}\n${card.typeLine || ''}\n${card.oracleText || ''}`}
    >
      <div className="font-medium leading-tight">
        {card.name}
        {card.manaCost && <span className="ml-1 text-muted-foreground">{card.manaCost}</span>}
      </div>
      {isCreature && card.power !== undefined && (
        <div className="mt-0.5 text-muted-foreground">
          {card.power}/{card.toughness}
          {(card.damage ?? 0) > 0 && <span className="text-red-400"> ({card.damage} dmg)</span>}
        </div>
      )}
      {card.counters && Object.keys(card.counters).length > 0 && (
        <div className="mt-0.5 text-emerald-400">
          {Object.entries(card.counters).map(([type, count]) => `${count} ${type}`).join(', ')}
        </div>
      )}
      {card.isToken && <span className="ml-1 text-amber-400">[T]</span>}
      {card.sick && <span className="ml-1 text-yellow-400">[S]</span>}
    </div>
  );
}

function ChoicePanel({ choice, onRespond }: {
  choice: ForgeChoiceRequest;
  onRespond: (requestId: string, payload: Record<string, unknown>) => void;
}) {
  const uiType = mapChoiceToUI(choice.choiceType);
  const prompt = getChoicePrompt(choice);
  const cards = getChoiceCards(choice);
  const data = choice.data as Record<string, unknown>;
  const options = (data.options || []) as Array<{ id: string; label: string; description?: string }>;

  return (
    <div className="mb-4 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Zap className="h-4 w-4 text-cyan-400" />
        <h3 className="text-sm font-semibold text-cyan-400">{prompt}</h3>
        <span className="text-xs text-muted-foreground">({uiType})</span>
      </div>

      {/* Card options */}
      {cards.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {cards.map((card, i) => (
            <button
              key={card.id ?? i}
              onClick={() => onRespond(choice.requestId, { selectedCardId: card.id, selectedIndex: i })}
              className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium
                         text-cyan-300 hover:bg-cyan-500/20 transition-colors"
            >
              {card.name}
              {card.manaCost && <span className="ml-1 text-muted-foreground">{card.manaCost}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Generic options */}
      {options.length > 0 && cards.length === 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {options.map((opt, i) => (
            <Button
              key={opt.id ?? i}
              variant="secondary"
              size="sm"
              onClick={() => onRespond(choice.requestId, { selectedId: opt.id, selectedIndex: i })}
            >
              {opt.label || opt.id}
            </Button>
          ))}
        </div>
      )}

      {/* Binary choice (yes/no) */}
      {uiType === 'confirm' && cards.length === 0 && options.length === 0 && (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onRespond(choice.requestId, { result: true })}>Yes</Button>
          <Button size="sm" variant="secondary" onClick={() => onRespond(choice.requestId, { result: false })}>No</Button>
        </div>
      )}

      {/* Mulligan */}
      {uiType === 'mulligan' && (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onRespond(choice.requestId, { keepHand: true })}>
            <Shield className="mr-1 h-3.5 w-3.5" /> Keep
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onRespond(choice.requestId, { keepHand: false })}>
            Mulligan
          </Button>
        </div>
      )}

      {/* Fallback: pass/done for unknown types */}
      {uiType === 'unknown' && cards.length === 0 && options.length === 0 && (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => onRespond(choice.requestId, { pass: true })}>
            Pass / Done
          </Button>
          <p className="text-xs text-muted-foreground self-center">
            Unhandled choice type: {choice.choiceType}
          </p>
        </div>
      )}

      {/* Debug data */}
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-muted-foreground">Raw data</summary>
        <pre className="mt-1 max-h-40 overflow-auto rounded bg-black/50 p-2 text-xs text-muted-foreground">
          {JSON.stringify(choice, null, 2)}
        </pre>
      </details>
    </div>
  );
}
