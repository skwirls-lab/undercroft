/**
 * Pre-built AI Commander decks.
 * Each deck is a 100-card mono-colored Commander deck using real card names.
 * The AI randomly selects from these when starting a game.
 */

export interface AIDeck {
  name: string;
  commander: string;
  colors: string;
  strategy: string;
  cards: string[];   // "1 Card Name" format, excluding commander
}

// ─── Krenko, Mob Boss — Red Goblins (Aggro / Tribal) ────────────────────────

const krenkoGoblins: AIDeck = {
  name: 'Krenko\'s Goblin Horde',
  commander: 'Krenko, Mob Boss',
  colors: 'R',
  strategy: 'Swarm the board with Goblin tokens and overwhelm opponents',
  cards: [
    // Creatures (30)
    '1 Goblin Chieftain',
    '1 Goblin Warchief',
    '1 Goblin King',
    '1 Goblin Rabblemaster',
    '1 Legion Warboss',
    '1 Siege-Gang Commander',
    '1 Skirk Prospector',
    '1 Goblin Instigator',
    '1 Mogg War Marshal',
    '1 Goblin Matron',
    '1 Goblin Ringleader',
    '1 Goblin Recruiter',
    '1 Goblin Chainwhirler',
    '1 Goblin Trashmaster',
    '1 Gempalm Incinerator',
    '1 Beetleback Chief',
    '1 Goblin Marshal',
    '1 Goblin Bushwhacker',
    '1 Reckless Bushwhacker',
    '1 Foundry Street Denizen',
    '1 Sensation Gorger',
    '1 Goblin Lackey',
    '1 Warren Instigator',
    '1 Hobgoblin Bandit Lord',
    '1 Muxus, Goblin Grandee',
    '1 Pashalik Mons',
    '1 Purphoros, God of the Forge',
    '1 Iron Myr',
    '1 Goblin Piledriver',
    '1 Skirk Fire Marshal',
    // Instants & Sorceries (10)
    '1 Lightning Bolt',
    '1 Chaos Warp',
    '1 Goblin War Strike',
    '1 Brightstone Ritual',
    '1 Battle Hymn',
    '1 Hordeling Outburst',
    '1 Dragon Fodder',
    '1 Krenko\'s Command',
    '1 Empty the Warrens',
    '1 Burn Down the House',
    // Artifacts (10)
    '1 Sol Ring',
    '1 Arcane Signet',
    '1 Ruby Medallion',
    '1 Throne of the God-Pharaoh',
    '1 Door of Destinies',
    '1 Herald\'s Horn',
    '1 Coat of Arms',
    '1 Swiftfoot Boots',
    '1 Lightning Greaves',
    '1 Skullclamp',
    // Enchantments (5)
    '1 Impact Tremors',
    '1 Goblin Bombardment',
    '1 Outpost Siege',
    '1 Shared Animosity',
    '1 Quest for the Goblin Lord',
    // Planeswalkers (1)
    '1 Chandra, Torch of Defiance',
    // Lands (43 — includes utility lands)
    '1 Castle Embereth',
    '1 Nykthos, Shrine to Nyx',
    '1 Skirk Ridge',
    '1 Goblin Burrows',
    '1 Forgotten Cave',
    '1 Great Furnace',
    '1 Command Tower',
    '36 Mountain',
  ],
};

// ─── Talrand, Sky Summoner — Blue Spells (Control / Tempo) ───────────────────

