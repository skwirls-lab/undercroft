/**
 * ForgeGameClient — WebSocket client for the Forge bridge server.
 *
 * Connects to the Forge server, sends player decisions, and receives
 * game state updates + choice requests. Maps Forge's protocol to
 * our existing GameState/PendingChoice types for seamless UI integration.
 */

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ForgeChoiceRequest {
  requestId: string;
  choiceType: string;
  data: Record<string, unknown>;
}

export interface ForgeGameState {
  gameId: number;
  isGameOver: boolean;
  turn: {
    phase: string;
    activePlayer: string;
    activePlayerId: number;
    turnNumber: number;
    priorityPlayer: string;
  };
  players: ForgePlayer[];
  stack: ForgeStackItem[];
  combat?: {
    attackers: {
      cardId: number;
      name: string;
      blockers: { cardId: number; name: string }[];
    }[];
  };
}

export interface ForgePlayer {
  id: number;
  name: string;
  life: number;
  poison: number;
  isAI: boolean;
  isActivePlayer: boolean;
  hasPriority: boolean;
  manaPool: { white: number; blue: number; black: number; red: number; green: number; colorless: number };
  commanderDamage: Record<string, number>;
  hand: ForgeCard[];
  battlefield: ForgeCard[];
  graveyard: ForgeCard[];
  exile: ForgeCard[];
  command: ForgeCard[];
  librarySize: number;
}

export interface ForgeCard {
  id: number;
  name: string;
  typeLine?: string;
  manaCost?: string;
  oracleText?: string;
  power?: number;
  toughness?: number;
  basePower?: number;
  baseToughness?: number;
  loyalty?: number;
  tapped?: boolean;
  flipped?: boolean;
  faceDown?: boolean;
  sick?: boolean;
  counters?: Record<string, number>;
  equippedBy?: { id: number; name: string }[];
  enchantedBy?: { id: number; name: string }[];
  keywords?: string[];
  owner?: string;
  ownerId?: number;
  controller?: string;
  controllerId?: number;
  isToken?: boolean;
  damage?: number;
}

export interface ForgeStackItem {
  description: string;
  cardName?: string;
  cardId?: number;
  controller: string;
}

export interface ForgeGameEvent {
  eventType: string;
  [key: string]: unknown;
}

type MessageHandler = {
  onGameState?: (state: ForgeGameState) => void;
  onChoiceRequest?: (choice: ForgeChoiceRequest) => void;
  onGameEvent?: (event: ForgeGameEvent) => void;
  onGameOver?: (payload: { winner: string; winnerIsHuman: boolean }) => void;
  onError?: (message: string) => void;
  onConnectionChange?: (status: ConnectionStatus) => void;
};

export class ForgeGameClient {
  private ws: WebSocket | null = null;
  private serverUrl: string;
  private handlers: MessageHandler;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private sessionId: string | null = null;
  private keepAliveInterval: ReturnType<typeof setInterval> | null = null;

  constructor(serverUrl: string, handlers: MessageHandler) {
    this.serverUrl = serverUrl;
    this.handlers = handlers;
  }

  /** Connect to the Forge server */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.handlers.onConnectionChange?.('connecting');

      try {
        this.ws = new WebSocket(this.serverUrl);

        this.ws.onopen = () => {
          this.reconnectAttempts = 0;
          this.handlers.onConnectionChange?.('connected');
          // Start keepalive pings to prevent idle timeout
          this.startKeepAlive();
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string);
            this.handleMessage(msg);
          } catch (e) {
            console.error('[ForgeClient] Failed to parse message:', e);
          }
        };

        this.ws.onclose = (event) => {
          this.stopKeepAlive();
          this.handlers.onConnectionChange?.('disconnected');
          if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
            console.log(`[ForgeClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
            setTimeout(() => this.connect(), delay);
          }
        };

        this.ws.onerror = (error) => {
          console.error('[ForgeClient] WebSocket error:', error);
          this.handlers.onConnectionChange?.('error');
          reject(error);
        };
      } catch (e) {
        this.handlers.onConnectionChange?.('error');
        reject(e);
      }
    });
  }

  /** Disconnect from server */
  disconnect() {
    this.maxReconnectAttempts = 0; // Prevent auto-reconnect
    this.stopKeepAlive();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private startKeepAlive() {
    this.stopKeepAlive();
    this.keepAliveInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping', payload: {} }));
      }
    }, 30_000);
  }

  private stopKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  /** Start a new game */
  startGame(deckList: string[], commander?: string, playerName?: string, aiCount?: number) {
    this.send('start_game', {
      deckList,
      commander,
      playerName: playerName || 'Player',
      format: 'commander',
      aiCount: aiCount ?? 1,
    });
  }

  /** Respond to a choice request from the server */
  sendChoiceResponse(requestId: string, payload: Record<string, unknown>) {
    this.send('choice_response', { requestId, ...payload });
  }

  /** Concede the game */
  concede() {
    this.send('concede', {});
  }

  // --- Internal ---

  private send(type: string, payload: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    } else {
      console.warn('[ForgeClient] Cannot send — not connected');
    }
  }

  private handleMessage(msg: { type: string; payload: unknown }) {
    switch (msg.type) {
      case 'connected':
        this.sessionId = (msg.payload as { sessionId: string }).sessionId;
        break;

      case 'game_state':
        this.handlers.onGameState?.(msg.payload as ForgeGameState);
        break;

      case 'choice_request':
        this.handlers.onChoiceRequest?.(msg.payload as ForgeChoiceRequest);
        break;

      case 'game_event':
        this.handlers.onGameEvent?.(msg.payload as ForgeGameEvent);
        break;

      case 'game_over':
        this.handlers.onGameOver?.(msg.payload as { winner: string; winnerIsHuman: boolean });
        break;

      case 'error':
        this.handlers.onError?.((msg.payload as { message: string }).message);
        break;

      default:
        console.warn('[ForgeClient] Unknown message type:', msg.type);
    }
  }
}
