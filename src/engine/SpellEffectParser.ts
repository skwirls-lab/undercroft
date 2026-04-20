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
  | 'add_counter'
  | 'scry'
  | 'mill'
  | 'search_library'
  | 'return_from_graveyard'
  | 'create_treasure'
  | 'fight'
  | 'sacrifice'
  | 'put_land_onto_battlefield'
  | 'each_draw'
  | 'surveil';

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
  searchFilter?: string;    // For search_library: what to find
  destination?: string;     // For search/return: where the card goes
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

  // --- Scry ---
  const scryRe = /scry (\d+|a|one|two|three)/;
  const scryMatch = text.match(scryRe);
  if (scryMatch) {
    effects.push({ type: 'scry', amount: parseNumberWord(scryMatch[1]), requiresTarget: false });
  }

  // --- Surveil ---
  const surveilRe = /surveil (\d+|a|one|two|three)/;
  const surveilMatch = text.match(surveilRe);
  if (surveilMatch && !scryMatch) {
    effects.push({ type: 'surveil', amount: parseNumberWord(surveilMatch[1]), requiresTarget: false });
  }

  // --- Mill ---
  // "mill N cards" or "target player mills N cards" or "put the top N cards of your library into your graveyard"
  const millSelfRe = /(?:you )?mill (\d+|a|one|two|three|four|five) cards?/;
  const millSelfMatch = text.match(millSelfRe);
  if (millSelfMatch) {
    effects.push({ type: 'mill', amount: parseNumberWord(millSelfMatch[1]), targetType: 'self', requiresTarget: false });
  }
  const millTargetRe = /target (?:player|opponent) mills (\d+|a|one|two|three|four|five) cards?/;
  const millTargetMatch = text.match(millTargetRe);
  if (millTargetMatch) {
    effects.push({ type: 'mill', amount: parseNumberWord(millTargetMatch[1]), targetType: 'player', requiresTarget: true });
  }
  const putTopRe = /put the top (\d+|a|one|two|three) cards? of your library into your graveyard/;
  const putTopMatch = text.match(putTopRe);
  if (putTopMatch && !millSelfMatch) {
    effects.push({ type: 'mill', amount: parseNumberWord(putTopMatch[1]), targetType: 'self', requiresTarget: false });
  }

  // --- Search library for a land (ramp) ---
  // "search your library for a basic land card, put it onto the battlefield tapped"
  const searchLandBfRe = /search your library for (?:a|up to (?:one|two|three|\d+)) (basic land|land|forest|island|mountain|plains|swamp) cards?,.*?(?:put (?:it|them) onto the battlefield|enter(?:s)? the battlefield)/;
  const searchLandBfMatch = text.match(searchLandBfRe);
  if (searchLandBfMatch) {
    effects.push({ type: 'put_land_onto_battlefield', searchFilter: searchLandBfMatch[1], requiresTarget: false });
  }

  // "search your library for a basic land card and put that card into your hand"
  const searchLandHandRe = /search your library for (?:a|up to (?:one|two|three|\d+)) (basic land|land|forest|island|mountain|plains|swamp) cards?.*?(?:put (?:it|that card|them) into your hand|reveal it.*?put it into your hand)/;
  const searchLandHandMatch = text.match(searchLandHandRe);
  if (searchLandHandMatch && !searchLandBfMatch) {
    effects.push({ type: 'search_library', searchFilter: searchLandHandMatch[1], destination: 'hand', requiresTarget: false });
  }

  // Generic "search your library for a card"
  const searchGenericRe = /search your library for a card/;
  const searchGenericMatch = text.match(searchGenericRe);
  if (searchGenericMatch && !searchLandBfMatch && !searchLandHandMatch) {
    effects.push({ type: 'search_library', searchFilter: 'any', destination: 'hand', requiresTarget: false });
  }

  // --- Return from graveyard ---
  const returnGYRe = /return target (creature|permanent|artifact|enchantment) card from your graveyard to (your hand|the battlefield)/;
  const returnGYMatch = text.match(returnGYRe);
  if (returnGYMatch) {
    effects.push({
      type: 'return_from_graveyard',
      targetType: mapTargetType(returnGYMatch[1]),
      destination: returnGYMatch[2] === 'your hand' ? 'hand' : 'battlefield',
      requiresTarget: true,
    });
  }
  // Also match "return ... from a graveyard" / "return ... from your graveyard to your hand"
  const returnGY2Re = /return (?:a |target )?(creature|permanent) card from (?:a|your) graveyard to (your hand|the battlefield)/;
  const returnGY2Match = text.match(returnGY2Re);
  if (returnGY2Match && !returnGYMatch) {
    effects.push({
      type: 'return_from_graveyard',
      targetType: mapTargetType(returnGY2Match[1]),
      destination: returnGY2Match[2] === 'your hand' ? 'hand' : 'battlefield',
      requiresTarget: false, // "a creature" is often self-selecting
    });
  }

  // --- Create Treasure tokens ---
  const treasureRe = /creates? (\d+|a|an|one|two|three|four|five) treasure tokens?/;
  const treasureMatch = text.match(treasureRe);
  if (treasureMatch) {
    effects.push({ type: 'create_treasure', amount: parseNumberWord(treasureMatch[1]), requiresTarget: false });
  }

  // --- Fight ---
  const fightRe = /(?:target creature you control )?fights? target creature/;
  if (fightRe.test(text)) {
    effects.push({ type: 'fight', targetType: 'creature', requiresTarget: true });
  }

  // --- Sacrifice ---
  const sacrificeRe = /sacrifice (?:a|an) (creature|permanent|artifact|enchantment)/;
  const sacrificeMatch = text.match(sacrificeRe);
  if (sacrificeMatch) {
    effects.push({ type: 'sacrifice', filter: sacrificeMatch[1], requiresTarget: false });
  }

  // --- Each player draws / each opponent draws ---
  const eachDrawRe = /each (?:player|opponent) draws (\d+|a|one|two|three) cards?/;
  const eachDrawMatch = text.match(eachDrawRe);
  if (eachDrawMatch) {
    const isOpponent = text.includes('each opponent draws');
    effects.push({
      type: 'each_draw',
      amount: parseNumberWord(eachDrawMatch[1]),
      targetType: isOpponent ? 'each_opponent' : 'each_player',
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
