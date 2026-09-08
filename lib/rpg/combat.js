import {
  randomInt
} from 'node:crypto'

import {
  DatabaseSync
} from 'node:sqlite'

import {
  resolvePlayerId
} from '../playerdb.js'

import {
  RPG_CLASSES,
  getRpgRequiredExp
} from './core.js'

import {
  initRpgSchema
} from './schema.js'

import {
  getRpgItem
} from './items.js'

import {
  gearStatBonus
} from './store.js'

import {
  pickRpgMonster,
  getRpgMonsterById
} from './monsters.js'

const db =
  new DatabaseSync(
    './database/nexa.sqlite',
    {
      timeout: 5000
    }
  )

initRpgSchema(
  db
)

function transaction(
  fn
) {
  db.exec(
    'BEGIN IMMEDIATE'
  )

  try {
    const result =
      fn()

    db.exec(
      'COMMIT'
    )

    return result
  } catch (
    err
  ) {
    try {
      db.exec(
        'ROLLBACK'
      )
    } catch {}

    throw err
  }
}

function playerIdFromJid(
  jid
) {
  return resolvePlayerId(
    jid,
    false
  )
}

function profileRow(
  playerId
) {
  return db.prepare(`
    SELECT *
    FROM rpg_profiles
    WHERE player_id = ?
  `).get(
    playerId
  )
}

function battleRow(
  playerId
) {
  return db.prepare(`
    SELECT *
    FROM rpg_battles
    WHERE player_id = ?
  `).get(
    playerId
  )
}

function randomBetween(
  min,
  max
) {
  return randomInt(
    min,
    max + 1
  )
}

function equipmentBonus(
  playerId
) {
  const equipment =
    db.prepare(`
      SELECT *
      FROM rpg_equipment
      WHERE player_id = ?
    `).get(
      playerId
    )

  if (!equipment) {
    return {
      attack: 0,
      defense: 0
    }
  }

  let attack = 0
  let defense = 0

  const ids = [
    equipment.weapon_gear_id,
    equipment.armor_gear_id,
    equipment.accessory_gear_id
  ].filter(Boolean)

  for (
    const gearId
    of ids
  ) {
    const gear =
      db.prepare(`
        SELECT *
        FROM rpg_gear
        WHERE gear_id = ?
          AND player_id = ?
      `).get(
        gearId,
        playerId
      )

    if (!gear) {
      continue
    }

    const item =
      getRpgItem(
        gear.item_id
      )

    if (!item) {
      continue
    }

    const bonus =
      gearStatBonus(
        item,
        gear.enchant_level
      )

    attack +=
      bonus.attack

    defense +=
      bonus.defense
  }

  return {
    attack,
    defense
  }
}

function monsterTypeFromBattle(
  battle
) {
  return (
    getRpgMonsterById(
      battle?.monster_id
    )?.type ||
    'Normal'
  )
}

function damage({
  attack,
  defense,
  multiplier = 1,
  ignoreDefense = 0,
  targetType = null
}) {
  const effectiveDefense =
    defense *
    (
      1 -
      ignoreDefense
    )

  const raw =
    (
      attack *
      multiplier
    ) -
    (
      effectiveDefense *
      0.45
    )

  const variation =
    randomBetween(
      90,
      110
    ) /
    100

  let resistance = 1

  if (targetType === 'Tank') {
    resistance = 0.85
  }

  if (targetType === 'Elite') {
    resistance = 0.90
  }

  if (targetType === 'Boss') {
    resistance = 0.82
  }

  return Math.max(
    1,
    Math.round(
      raw *
      variation *
      resistance
    )
  )
}

function addInventory(
  playerId,
  itemId,
  amount
) {
  const now =
    Date.now()

  db.prepare(`
    INSERT INTO rpg_inventory (
      player_id,
      item_id,
      quantity,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?)

    ON CONFLICT(
      player_id,
      item_id
    )
    DO UPDATE SET
      quantity =
        rpg_inventory.quantity +
        excluded.quantity,

      updated_at =
        excluded.updated_at
  `).run(
    playerId,
    itemId,
    amount,
    now,
    now
  )
}

