export const RPG_REGIONS = [
  {
    id: 'greenfields',
    icon: '🌿',
    name: 'Greenfields',
    minLevel: 1,
    maxLevel: 5
  },

  {
    id: 'stone_valley',
    icon: '⛰️',
    name: 'Stone Valley',
    minLevel: 6,
    maxLevel: 10
  },

  {
    id: 'shadow_ruins',
    icon: '🌑',
    name: 'Shadow Ruins',
    minLevel: 11,
    maxLevel: 20
  },

  {
    id: 'ashlands',
    icon: '🔥',
    name: 'Ashlands',
    minLevel: 21,
    maxLevel: 30
  },

  {
    id: 'frost_realm',
    icon: '❄️',
    name: 'Frost Realm',
    minLevel: 31,
    maxLevel: 40
  },

  {
    id: 'dragon_territory',
    icon: '🐉',
    name: 'Dragon Territory',
    minLevel: 41,
    maxLevel: 999
  }
]

export const RPG_MONSTERS = [
  // =====================================
  // 🌿 GREENFIELDS • Lv.1-5
  // =====================================

  {
    id: 'slime',
    name: 'Slime',
    icon: '🟢',
    region: 'greenfields',
    type: 'Normal',
    minLevel: 1,
    maxLevel: 5,
    weight: 35,
    hp: 34,
    attack: 7,
    defense: 2,
    money: [70, 120],
    exp: [20, 32],
    loot: 'slime_gel',
    lootChance: 55
  },

  {
    id: 'wild_wolf',
    name: 'Wild Wolf',
    icon: '🐺',
    region: 'greenfields',
    type: 'Swift',
    minLevel: 1,
    maxLevel: 5,
    weight: 30,
    hp: 44,
    attack: 10,
    defense: 3,
    money: [85, 145],
    exp: [25, 38],
    loot: 'wolf_fang',
    lootChance: 45
  },

  {
    id: 'goblin',
    name: 'Goblin',
    icon: '👺',
    region: 'greenfields',
    type: 'Normal',
    minLevel: 2,
    maxLevel: 5,
    weight: 25,
    hp: 55,
    attack: 12,
    defense: 5,
    money: [110, 175],
    exp: [30, 46],
    loot: 'goblin_scrap',
    lootChance: 42
  },

  {
    id: 'skeleton',
    name: 'Skeleton',
    icon: '💀',
    region: 'greenfields',
    type: 'Tank',
    minLevel: 3,
    maxLevel: 5,
    weight: 10,
    hp: 68,
    attack: 14,
    defense: 7,
    money: [135, 210],
    exp: [38, 55],
    loot: 'bone_fragment',
    lootChance: 40
  },

  // =====================================
  // ⛰️ STONE VALLEY • Lv.6-10
  // =====================================

  {
    id: 'cave_scorpion',
    name: 'Cave Scorpion',
    icon: '🦂',
    region: 'stone_valley',
    type: 'Tank',
    minLevel: 6,
    maxLevel: 10,
    weight: 30,
    hp: 72,
    attack: 15,
    defense: 9,
    money: [150, 240],
    exp: [42, 60],
    loot: 'cave_chitin',
    lootChance: 48
  },

  {
    id: 'venom_serpent',
    name: 'Venom Serpent',
    icon: '🐍',
    region: 'stone_valley',
    type: 'Swift',
    minLevel: 6,
    maxLevel: 10,
    weight: 28,
    hp: 64,
    attack: 18,
    defense: 6,
    money: [165, 255],
    exp: [45, 65],
    loot: 'venom_sac',
    lootChance: 45
  },

  {
    id: 'stone_golem',
    name: 'Stone Golem',
    icon: '🪨',
    region: 'stone_valley',
    type: 'Tank',
    minLevel: 7,
    maxLevel: 10,
    weight: 22,
    hp: 95,
    attack: 16,
    defense: 14,
    money: [190, 300],
    exp: [50, 72],
    loot: 'stone_core',
    lootChance: 42
  },

  {
    id: 'undead_guard',
    name: 'Undead Guard',
    icon: '🧟',
    region: 'stone_valley',
    type: 'Berserker',
    minLevel: 8,
    maxLevel: 10,
    weight: 20,
    hp: 84,
    attack: 20,
    defense: 10,
    money: [210, 330],
    exp: [55, 80],
    loot: 'undead_cloth',
    lootChance: 40
  },

  // =====================================
  // 🌑 SHADOW RUINS • Lv.11-20
  // =====================================

  {
    id: 'dark_mage',
    name: 'Dark Mage',
    icon: '🧙',
    region: 'shadow_ruins',
    type: 'Caster',
    minLevel: 11,
    maxLevel: 20,
    weight: 28,
    hp: 90,
    attack: 25,
    defense: 8,
    money: [280, 420],
    exp: [70, 100],
    loot: 'dark_essence',
    lootChance: 42
  },

  {
    id: 'bone_knight',
    name: 'Bone Knight',
    icon: '💀',
    region: 'shadow_ruins',
    type: 'Tank',
    minLevel: 11,
    maxLevel: 20,
    weight: 30,
    hp: 118,
    attack: 24,
    defense: 16,
    money: [320, 470],
    exp: [78, 112],
    loot: 'bone_fragment',
    lootChance: 45
  },

  {
    id: 'shadow_stalker',
    name: 'Shadow Stalker',
    icon: '🥷',
    region: 'shadow_ruins',
    type: 'Swift',
    minLevel: 13,
    maxLevel: 20,
    weight: 25,
    hp: 95,
    attack: 30,
    defense: 9,
    money: [340, 500],
    exp: [82, 118],
    loot: 'shadow_shard',
    lootChance: 38
  },

  {
    id: 'young_drake',
    name: 'Young Drake',
    icon: '🐲',
    region: 'shadow_ruins',
    type: 'Elite',
    minLevel: 16,
    maxLevel: 20,
    weight: 10,
    hp: 145,
    attack: 31,
    defense: 15,
    money: [420, 650],
    exp: [100, 145],
    loot: 'drake_scale',
    lootChance: 35
  },

  // =====================================
  // 🔥 ASHLANDS • Lv.21-30
  // =====================================

  {
    id: 'flame_hound',
    name: 'Flame Hound',
    icon: '🐕',
    region: 'ashlands',
    type: 'Swift',
    minLevel: 21,
    maxLevel: 30,
    weight: 30,
    hp: 125,
    attack: 34,
    defense: 12,
    money: [500, 760],
    exp: [120, 170],
    loot: 'ember_core',
    lootChance: 45
  },

  {
    id: 'ash_orc',
    name: 'Ash Orc',
    icon: '👹',
    region: 'ashlands',
    type: 'Berserker',
    minLevel: 21,
    maxLevel: 30,
    weight: 28,
    hp: 160,
    attack: 36,
    defense: 20,
    money: [560, 840],
    exp: [130, 185],
    loot: 'ash_ore',
    lootChance: 43
  },

  {
    id: 'lava_scorpion',
    name: 'Lava Scorpion',
    icon: '🦂',
    region: 'ashlands',
    type: 'Tank',
    minLevel: 24,
    maxLevel: 30,
    weight: 25,
    hp: 180,
    attack: 35,
    defense: 24,
    money: [620, 920],
    exp: [145, 205],
    loot: 'lava_shell',
    lootChance: 40
  },

  {
    id: 'fire_drake',
    name: 'Fire Drake',
    icon: '🐲',
    region: 'ashlands',
    type: 'Elite',
    minLevel: 27,
    maxLevel: 30,
    weight: 10,
    hp: 220,
    attack: 42,
    defense: 22,
    money: [800, 1200],
    exp: [180, 250],
    loot: 'drake_scale',
    lootChance: 38
  },

  // =====================================
  // ❄️ FROST REALM • Lv.31-40
  // =====================================

  {
    id: 'frost_wolf',
    name: 'Frost Wolf',
    icon: '🐺',
    region: 'frost_realm',
    type: 'Swift',
    minLevel: 31,
    maxLevel: 40,
    weight: 30,
    hp: 170,
    attack: 44,
    defense: 18,
    money: [850, 1250],
    exp: [190, 260],
    loot: 'frost_fang',
    lootChance: 45
  },

  {
    id: 'ice_golem',
    name: 'Ice Golem',
    icon: '🧊',
    region: 'frost_realm',
    type: 'Tank',
    minLevel: 31,
    maxLevel: 40,
    weight: 28,
    hp: 240,
    attack: 40,
    defense: 32,
    money: [950, 1400],
    exp: [210, 290],
    loot: 'ice_core',
    lootChance: 40
  },

  {
    id: 'frost_mage',
    name: 'Frost Mage',
    icon: '🧙',
    region: 'frost_realm',
    type: 'Caster',
    minLevel: 34,
    maxLevel: 40,
    weight: 25,
    hp: 185,
    attack: 50,
    defense: 16,
    money: [1000, 1500],
    exp: [225, 310],
    loot: 'frost_crystal',
    lootChance: 42
  },

  {
    id: 'glacier_bear',
    name: 'Glacier Bear',
    icon: '🐻',
    region: 'frost_realm',
    type: 'Elite',
    minLevel: 37,
    maxLevel: 40,
    weight: 12,
    hp: 270,
    attack: 52,
    defense: 28,
    money: [1200, 1750],
    exp: [250, 350],
    loot: 'frozen_pelt',
    lootChance: 35
  },

  // =====================================
  // 🐉 DRAGON TERRITORY • Lv.41+
  // =====================================

  {
    id: 'dragon_knight',
    name: 'Dragon Knight',
    icon: '⚔️',
    region: 'dragon_territory',
    type: 'Elite',
    minLevel: 41,
    maxLevel: 999,
    weight: 30,
    hp: 240,
    attack: 56,
    defense: 34,
    money: [1500, 2200],
    exp: [320, 430],
    loot: 'dragon_scale',
    lootChance: 30
  },

  {
    id: 'void_beast',
    name: 'Void Beast',
    icon: '🌌',
    region: 'dragon_territory',
    type: 'Swift',
    minLevel: 41,
    maxLevel: 999,
    weight: 30,
    hp: 225,
    attack: 62,
    defense: 24,
    money: [1600, 2350],
    exp: [340, 460],
    loot: 'void_fragment',
    lootChance: 35
  },

  {
    id: 'abyss_guardian',
    name: 'Abyss Guardian',
    icon: '👁️',
    region: 'dragon_territory',
    type: 'Tank',
    minLevel: 44,
    maxLevel: 999,
    weight: 25,
    hp: 300,
    attack: 58,
    defense: 42,
    money: [1800, 2600],
    exp: [370, 500],
    loot: 'dark_essence',
    lootChance: 35
  },

  {
    id: 'ancient_dragon',
    name: 'Ancient Dragon',
    icon: '🐉',
    region: 'dragon_territory',
    type: 'Boss',
    minLevel: 50,
    maxLevel: 999,
    weight: 5,
    hp: 420,
    attack: 70,
    defense: 38,
    money: [2600, 4000],
    exp: [500, 700],
    loot: 'dragon_scale',
    lootChance: 55
  }
]

