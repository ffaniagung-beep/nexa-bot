export const RPG_ITEMS = {
  // =====================================
  // STARTER
  // =====================================

  training_sword: {
    id: 'training_sword',
    name: 'Training Sword',
    icon: '🗡️',
    rarity: 'Starter',
    type: 'gear',
    slot: 'weapon',
    class: 'warrior',
    minLevel: 1,
    attack: 3,
    defense: 0,
    buyPrice: null,
    sellPrice: null
  },

  training_bow: {
    id: 'training_bow',
    name: 'Training Bow',
    icon: '🏹',
    rarity: 'Starter',
    type: 'gear',
    slot: 'weapon',
    class: 'ranger',
    minLevel: 1,
    attack: 3,
    defense: 0,
    buyPrice: null,
    sellPrice: null
  },

  training_staff: {
    id: 'training_staff',
    name: 'Training Staff',
    icon: '🪄',
    rarity: 'Starter',
    type: 'gear',
    slot: 'weapon',
    class: 'mage',
    minLevel: 1,
    attack: 3,
    defense: 0,
    buyPrice: null,
    sellPrice: null
  },

  // =====================================
  // WARRIOR WEAPONS
  // =====================================

  iron_sword: {
    id: 'iron_sword',
    name: 'Iron Sword',
    icon: '⚔️',
    rarity: 'Common',
    type: 'gear',
    slot: 'weapon',
    class: 'warrior',
    minLevel: 1,
    attack: 8,
    defense: 0,
    buyPrice: 3000,
    sellPrice: 1500
  },

  steel_blade: {
    id: 'steel_blade',
    name: 'Steel Blade',
    icon: '🗡️',
    rarity: 'Uncommon',
    type: 'gear',
    slot: 'weapon',
    class: 'warrior',
    minLevel: 7,
    attack: 14,
    defense: 0,
    buyPrice: 8500,
    sellPrice: 4000
  },

  knight_saber: {
    id: 'knight_saber',
    name: 'Knight Saber',
    icon: '⚔️',
    rarity: 'Rare',
    type: 'gear',
    slot: 'weapon',
    class: 'warrior',
    minLevel: 15,
    attack: 22,
    defense: 2,
    buyPrice: 22000,
    sellPrice: 10000
  },

  dragonfang_blade: {
    id: 'dragonfang_blade',
    name: 'Dragonfang Blade',
    icon: '🐉',
    rarity: 'Epic',
    type: 'gear',
    slot: 'weapon',
    class: 'warrior',
    minLevel: 30,
    attack: 36,
    defense: 3,
    buyPrice: 65000,
    sellPrice: 28000
  },

  // =====================================
  // RANGER WEAPONS
  // =====================================

  hunter_bow: {
    id: 'hunter_bow',
    name: 'Hunter Bow',
    icon: '🏹',
    rarity: 'Common',
    type: 'gear',
    slot: 'weapon',
    class: 'ranger',
    minLevel: 1,
    attack: 8,
    defense: 0,
    buyPrice: 3000,
    sellPrice: 1500
  },

  longbow: {
    id: 'longbow',
    name: 'Ranger Longbow',
    icon: '🏹',
    rarity: 'Uncommon',
    type: 'gear',
    slot: 'weapon',
    class: 'ranger',
    minLevel: 7,
    attack: 14,
    defense: 0,
    buyPrice: 8500,
    sellPrice: 4000
  },

  storm_bow: {
    id: 'storm_bow',
    name: 'Storm Bow',
    icon: '🌩️',
    rarity: 'Rare',
    type: 'gear',
    slot: 'weapon',
    class: 'ranger',
    minLevel: 15,
    attack: 23,
    defense: 1,
    buyPrice: 22000,
    sellPrice: 10000
  },

  moonpiercer: {
    id: 'moonpiercer',
    name: 'Moonpiercer',
    icon: '🌙',
    rarity: 'Epic',
    type: 'gear',
    slot: 'weapon',
    class: 'ranger',
    minLevel: 30,
    attack: 37,
    defense: 2,
    buyPrice: 65000,
    sellPrice: 28000
  },

  // =====================================
  // MAGE WEAPONS
  // =====================================

  arcane_staff: {
    id: 'arcane_staff',
    name: 'Arcane Staff',
    icon: '🔮',
    rarity: 'Common',
    type: 'gear',
    slot: 'weapon',
    class: 'mage',
    minLevel: 1,
    attack: 8,
    defense: 0,
    buyPrice: 3000,
    sellPrice: 1500
  },

  mystic_staff: {
    id: 'mystic_staff',
    name: 'Mystic Staff',
    icon: '🪄',
    rarity: 'Uncommon',
    type: 'gear',
    slot: 'weapon',
    class: 'mage',
    minLevel: 7,
    attack: 15,
    defense: 0,
    buyPrice: 8500,
    sellPrice: 4000
  },

  arcane_scepter: {
    id: 'arcane_scepter',
    name: 'Arcane Scepter',
    icon: '💠',
    rarity: 'Rare',
    type: 'gear',
    slot: 'weapon',
    class: 'mage',
    minLevel: 15,
    attack: 24,
    defense: 0,
    buyPrice: 22000,
    sellPrice: 10000
  },

  void_staff: {
    id: 'void_staff',
    name: 'Void Staff',
    icon: '🌌',
    rarity: 'Epic',
    type: 'gear',
    slot: 'weapon',
    class: 'mage',
    minLevel: 30,
    attack: 39,
    defense: 0,
    buyPrice: 65000,
    sellPrice: 28000
  },

  // =====================================
  // UNIVERSAL ARMOR
  // =====================================

  iron_armor: {
    id: 'iron_armor',
    name: 'Iron Armor',
    icon: '🛡️',
    rarity: 'Common',
    type: 'gear',
    slot: 'armor',
    class: null,
    minLevel: 1,
    attack: 0,
    defense: 6,
    buyPrice: 2600,
    sellPrice: 1300
  },

  steel_armor: {
    id: 'steel_armor',
    name: 'Steel Armor',
    icon: '🛡️',
    rarity: 'Uncommon',
    type: 'gear',
    slot: 'armor',
    class: null,
    minLevel: 8,
    attack: 0,
    defense: 12,
    buyPrice: 9000,
    sellPrice: 4200
  },

  guardian_armor: {
    id: 'guardian_armor',
    name: 'Guardian Armor',
    icon: '🛡️',
    rarity: 'Rare',
    type: 'gear',
    slot: 'armor',
    class: null,
    minLevel: 18,
    attack: 0,
    defense: 20,
    buyPrice: 24000,
    sellPrice: 11000
  },

  dragon_armor: {
    id: 'dragon_armor',
    name: 'Dragon Armor',
    icon: '🐲',
    rarity: 'Epic',
    type: 'gear',
    slot: 'armor',
    class: null,
    minLevel: 32,
    attack: 2,
    defense: 32,
    buyPrice: 70000,
    sellPrice: 30000
  },

  // =====================================
  // ACCESSORY
  // =====================================

  adventurer_charm: {
    id: 'adventurer_charm',
    name: 'Adventurer Charm',
    icon: '💠',
    rarity: 'Common',
    type: 'gear',
    slot: 'accessory',
    class: null,
    minLevel: 1,
    attack: 2,
    defense: 2,
    buyPrice: 3500,
    sellPrice: 1750
  },

  guardian_ring: {
    id: 'guardian_ring',
    name: 'Guardian Ring',
    icon: '💍',
    rarity: 'Rare',
    type: 'gear',
    slot: 'accessory',
    class: null,
    minLevel: 14,
    attack: 4,
    defense: 6,
    buyPrice: 18000,
    sellPrice: 8000
  },

  // =====================================
  // CONSUMABLE
  // =====================================

  small_potion: {
    id: 'small_potion',
    name: 'Small Potion',
    icon: '🧪',
    rarity: 'Common',
    type: 'consumable',
    stackable: true,
    minLevel: 1,
    heal: 40,
    mana: 0,
    buyPrice: 250,
    sellPrice: 100
  },

  medium_potion: {
    id: 'medium_potion',
    name: 'Medium Potion',
    icon: '🧪',
    rarity: 'Uncommon',
    type: 'consumable',
    stackable: true,
    minLevel: 6,
    heal: 80,
    mana: 0,
    buyPrice: 700,
    sellPrice: 280
  },

  mana_potion: {
    id: 'mana_potion',
    name: 'Mana Potion',
    icon: '🔷',
    rarity: 'Uncommon',
    type: 'consumable',
    stackable: true,
    minLevel: 5,
    heal: 0,
    mana: 45,
    buyPrice: 600,
    sellPrice: 250
  },

  greater_potion: {
    id: 'greater_potion',
    name: 'Greater Potion',
    icon: '🧴',
    rarity: 'Rare',
    type: 'consumable',
    stackable: true,
    minLevel: 15,
    heal: 140,
    mana: 40,
    buyPrice: 1800,
    sellPrice: 700
  },

  // =====================================
  // MATERIAL EXISTING
  // =====================================

  slime_gel: {
    id: 'slime_gel',
    name: 'Slime Gel',
    icon: '🟢',
    rarity: 'Common',
    type: 'material',
    stackable: true,
    buyPrice: null,
    sellPrice: 40
  },

  wolf_fang: {
    id: 'wolf_fang',
    name: 'Wolf Fang',
    icon: '🦷',
    rarity: 'Common',
    type: 'material',
    stackable: true,
    buyPrice: null,
    sellPrice: 60
  },

  goblin_scrap: {
    id: 'goblin_scrap',
    name: 'Goblin Scrap',
    icon: '🔩',
    rarity: 'Uncommon',
    type: 'material',
    stackable: true,
    buyPrice: null,
    sellPrice: 85
  },

  bone_fragment: {
    id: 'bone_fragment',
    name: 'Bone Fragment',
    icon: '🦴',
    rarity: 'Uncommon',
    type: 'material',
    stackable: true,
    buyPrice: null,
    sellPrice: 110
  },

  // =====================================
  // MATERIAL EXPANSION
  // Monster loot dipasang next.
  // =====================================

  cave_chitin: {
    id: 'cave_chitin',
    name: 'Cave Chitin',
    icon: '🦂',
    rarity: 'Uncommon',
    type: 'material',
    stackable: true,
    buyPrice: null,
    sellPrice: 160
  },

  dark_essence: {
    id: 'dark_essence',
    name: 'Dark Essence',
    icon: '🌑',
    rarity: 'Rare',
    type: 'material',
    stackable: true,
    buyPrice: null,
    sellPrice: 280
  },

  drake_scale: {
    id: 'drake_scale',
    name: 'Drake Scale',
    icon: '🐲',
    rarity: 'Rare',
    type: 'material',
    stackable: true,
    buyPrice: null,
    sellPrice: 420
  },

  frost_crystal: {
    id: 'frost_crystal',
    name: 'Frost Crystal',
    icon: '❄️',
    rarity: 'Rare',
    type: 'material',
    stackable: true,
    buyPrice: null,
    sellPrice: 550
  },

  dragon_scale: {
    id: 'dragon_scale',
    name: 'Dragon Scale',
    icon: '🐉',
    rarity: 'Epic',
    type: 'material',
    stackable: true,
    buyPrice: null,
    sellPrice: 1000
  },

  venom_sac: {
    id: 'venom_sac',
    name: 'Venom Sac',
    icon: '☠️',
    rarity: 'Uncommon',
    type: 'material',
    stackable: true,
    buyPrice: null,
    sellPrice: 180
  },

  stone_core: {
    id: 'stone_core',
    name: 'Stone Core',
    icon: '🪨',
    rarity: 'Uncommon',
    type: 'material',
    stackable: true,
    buyPrice: null,
    sellPrice: 220
  },

  undead_cloth: {
    id: 'undead_cloth',
    name: 'Undead Cloth',
    icon: '🧟',
    rarity: 'Uncommon',
    type: 'material',
    stackable: true,
    buyPrice: null,
    sellPrice: 240
  },

  shadow_shard: {
    id: 'shadow_shard',
    name: 'Shadow Shard',
    icon: '🌑',
    rarity: 'Rare',
    type: 'material',
    stackable: true,
    buyPrice: null,
    sellPrice: 360
  },

  ember_core: {
    id: 'ember_core',
    name: 'Ember Core',
    icon: '🔥',
    rarity: 'Rare',
    type: 'material',
    stackable: true,
    buyPrice: null,
    sellPrice: 430
  },

  ash_ore: {
    id: 'ash_ore',
    name: 'Ash Ore',
    icon: '🌋',
    rarity: 'Rare',
    type: 'material',
    stackable: true,
    buyPrice: null,
    sellPrice: 470
  },

  lava_shell: {
    id: 'lava_shell',
    name: 'Lava Shell',
    icon: '🦂',
    rarity: 'Rare',
    type: 'material',
    stackable: true,
    buyPrice: null,
    sellPrice: 520
  },

  frost_fang: {
    id: 'frost_fang',
    name: 'Frost Fang',
    icon: '🧊',
    rarity: 'Rare',
    type: 'material',
    stackable: true,
    buyPrice: null,
    sellPrice: 600
  },

  ice_core: {
    id: 'ice_core',
    name: 'Ice Core',
    icon: '❄️',
    rarity: 'Rare',
    type: 'material',
    stackable: true,
    buyPrice: null,
    sellPrice: 650
  },

  frozen_pelt: {
    id: 'frozen_pelt',
    name: 'Frozen Pelt',
    icon: '🐻',
    rarity: 'Rare',
    type: 'material',
    stackable: true,
    buyPrice: null,
    sellPrice: 720
  },

  void_fragment: {
    id: 'void_fragment',
    name: 'Void Fragment',
    icon: '🌌',
    rarity: 'Epic',
    type: 'material',
    stackable: true,
    buyPrice: null,
    sellPrice: 1200
  },

}

export function getRpgItem(
  itemId
) {
  return (
    RPG_ITEMS[
      String(itemId || '')
    ] ||
    null
  )
}