function moneyLog({
  playerId,
  delta,
  walletAfter,
  bankAfter,
  reason,
  note = null,
  now
}) {
  db.prepare(`
    INSERT INTO rpg_transactions (
      player_id,
      wallet_delta,
      bank_delta,
      wallet_after,
      bank_after,
      reason,
      note,
      created_at
    )
    VALUES (?, ?, 0, ?, ?, ?, ?, ?)
  `).run(
    playerId,
    delta,
    walletAfter,
    bankAfter,
    reason,
    note,
    now
  )
}

function addExpAndLevel(
  row,
  amount
) {
  let level =
    Number(row.level) || 1

  let exp =
    (Number(row.exp) || 0) +
    amount

  let hp =
    Number(row.hp) || 0

  let maxHp =
    Number(row.max_hp) || 100

  let mana =
    Number(row.mana) || 0

  let maxMana =
    Number(row.max_mana) || 50

  let attack =
    Number(row.attack) || 10

  let defense =
    Number(row.defense) || 8

  const oldLevel =
    level

  const classInfo =
    RPG_CLASSES[
      row.class
    ]

  while (
    exp >=
    getRpgRequiredExp(
      level
    )
  ) {
    exp -=
      getRpgRequiredExp(
        level
      )

    level += 1

    if (classInfo) {
      maxHp +=
        classInfo.hpGrowth

      maxMana +=
        classInfo.manaGrowth

      attack +=
        classInfo.attackGrowth

      defense +=
        classInfo.defenseGrowth

      hp =
        Math.min(
          maxHp,
          hp +
          classInfo.hpGrowth
        )

      mana =
        Math.min(
          maxMana,
          mana +
          classInfo.manaGrowth
        )
    }
  }

  return {
    oldLevel,
    level,
    exp,
    hp,
    maxHp,
    mana,
    maxMana,
    attack,
    defense,
    levelsGained:
      level - oldLevel
  }
}

function defeatPlayer({
  row,
  playerId,
  isOwner
}) {
  const wallet =
    Number(row.money) || 0

  const penalty =
    isOwner
      ? 0
      : Math.min(
          500,
          Math.floor(
            wallet *
            0.05
          )
        )

  const nextWallet =
    Math.max(
      0,
      wallet -
      penalty
    )

  const now =
    Date.now()

  db.prepare(`
    UPDATE rpg_profiles
    SET
      hp = 0,
      money = ?,
      updated_at = ?

    WHERE player_id = ?
  `).run(
    nextWallet,
    now,
    playerId
  )

  if (penalty > 0) {
    moneyLog({
      playerId,

      delta:
        -penalty,

      walletAfter:
        nextWallet,

      bankAfter:
        Number(
          row.bank_money
        ) || 0,

      reason:
        'battle_defeat',

      note:
        'Death penalty',

      now
    })
  }

  db.prepare(`
    DELETE FROM rpg_battles
    WHERE player_id = ?
  `).run(
    playerId
  )

  return {
    defeated: true,
    penalty,
    money:
      nextWallet
  }
}