export function getRpgRegion(
  level
) {
  const lv =
    Math.max(
      1,
      Number(level) || 1
    )

  return (
    RPG_REGIONS.find(
      region =>
        lv >=
          region.minLevel &&
        lv <=
          region.maxLevel
    ) ||
    RPG_REGIONS[
      RPG_REGIONS.length - 1
    ]
  )
}

export function getRpgMonsterPool(
  level
) {
  const lv =
    Math.max(
      1,
      Number(level) || 1
    )

  const region =
    getRpgRegion(
      lv
    )

  const pool =
    RPG_MONSTERS.filter(
      monster =>
        monster.region ===
          region.id &&
        lv >=
          monster.minLevel &&
        lv <=
          monster.maxLevel
    )

  if (pool.length) {
    return pool
  }

  return RPG_MONSTERS.filter(
    monster =>
      lv >=
      monster.minLevel
  )
}

export function pickRpgMonster(
  level
) {
  const pool =
    getRpgMonsterPool(
      level
    )

  if (!pool.length) {
    return (
      RPG_MONSTERS[0] ||
      null
    )
  }

  const total =
    pool.reduce(
      (
        sum,
        monster
      ) =>
        sum +
        Math.max(
          1,
          Number(
            monster.weight
          ) || 1
        ),
      0
    )

  let roll =
    Math.random() *
    total

  for (
    const monster
    of pool
  ) {
    roll -=
      Math.max(
        1,
        Number(
          monster.weight
        ) || 1
      )

    if (roll <= 0) {
      return monster
    }
  }

  return pool[
    pool.length - 1
  ]
}

export function getRpgMonsterById(
  monsterId
) {
  return (
    RPG_MONSTERS.find(
      monster =>
        monster.id ===
        monsterId
    ) ||
    null
  )
}