const talrandSpells: AIDeck = {
  name: 'Talrand\'s Drake Factory',
  commander: 'Talrand, Sky Summoner',
  colors: 'U',
  strategy: 'Cast instants and sorceries to create Drake tokens while controlling the board',
  cards: [
    // Creatures (8)
    '1 Archaeomancer',
    '1 Baral, Chief of Compliance',
    '1 Docent of Perfection',
    '1 Murmuring Mystic',
    '1 Spellseeker',
    '1 Clever Impersonator',
    '1 Torrential Gearhulk',
    '1 Silver Myr',
    // Instants (25)
    '1 Counterspell',
    '1 Mana Leak',
    '1 Negate',
    '1 Swan Song',
    '1 Arcane Denial',
    '1 Dissolve',
    '1 Dissipate',
    '1 Forbid',
    '1 Cryptic Command',
    '1 Brainstorm',
    '1 Ponder',
    '1 Opt',
    '1 Think Twice',
    '1 Fact or Fiction',
    '1 Dig Through Time',
    '1 Cyclonic Rift',
    '1 Into the Roil',
    '1 Rapid Hybridization',
    '1 Pongify',
    '1 Reality Shift',
    '1 Snap',
    '1 Unsummon',
    '1 Vapor Snag',
    '1 Blue Sun\'s Zenith',
    '1 Mystical Tutor',
    // Sorceries (10)
    '1 Preordain',
    '1 Serum Visions',
    '1 Treasure Cruise',
    '1 Bribery',
    '1 Expropriate',
    '1 Temporal Mastery',
    '1 Merchant Scroll',
    '1 Chart a Course',
    '1 Windfall',
    '1 Coastal Breach',
    // Artifacts (8)
    '1 Sol Ring',
    '1 Arcane Signet',
    '1 Sky Diamond',
    '1 Sapphire Medallion',
    '1 Isochron Scepter',
    '1 Lightning Greaves',
    '1 Swiftfoot Boots',
    '1 Mind Stone',
    // Enchantments (5)
    '1 Rhystic Study',
    '1 Mystic Remora',
    '1 Propaganda',
    '1 Monastery Siege',
    '1 Shark Typhoon',
    // Lands (43)
    '1 Reliquary Tower',
    '1 Mystic Sanctuary',
    '1 Castle Vantress',
    '1 Lonely Sandbar',
    '1 Remote Isle',
    '1 Seat of the Synod',
    '1 Command Tower',
    '36 Island',
  ],
};

// ─── Ghalta, Primal Hunger — Green Stompy (Ramp / Beatdown) ─────────────────

const ghaltaStompy: AIDeck = {
  name: 'Ghalta\'s Primal Force',
  commander: 'Ghalta, Primal Hunger',
  colors: 'G',
  strategy: 'Ramp into massive creatures and cast Ghalta cheaply for lethal commander damage',
  cards: [
    // Creatures (33)
    '1 Llanowar Elves',
    '1 Elvish Mystic',
    '1 Fyndhorn Elves',
    '1 Birds of Paradise',
    '1 Arbor Elf',
    '1 Elvish Archdruid',
    '1 Marwyn, the Nurturer',
    '1 Priest of Titania',
    '1 Karametra\'s Acolyte',
    '1 Selvala, Heart of the Wilds',
    '1 Gigantosaurus',
    '1 Rhonas the Indomitable',
    '1 Surrak, the Hunt Caller',
    '1 Goreclaw, Terror of Qal Sisma',
    '1 Wayward Swordtooth',
    '1 Rampaging Baloths',
    '1 Avenger of Zendikar',
    '1 Craterhoof Behemoth',
    '1 Vorinclex, Voice of Hunger',
    '1 Worldspine Wurm',
    '1 Timber Protector',
    '1 Stonehoof Chieftain',
    '1 Kogla, the Titan Ape',
    '1 Beast Whisperer',
    '1 Fierce Empath',
    '1 Reclamation Sage',
    '1 Eternal Witness',
    '1 Ulvenwald Tracker',
    '1 Steel Leaf Champion',
    '1 Old Gnawbone',
    '1 Terastodon',
    '1 Nylea, God of the Hunt',
    '1 Leatherback Baloth',
    // Instants & Sorceries (10)
    '1 Beast Within',
    '1 Heroic Intervention',
    '1 Chord of Calling',
    '1 Cultivate',
    '1 Kodama\'s Reach',
    '1 Rampant Growth',
    '1 Genesis Wave',
    '1 Overwhelming Stampede',
    '1 Return of the Wildspeaker',
    '1 Green Sun\'s Zenith',
    // Artifacts (6)
    '1 Sol Ring',
    '1 Arcane Signet',
    '1 Lightning Greaves',
    '1 Swiftfoot Boots',
    '1 Emerald Medallion',
    '1 The Great Henge',
    // Enchantments (7)
    '1 Rancor',
    '1 Greater Good',
    '1 Elemental Bond',
    '1 Garruk\'s Uprising',
    '1 Zendikar Resurgent',
    '1 Unnatural Growth',
    '1 Tribute to the World Tree',
    // Lands (43)
    '1 Nykthos, Shrine to Nyx',
    '1 Castle Garenbrig',
    '1 Tranquil Thicket',
    '1 Oran-Rief, the Vastwood',
    '1 Rogue\'s Passage',
    '1 Tree of Tales',
    '1 Command Tower',
    '36 Forest',
  ],
};