function monsterTurn({
  row,
  battle,
  playerId,
  isOwner
}) {
  const bonus =
    equipmentBonus(
      playerId
    )

  const type =
    monsterTypeFromBattle(
      battle
    )

  const playerDefense =
    (
      Number(row.defense) ||
      0
    ) +
    bonus.defense

  let multiplier = 1
  let ignoreDefense = 0
  let secondMultiplier = 0

  let monsterAction =
    null

  if (type === 'Tank') {
    multiplier = 0.90
    monsterAction =
      '🛡️ Tank stance aktif.'
  }

  if (type === 'Swift') {
    multiplier = 0.85

    if (
      randomInt(
        1,
        101
      ) <= 35
    ) {
      secondMultiplier = 0.55

      monsterAction =
        '💨 Swift Strike! Serangan ganda.'
    } else {
      monsterAction =
        '💨 Monster bergerak sangat cepat.'
    }
  }

  if (type === 'Berserker') {
    const ratio =
      Number(
        battle.monster_hp
      ) /
      Math.max(
        1,
        Number(
          battle.monster_max_hp
        ) || 1
      )

    multiplier =
      ratio <= 0.5
        ? 1.35
        : 1.05

    monsterAction =
      ratio <= 0.5
        ? '💥 BERSERK! Monster mengamuk.'
        : '💥 Monster bertarung agresif.'
  }

  if (type === 'Caster') {
    if (
      randomInt(
        1,
        101
      ) <= 30
    ) {
      multiplier = 1.15
      ignoreDefense = 0.40

      monsterAction =
        '🔮 Spell menembus sebagian DEF!'
    } else {
      monsterAction =
        '🔮 Monster melancarkan serangan sihir.'
    }
  }

  if (type === 'Elite') {
    multiplier = 1.15
    monsterAction =
      '✨ Elite pressure!'
  }

  if (type === 'Boss') {
    multiplier = 1.25
    ignoreDefense = 0.15

    monsterAction =
      '👑 Boss Attack!'
  }

  const firstDamage =
    damage({
      attack:
        battle.monster_attack,

      defense:
        playerDefense,

      multiplier,
      ignoreDefense
    })

  let secondDamage = 0

  if (
    secondMultiplier > 0
  ) {
    secondDamage =
      damage({
        attack:
          battle.monster_attack,

        defense:
          playerDefense,

        multiplier:
          secondMultiplier
      })
  }

  const monsterDamage =
    firstDamage +
    secondDamage

  const nextHp =
    Math.max(
      0,
      (
        Number(row.hp) ||
        0
      ) -
      monsterDamage
    )

  db.prepare(`
    UPDATE rpg_profiles
    SET
      hp = ?,
      updated_at = ?

    WHERE player_id = ?
  `).run(
    nextHp,
    Date.now(),
    playerId
  )

  if (
    nextHp <= 0
  ) {
    return {
      monsterDamage,
      monsterAction,
      nextHp,
      ...defeatPlayer({
        row: {
          ...row,
          hp:
            nextHp
        },

        playerId,
        isOwner
      })
    }
  }

  return {
    monsterDamage,
    monsterAction,
    nextHp,
    defeated:
      false
  }
}

// =====================================
// START
// =====================================

