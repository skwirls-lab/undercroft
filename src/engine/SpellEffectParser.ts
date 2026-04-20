// ============================================================
// Spell Effect Parser — Extracts structured effects from oracle text
// ============================================================

export type TargetType =
  | 'creature'
  | 'player'
  | 'permanent'
  | 'artifact'
  | 'enchantment'
  | 'planeswalker'
  | 'spell'
  | 'any'
  | 'self'
  | 'each_opponent'
  | 'all_opponents'
  | 'each_player';

export type EffectType =
  | 'destroy'
  | 'exile'
  | 'bounce'
  | 'damage'
  | 'draw'
  | 'pump'
  | 'gain_life'
  | 'lose_life'
  | 'discard'
  | 'counter_spell'
  | 'destroy_all'
  | 'exile_all'
  | 'tap'
  | 'untap'
  | 'create_token'
  | 'add_counter';

export interface SpellEffect {
  type: EffectType;
  targetType?: TargetType;
  amount?: number;
  power?: number;
  toughness?: number;
  filter?: string;
  duration?: 'until_end_of_turn' | 'permanent';
  requiresTarget: boolean;
  tokenName?: string;       // For create_token: creature type name
  tokenColors?: string[];   // For create_token: colors of the token
  tokenKeywords?: string[]; // For create_token: keywords like flying, haste
  counterType?: string;     // For add_counter: e.g. '+1/+1'
}

const WORD_TO_NUM: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4,
  five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

function parseNumberWord(s: string): number {
  return (WORD_TO_NUM[s] ?? parseInt(s, 10)) || 1;
}

function mapTargetType(matched: string): TargetType {
  if (matched === 'permanent' || matched === 'nonland permanent') return 'permanent';
  if (matched === 'artifact') return 'artifact';
  if (matched === 'enchantment') return 'enchantment';
  if (matched === 'planeswalker') return 'planeswalker';
  return 'creature';
}