// ─── Mikaeus, the Lunarch — White Weenies (Tokens / Anthems) ─────────────────

const mikaeusWeenies: AIDeck = {
  name: 'Mikaeus\'s Righteous Army',
  commander: 'Mikaeus, the Lunarch',
  colors: 'W',
  strategy: 'Build a wide board of tokens and small creatures, then buff them with anthems',
  cards: [
    // Creatures (30)
    '1 Mother of Runes',
    '1 Thraben Inspector',
    '1 Selfless Spirit',
    '1 Thalia\'s Lieutenant',
    '1 Grand Abolisher',
    '1 Adeline, Resplendent Cathar',
    '1 Mentor of the Meek',
    '1 Benalish Marshal',
    '1 Linden, the Steadfast Queen',
    '1 Hero of Bladehold',
    '1 Ranger of Eos',
    '1 Sun Titan',
    '1 Elesh Norn, Grand Cenobite',
    '1 Angel of Invention',
    '1 Archangel of Thune',
    '1 Heliod, Sun-Crowned',
    '1 Precinct Captain',
    '1 Brimaz, King of Oreskos',
    '1 Leonin Warleader',
    '1 Captain of the Watch',
    '1 Knight-Captain of Eos',
    '1 Darien, King of Kjeldor',
    '1 Hanweir Militia Captain',
    '1 Imposing Sovereign',
    '1 Recruiter of the Guard',
    '1 Stoneforge Mystic',
    '1 Palace Jailer',
    '1 Gold Myr',
    '1 Loyal Warhound',
    '1 Blade Splicer',
    // Instants & Sorceries (10)
    '1 Swords to Plowshares',
    '1 Path to Exile',
    '1 Secure the Wastes',
    '1 Raise the Alarm',
    '1 White Sun\'s Zenith',
    '1 Martial Coup',
    '1 Wrath of God',
    '1 Austere Command',
    '1 Teferi\'s Protection',
    '1 Flawless Maneuver',
    // Artifacts (8)
    '1 Sol Ring',
    '1 Arcane Signet',
    '1 Pearl Medallion',
    '1 Lightning Greaves',
    '1 Swiftfoot Boots',
    '1 Skullclamp',
    '1 Sword of the Animist',
    '1 Mind Stone',
    // Enchantments (8)
    '1 Honor of the Pure',
    '1 Intangible Virtue',
    '1 Anointed Procession',
    '1 Divine Visitation',
    '1 Cathars\' Crusade',
    '1 Land Tax',
    '1 Smothering Tithe',
    '1 Court of Grace',
    // Lands (43)
    '1 Castle Ardenvale',
    '1 Nykthos, Shrine to Nyx',
    '1 Emeria, the Sky Ruin',
    '1 Secluded Steppe',
    '1 Ancient Den',
    '1 Windbrisk Heights',
    '1 Command Tower',
    '36 Plains',
  ],
};