export function startAdventure(
  jid
) {
  const playerId =
    playerIdFromJid(
      jid
    )

  if (!playerId) {
    return {
      success: false,
      reason: 'NO_PLAYER'
    }
  }

  return transaction(
    () => {
      const profile =
        profileRow(
          playerId
        )

      if (!profile) {
        return {
          success: false,
          reason: 'NO_RPG'
        }
      }

      if (!profile.class) {
        return {
          success: false,
          reason: 'NO_CLASS'
        }
      }

      if (
        Number(profile.hp) <= 0
      ) {
        return {
          success: false,
          reason: 'NO_HP'
        }
      }

      const active =
        battleRow(
          playerId
        )

      if (active) {
        return {
          success: false,
          reason: 'ACTIVE_BATTLE',
          battle: active
        }
      }

      const level =
        Number(
          profile.level
        ) || 1

      const monster =
        pickRpgMonster(
          level
        )

      if (!monster) {
        return {
          success: false,
          reason: 'NO_MONSTER'
        }
      }

      const scale =
        1 +
        Math.max(
          0,
          level - 1
        ) *
        0.1

      const monsterLevel =
        Math.max(
          1,
          level +
          randomInt(
            -1,
            2
          )
        )

      const maxHp =
        Math.max(
          10,
          Math.round(
            monster.hp *
            scale
          )
        )

      const atk =
        Math.max(
          1,
          Math.round(
            monster.attack *
            scale
          )
        )

      const def =
        Math.max(
          0,
          Math.round(
            monster.defense *
            scale
          )
        )

      const rewardMoney =
        Math.round(
          randomBetween(
            monster.money[0],
            monster.money[1]
          ) *
          (
            1 +
            (
              level - 1
            ) *
            0.06
          )
        )

      const rewardExp =
        Math.round(
          randomBetween(
            monster.exp[0],
            monster.exp[1]
          ) *
          (
            1 +
            (
              level - 1
            ) *
            0.04
          )
        )

      const now =
        Date.now()

      db.prepare(`
        INSERT INTO rpg_battles (
          player_id,
          monster_id,
          monster_name,
          monster_icon,
          monster_level,
          monster_hp,
          monster_max_hp,
          monster_attack,
          monster_defense,
          reward_money,
          reward_exp,
          loot_item,
          loot_chance,
          started_at,
          updated_at
        )
        VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?
        )
      `).run(
        playerId,

        monster.id,
        monster.name,
        monster.icon,

        monsterLevel,

        maxHp,
        maxHp,

        atk,
        def,

        rewardMoney,
        rewardExp,

        monster.loot ||
          null,

        monster.lootChance ||
          0,

        now,
        now
      )

      return {
        success: true,

        profile,

        battle:
          battleRow(
            playerId
          )
      }
    }
  )
}

// =====================================
// VIEW
// =====================================

export function getBattle(
  jid
) {
  const playerId =
    playerIdFromJid(
      jid
    )

  if (!playerId) {
    return null
  }

  return {
    profile:
      profileRow(
        playerId
      ),

    battle:
      battleRow(
        playerId
      )
  }
}

// =====================================
// ATTACK
// =====================================

export function attackBattle(
  jid,
  {
    isOwner = false
  } = {}
) {
  const playerId =
    playerIdFromJid(
      jid
    )

  if (!playerId) {
    return {
      success: false,
      reason: 'NO_PLAYER'
    }
  }

  return transaction(
    () => {
      const row =
        profileRow(
          playerId
        )

      const battle =
        battleRow(
          playerId
        )

      if (!battle) {
        return {
          success: false,
          reason: 'NO_BATTLE'
        }
      }

      const bonus =
        equipmentBonus(
          playerId
        )

      const crit =
        randomInt(
          1,
          101
        ) <= 10

      let dealt =
        damage({
          attack:
            (
              Number(row.attack) ||
              0
            ) +
            bonus.attack,

          defense:
            battle.monster_defense,

          targetType:
            monsterTypeFromBattle(
              battle
            ),})

      if (crit) {
        dealt =
          Math.round(
            dealt *
            1.7
          )
      }

      const monsterHp =
        Math.max(
          0,
          battle.monster_hp -
          dealt
        )

      db.prepare(`
        UPDATE rpg_battles
        SET
          monster_hp = ?,
          updated_at = ?

        WHERE player_id = ?
      `).run(
        monsterHp,
        Date.now(),
        playerId
      )

      if (
        monsterHp <= 0
      ) {
        return winBattle({
          row,
          battle,
          playerId,
          dealt,
          crit
        })
      }

      const turn =
        monsterTurn({
          row,
          battle: {
            ...battle,
            monster_hp:
              monsterHp
          },

          playerId,
          isOwner
        })

      return {
        success: true,
        action: 'attack',
        dealt,
        crit,
        monsterHp,
        battle,
        ...turn
      }
    }
  )
}

// =====================================
// SKILL
// =====================================