export function parseSpellEffects(oracleText: string): SpellEffect[] {
  if (!oracleText) return [];
  const text = oracleText.toLowerCase();
  const effects: SpellEffect[] = [];

  // --- Destroy target ---
  const destroyTargetRe = /destroy target (creature|permanent|artifact|enchantment|planeswalker|nonland permanent)/;
  const destroyTargetMatch = text.match(destroyTargetRe);
  if (destroyTargetMatch) {
    effects.push({ type: 'destroy', targetType: mapTargetType(destroyTargetMatch[1]), requiresTarget: true });
  }

  // --- Destroy all ---
  const destroyAllRe = /destroy all (creatures|nonland permanents|permanents|artifacts|enchantments)/;
  const destroyAllMatch = text.match(destroyAllRe);
  if (destroyAllMatch) {
    effects.push({ type: 'destroy_all', filter: destroyAllMatch[1], requiresTarget: false });
  }

  // --- Exile target ---
  const exileTargetRe = /exile target (creature|permanent|artifact|enchantment|nonland permanent)/;
  const exileTargetMatch = text.match(exileTargetRe);
  if (exileTargetMatch) {
    effects.push({ type: 'exile', targetType: mapTargetType(exileTargetMatch[1]), requiresTarget: true });
  }

  // --- Exile all ---
  const exileAllRe = /exile all (creatures|nonland permanents|permanents|artifacts|enchantments)/;
  const exileAllMatch = text.match(exileAllRe);
  if (exileAllMatch) {
    effects.push({ type: 'exile_all', filter: exileAllMatch[1], requiresTarget: false });
  }

  // --- Bounce (return to hand) ---
  const bounceRe = /return target (creature|permanent|nonland permanent|artifact|enchantment) to its owner's hand/;
  const bounceMatch = text.match(bounceRe);
  if (bounceMatch) {
    effects.push({ type: 'bounce', targetType: mapTargetType(bounceMatch[1]), requiresTarget: true });
  }

  // --- Deal damage ---
  const damageRe = /deals? (\d+) damage to (any target|target creature|target player|target creature or player|target creature or planeswalker|target opponent|each opponent|each creature|each player)/;
  const damageMatch = text.match(damageRe);
  if (damageMatch) {
    const amount = parseInt(damageMatch[1], 10);
    const target = damageMatch[2];
    let targetType: TargetType = 'any';
    let requiresTarget = true;
    if (target === 'target creature') targetType = 'creature';
    else if (target === 'target player' || target === 'target opponent') targetType = 'player';
    else if (target === 'each opponent') { targetType = 'each_opponent'; requiresTarget = false; }
    else if (target === 'each player') { targetType = 'each_player'; requiresTarget = false; }
    else if (target === 'each creature') { targetType = 'creature'; requiresTarget = false; }
    effects.push({ type: 'damage', targetType, amount, requiresTarget });
  }

  // --- Draw cards (self) ---
  const drawRe = /(?:you )?draw (\d+|a|an|one|two|three|four|five|six|seven) cards?/;
  const drawMatch = text.match(drawRe);
  if (drawMatch && !text.includes('target player draws') && !text.includes('target opponent draws')) {
    effects.push({ type: 'draw', amount: parseNumberWord(drawMatch[1]), targetType: 'self', requiresTarget: false });
  }

  // --- Target player draws ---
  const targetDrawRe = /target (?:player|opponent) draws (\d+|a|an|one|two|three) cards?/;
  const targetDrawMatch = text.match(targetDrawRe);
  if (targetDrawMatch) {
    effects.push({ type: 'draw', amount: parseNumberWord(targetDrawMatch[1]), targetType: 'player', requiresTarget: true });
  }

  // --- Gain life ---
  const gainLifeRe = /(?:you )?gain (\d+) life/;
  const gainLifeMatch = text.match(gainLifeRe);
  if (gainLifeMatch) {
    effects.push({ type: 'gain_life', amount: parseInt(gainLifeMatch[1], 10), targetType: 'self', requiresTarget: false });
  }

  // --- Lose life (target / each) ---
  const loseLifeTargetRe = /target (?:player|opponent) loses (\d+) life/;
  const loseLifeTargetMatch = text.match(loseLifeTargetRe);
  if (loseLifeTargetMatch) {
    effects.push({ type: 'lose_life', amount: parseInt(loseLifeTargetMatch[1], 10), targetType: 'player', requiresTarget: true });
  }
  const loseLifeEachRe = /each opponent loses (\d+) life/;
  const loseLifeEachMatch = text.match(loseLifeEachRe);
  if (loseLifeEachMatch) {
    effects.push({ type: 'lose_life', amount: parseInt(loseLifeEachMatch[1], 10), targetType: 'each_opponent', requiresTarget: false });
  }

  // --- Pump ---
  const pumpRe = /target creature gets ([+-]\d+)\/([+-]\d+) until end of turn/;
  const pumpMatch = text.match(pumpRe);
  if (pumpMatch) {
    effects.push({
      type: 'pump',
      targetType: 'creature',
      power: parseInt(pumpMatch[1], 10),
      toughness: parseInt(pumpMatch[2], 10),
      duration: 'until_end_of_turn',
      requiresTarget: true,
    });
  }

  // --- Discard (target) ---
  const discardTargetRe = /target (?:player|opponent) discards (\d+|a|an|one|two|three) cards?/;
  const discardTargetMatch = text.match(discardTargetRe);
  if (discardTargetMatch) {
    effects.push({ type: 'discard', amount: parseNumberWord(discardTargetMatch[1]), targetType: 'player', requiresTarget: true });
  }

  // --- Discard (each opponent) ---
  const discardEachRe = /each opponent discards (\d+|a|an|one|two|three) cards?/;
  const discardEachMatch = text.match(discardEachRe);
  if (discardEachMatch) {
    effects.push({ type: 'discard', amount: parseNumberWord(discardEachMatch[1]), targetType: 'each_opponent', requiresTarget: false });
  }

  // --- Counter target spell ---
  if (text.includes('counter target spell')) {
    effects.push({ type: 'counter_spell', targetType: 'spell', requiresTarget: true });
  }

  // --- Tap target creature ---
  if (/tap target creature/.test(text) && !/untap/.test(text.split('tap target')[0].slice(-3))) {
    effects.push({ type: 'tap', targetType: 'creature', requiresTarget: true });
  }

  // --- Untap target creature ---
  if (/untap target creature/.test(text)) {
    effects.push({ type: 'untap', targetType: 'creature', requiresTarget: true });
  }

  // --- Create token ---
  // Patterns: "create a 1/1 white Soldier creature token", "create two 2/2 black Zombie creature tokens"
  const tokenRe = /creates? (?:(\d+|a|an|one|two|three|four|five) )?(\d+)\/(\d+)(?: ([a-z]+(?:\s+and\s+[a-z]+)*))? ([A-Za-z][a-z]+(?:\s+[A-Za-z][a-z]+)*?) creature tokens?/i;
  const tokenMatch = oracleText.match(tokenRe);
  if (tokenMatch) {
    const count = tokenMatch[1] ? parseNumberWord(tokenMatch[1]) : 1;
    const keywords: string[] = [];
    // Check for common keywords in the surrounding text
    if (/with flying/i.test(oracleText)) keywords.push('flying');
    if (/with haste/i.test(oracleText)) keywords.push('haste');
    if (/with lifelink/i.test(oracleText)) keywords.push('lifelink');
    if (/with trample/i.test(oracleText)) keywords.push('trample');
    if (/with deathtouch/i.test(oracleText)) keywords.push('deathtouch');
    if (/with vigilance/i.test(oracleText)) keywords.push('vigilance');

    effects.push({
      type: 'create_token',
      amount: count,
      power: parseInt(tokenMatch[2], 10),
      toughness: parseInt(tokenMatch[3], 10),
      tokenName: tokenMatch[5]?.trim() || 'Token',
      tokenColors: tokenMatch[4] ? tokenMatch[4].split(/\s+and\s+/) : [],
      tokenKeywords: keywords,
      requiresTarget: false,
    });
  }

  // --- +1/+1 counters ---
  // "put a +1/+1 counter on target creature"
  const counterTargetRe = /put (?:(\d+|a|an|one|two|three) )\+1\/\+1 counters? on target (creature|permanent)/;
  const counterTargetMatch = text.match(counterTargetRe);
  if (counterTargetMatch) {
    effects.push({
      type: 'add_counter',
      amount: parseNumberWord(counterTargetMatch[1]),
      counterType: '+1/+1',
      targetType: counterTargetMatch[2] === 'permanent' ? 'permanent' : 'creature',
      requiresTarget: true,
    });
  }

  // "put a +1/+1 counter on ~" / "put a +1/+1 counter on it"
  const counterSelfRe = /put (?:(\d+|a|an|one|two|three) )\+1\/\+1 counters? on (?:~|it|this creature)/;
  const counterSelfMatch = text.match(counterSelfRe);
  if (counterSelfMatch && !counterTargetMatch) {
    effects.push({
      type: 'add_counter',
      amount: parseNumberWord(counterSelfMatch[1]),
      counterType: '+1/+1',
      targetType: 'self',
      requiresTarget: false,
    });
  }

  return effects;
}

export function spellRequiresTarget(oracleText: string): boolean {
  return parseSpellEffects(oracleText).some((e) => e.requiresTarget);
}

export function getRequiredTargetTypes(oracleText: string): TargetType[] {
  return parseSpellEffects(oracleText)
    .filter((e) => e.requiresTarget && e.targetType)
    .map((e) => e.targetType!);
}