// ─── Erebos, God of the Dead — Black Devotion (Removal / Drain) ──────────────

const erebosDevotion: AIDeck = {
  name: 'Erebos\'s Dark Devotion',
  commander: 'Erebos, God of the Dead',
  colors: 'B',
  strategy: 'Control the board with removal, drain opponents, and leverage card draw',
  cards: [
    // Creatures (28)
    '1 Gray Merchant of Asphodel',
    '1 Nighthawk Scavenger',
    '1 Vampire Nighthawk',
    '1 Dusk Legion Zealot',
    '1 Gifted Aetherborn',
    '1 Phyrexian Obliterator',
    '1 Nirkana Revenant',
    '1 Crypt Ghast',
    '1 Geralf\'s Messenger',
    '1 Kokusho, the Evening Star',
    '1 Massacre Wurm',
    '1 Sheoldred, Whispering One',
    '1 Grave Titan',
    '1 Bloodline Keeper',
    '1 Zulaport Cutthroat',
    '1 Blood Artist',
    '1 Viscera Seer',
    '1 Carrion Feeder',
    '1 Reassembling Skeleton',
    '1 Plaguecrafter',
    '1 Fleshbag Marauder',
    '1 Ravenous Chupacabra',
    '1 Demon of Dark Schemes',
    '1 Leaden Myr',
    '1 Dauthi Voidwalker',
    '1 Grim Haruspex',
    '1 Midnight Reaper',
    '1 Ophiomancer',
    // Instants & Sorceries (13)
    '1 Fatal Push',
    '1 Go for the Throat',
    '1 Hero\'s Downfall',
    '1 Malicious Affliction',
    '1 Doom Blade',
    '1 Toxic Deluge',
    '1 Damnation',
    '1 Sign in Blood',
    '1 Read the Bones',
    '1 Exsanguinate',
    '1 Torment of Hailfire',
    '1 Reanimate',
    '1 Living Death',
    // Artifacts (7)
    '1 Sol Ring',
    '1 Arcane Signet',
    '1 Jet Medallion',
    '1 Lightning Greaves',
    '1 Swiftfoot Boots',
    '1 Skullclamp',
    '1 Mind Stone',
    // Enchantments (8)
    '1 Phyrexian Arena',
    '1 Underworld Connections',
    '1 Black Market',
    '1 Dictate of Erebos',
    '1 Grave Pact',
    '1 Animate Dead',
    '1 Whip of Erebos',
    '1 Palace Siege',
    // Lands (43)
    '1 Cabal Coffers',
    '1 Cabal Stronghold',
    '1 Nykthos, Shrine to Nyx',
    '1 Castle Locthwain',
    '1 Barren Moor',
    '1 Vault of Whispers',
    '1 Command Tower',
    '36 Swamp',
  ],
};

// ─── Exports ─────────────────────────────────────────────────────────────────

export const AI_DECKS: AIDeck[] = [
  krenkoGoblins,
  talrandSpells,
  ghaltaStompy,
  mikaeusWeenies,
  erebosDevotion,
];

/**
 * Pick a random AI deck, optionally excluding specific deck names
 * to avoid duplicates when multiple AIs are present.
 */
export function pickRandomAIDeck(excludeNames: string[] = []): AIDeck {
  const available = AI_DECKS.filter((d) => !excludeNames.includes(d.name));
  if (available.length === 0) {
    // Fallback: pick any deck if all are excluded
    return AI_DECKS[Math.floor(Math.random() * AI_DECKS.length)];
  }
  return available[Math.floor(Math.random() * available.length)];
}

/**
 * Convert an AIDeck into the format expected by the Forge server.
 */
export function aiDeckToForgeFormat(deck: AIDeck): { deckList: string[]; commander: string } {
  return {
    deckList: [...deck.cards],
    commander: deck.commander,
  };
}