export function skillBattle(
  jid,
  {
    isOwner = false
  } = {}
) {
  const playerId =
    playerIdFromJid(
      jid
    )

  if (!playerId) {
    return {
      success: false,
      reason: 'NO_PLAYER'
    }
  }

  return transaction(
    () => {
      const row =
        profileRow(
          playerId
        )

      const battle =
        battleRow(
          playerId
        )

      if (!battle) {
        return {
          success: false,
          reason: 'NO_BATTLE'
        }
      }

      const skills = {
        warrior: {
          name: 'Power Slash',
          icon: '⚔️',
          mana: 10,
          multiplier: 1.65,
          ignoreDefense: 0
        },

        ranger: {
          name: 'Piercing Shot',
          icon: '🏹',
          mana: 12,
          multiplier: 1.45,
          ignoreDefense: 0.35
        },

        mage: {
          name: 'Arcane Burst',
          icon: '🔮',
          mana: 18,
          multiplier: 1.8,
          ignoreDefense: 0.5
        }
      }

      const skill =
        skills[
          row.class
        ]

      if (!skill) {
        return {
          success: false,
          reason: 'NO_CLASS'
        }
      }

      if (
        Number(row.mana) <
        skill.mana
      ) {
        return {
          success: false,
          reason: 'NO_MANA',
          needed:
            skill.mana,
          current:
            Number(row.mana) || 0
        }
      }

      const bonus =
        equipmentBonus(
          playerId
        )

      const dealt =
        damage({
          attack:
            (
              Number(row.attack) ||
              0
            ) +
            bonus.attack,

          defense:
            battle.monster_defense,

          targetType:
            monsterTypeFromBattle(
              battle
            ),

          multiplier:
            skill.multiplier,

          ignoreDefense:
            skill.ignoreDefense
        })

      const nextMana =
        Number(row.mana) -
        skill.mana

      const monsterHp =
        Math.max(
          0,
          battle.monster_hp -
          dealt
        )

      const now =
        Date.now()

      db.prepare(`
        UPDATE rpg_profiles
        SET
          mana = ?,
          updated_at = ?

        WHERE player_id = ?
      `).run(
        nextMana,
        now,
        playerId
      )

      db.prepare(`
        UPDATE rpg_battles
        SET
          monster_hp = ?,
          updated_at = ?

        WHERE player_id = ?
      `).run(
        monsterHp,
        now,
        playerId
      )

      if (
        monsterHp <= 0
      ) {
        return winBattle({
          row: {
            ...row,
            mana:
              nextMana
          },

          battle,
          playerId,
          dealt,
          crit: false,
          skill
        })
      }

      const turn =
        monsterTurn({
          row: {
            ...row,
            mana:
              nextMana
          },

          battle: {
            ...battle,
            monster_hp:
              monsterHp
          },

          playerId,
          isOwner
        })

      return {
        success: true,
        action: 'skill',
        skill,
        dealt,
        nextMana,
        monsterHp,
        battle,
        ...turn
      }
    }
  )
}

// =====================================
// POTION
// =====================================

export function usePotion(
  jid,
  {
    isOwner = false
  } = {}
) {
  const playerId =
    playerIdFromJid(
      jid
    )

  if (!playerId) {
    return {
      success: false,
      reason: 'NO_PLAYER'
    }
  }

  return transaction(
    () => {
      const row =
        profileRow(
          playerId
        )

      if (!row) {
        return {
          success: false,
          reason: 'NO_RPG'
        }
      }

      if (
        Number(row.hp) >=
        Number(row.max_hp)
      ) {
        return {
          success: false,
          reason: 'FULL_HP'
        }
      }

      const inv =
        db.prepare(`
          SELECT quantity
          FROM rpg_inventory
          WHERE player_id = ?
            AND item_id = 'small_potion'
        `).get(
          playerId
        )

      if (
        !inv ||
        Number(inv.quantity) <= 0
      ) {
        return {
          success: false,
          reason: 'NO_POTION'
        }
      }

      const potion =
        getRpgItem(
          'small_potion'
        )

      const healed =
        Math.min(
          Number(potion.heal) || 40,

          Number(row.max_hp) -
          Number(row.hp)
        )

      const nextHp =
        Number(row.hp) +
        healed

      const now =
        Date.now()

      db.prepare(`
        UPDATE rpg_profiles
        SET
          hp = ?,
          updated_at = ?

        WHERE player_id = ?
      `).run(
        nextHp,
        now,
        playerId
      )

      db.prepare(`
        UPDATE rpg_inventory
        SET
          quantity = quantity - 1,
          updated_at = ?

        WHERE player_id = ?
          AND item_id = 'small_potion'
      `).run(
        now,
        playerId
      )

      const battle =
        battleRow(
          playerId
        )

      if (!battle) {
        return {
          success: true,
          healed,
          nextHp,
          maxHp:
            Number(row.max_hp),
          inBattle:
            false
        }
      }

      const turn =
        monsterTurn({
          row: {
            ...row,
            hp:
              nextHp
          },

          battle,
          playerId,
          isOwner
        })

      return {
        success: true,
        healed,
        nextHp,
        maxHp:
          Number(row.max_hp),
        inBattle:
          true,
        battle,
        ...turn
      }
    }
  )
}

