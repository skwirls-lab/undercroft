import type { GameState, GameAction } from '@/engine/types';
import type { AIDecision, AIPlayerConfig } from './types';
import { buildAIPrompt, parseAIResponse } from './PromptBuilder';
import { makeFallbackDecision } from './FallbackAI';

export class AIPlayerController {
  private config: AIPlayerConfig;

  constructor(config: AIPlayerConfig) {
    this.config = config;
  }

  async makeDecision(
    state: GameState,
    legalActions: GameAction[]
  ): Promise<AIDecision> {
    if (legalActions.length === 0) {
      return {
        action: {
          type: 'PASS_PRIORITY',
          playerId: this.config.playerId,
          payload: {},
          timestamp: Date.now(),
        },
      };
    }

    // If only one legal action, just do it
    if (legalActions.length === 1) {
      return { action: legalActions[0] };
    }

    // Try LLM if configured and not using fallback
    if (this.config.providerConfig && !this.config.useFallback) {
      try {
        return await this.makeLLMDecision(state, legalActions);
      } catch (error) {
        console.warn(
          `LLM decision failed for ${this.config.name}, using fallback:`,
          error
        );
      }
    }

    // Fallback heuristic AI
    return makeFallbackDecision(state, legalActions, this.config.playerId);
  }

  private async makeLLMDecision(
    state: GameState,
    legalActions: GameAction[]
  ): Promise<AIDecision> {
    const prompt = buildAIPrompt(state, this.config.playerId, legalActions);

    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        provider: this.config.providerConfig,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI API returned ${response.status}`);
    }

    const data = await response.json();
    const action = parseAIResponse(data.response, legalActions);

    if (!action) {
      console.warn('Could not parse LLM response, using fallback');
      return makeFallbackDecision(state, legalActions, this.config.playerId);
    }

    return {
      action,
      reasoning: data.response,
    };
  }
}
