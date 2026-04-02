import type { GameAction } from '@/engine/types';

export interface AIProvider {
  name: string;
  generateResponse(prompt: string): Promise<string>;
}

export interface AIProviderConfig {
  provider: 'groq' | 'openai' | 'anthropic' | 'custom';
  apiKey: string;
  model: string;
  baseUrl?: string;
  temperature?: number;
}

export interface AIDecision {
  action: GameAction;
  reasoning?: string;
  confidence?: number;
}

export interface AIPlayerConfig {
  playerId: string;
  name: string;
  personality: 'aggressive' | 'defensive' | 'balanced' | 'chaotic';
  providerConfig?: AIProviderConfig;
  useFallback: boolean;
}