// =====================================
// RUN
// =====================================

export function runFromBattle(
  jid,
  {
    isOwner = false
  } = {}
) {
  const playerId =
    playerIdFromJid(
      jid
    )

  if (!playerId) {
    return {
      success: false,
      reason: 'NO_PLAYER'
    }
  }

  return transaction(
    () => {
      const row =
        profileRow(
          playerId
        )

      const battle =
        battleRow(
          playerId
        )

      if (!battle) {
        return {
          success: false,
          reason: 'NO_BATTLE'
        }
      }

      const escaped =
        randomInt(
          1,
          101
        ) <= 65

      if (escaped) {
        db.prepare(`
          DELETE FROM rpg_battles
          WHERE player_id = ?
        `).run(
          playerId
        )

        return {
          success: true,
          escaped: true,
          battle
        }
      }

      const turn =
        monsterTurn({
          row,
          battle,
          playerId,
          isOwner
        })

      return {
        success: true,
        escaped: false,
        battle,
        ...turn
      }
    }
  )
}

// =====================================
// WIN
// =====================================

function winBattle({
  row,
  battle,
  playerId,
  dealt,
  crit,
  skill = null
}) {
  const expResult =
    addExpAndLevel(
      row,
      battle.reward_exp
    )

  const oldMoney =
    Number(row.money) || 0

  const nextMoney =
    oldMoney +
    battle.reward_money

  const now =
    Date.now()

  db.prepare(`
    UPDATE rpg_profiles
    SET
      level = ?,
      exp = ?,
      hp = ?,
      max_hp = ?,
      mana = ?,
      max_mana = ?,
      attack = ?,
      defense = ?,
      money = ?,
      updated_at = ?

    WHERE player_id = ?
  `).run(
    expResult.level,
    expResult.exp,

    expResult.hp,
    expResult.maxHp,

    expResult.mana,
    expResult.maxMana,

    expResult.attack,
    expResult.defense,

    nextMoney,
    now,
    playerId
  )

  moneyLog({
    playerId,

    delta:
      battle.reward_money,

    walletAfter:
      nextMoney,

    bankAfter:
      Number(
        row.bank_money
      ) || 0,

    reason:
      'adventure_win',

    note:
      battle.monster_name,

    now
  })

  let loot =
    null

  if (
    battle.loot_item &&
    randomInt(
      1,
      101
    ) <=
    battle.loot_chance
  ) {
    addInventory(
      playerId,
      battle.loot_item,
      1
    )

    loot =
      getRpgItem(
        battle.loot_item
      )
  }

  db.prepare(`
    DELETE FROM rpg_battles
    WHERE player_id = ?
  `).run(
    playerId
  )

  return {
    success: true,
    won: true,

    dealt,
    crit,
    skill,

    battle,

    rewardMoney:
      battle.reward_money,

    rewardExp:
      battle.reward_exp,

    money:
      nextMoney,

    loot,

    ...expResult
  }
}
