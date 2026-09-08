import {
  randomUUID
} from 'node:crypto'

import {
  DatabaseSync
} from 'node:sqlite'

import {
  resolvePlayerId
} from '../playerdb.js'

import {
  initRpgSchema
} from './schema.js'

import {
  RPG_ITEMS,
  getRpgItem
} from './items.js'

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

// =====================================
// CLASS
// =====================================

export const RPG_CLASSES = {
  warrior: {
    id: 'warrior',
    icon: '⚔️',
    name: 'Warrior',

    hp: 140,
    mana: 35,
    attack: 15,
    defense: 14,

    hpGrowth: 14,
    manaGrowth: 3,
    attackGrowth: 3,
    defenseGrowth: 3,

    starter:
      'training_sword'
  },

  ranger: {
    id: 'ranger',
    icon: '🏹',
    name: 'Ranger',

    hp: 110,
    mana: 55,
    attack: 17,
    defense: 10,

    hpGrowth: 11,
    manaGrowth: 5,
    attackGrowth: 4,
    defenseGrowth: 2,

    starter:
      'training_bow'
  },

  mage: {
    id: 'mage',
    icon: '🔮',
    name: 'Mage',

    hp: 90,
    mana: 100,
    attack: 20,
    defense: 7,

    hpGrowth: 8,
    manaGrowth: 10,
    attackGrowth: 5,
    defenseGrowth: 1,

    starter:
      'training_staff'
  }
}

function normalizeClass(
  value
) {
  const raw =
    String(value || '')
      .trim()
      .toLowerCase()

  const alias = {
    war:
      'warrior',

    warior:
      'warrior',

    archer:
      'ranger',

    pemanah:
      'ranger',

    magician:
      'mage',

    penyihir:
      'mage'
  }

  return (
    alias[raw] ||
    raw
  )
}

function classStats(
  classId,
  level
) {
  const info =
    RPG_CLASSES[
      classId
    ]

  if (!info) {
    return null
  }

  const extra =
    Math.max(
      0,
      Number(level) - 1
    )

  return {
    maxHp:
      info.hp +
      info.hpGrowth *
      extra,

    maxMana:
      info.mana +
      info.manaGrowth *
      extra,

    attack:
      info.attack +
      info.attackGrowth *
      extra,

    defense:
      info.defense +
      info.defenseGrowth *
      extra
  }
}

// =====================================
// EXP
// =====================================

export function getRpgRequiredExp(
  level
) {
  return (
    100 +
    Math.max(
      0,
      Number(level) - 1
    ) *
    75
  )
}

// =====================================
// TRANSACTION
// =====================================

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

function getPlayerId(
  jid
) {
  const playerId =
    resolvePlayerId(
      jid,
      false
    )

  if (!playerId) {
    return null
  }

  const user =
    db.prepare(`
      SELECT registered_at
      FROM players
      WHERE id = ?
    `).get(
      playerId
    )

  if (
    !user?.registered_at
  ) {
    return null
  }

  return playerId
}

function getRow(
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

function toProfile(
  row
) {
  if (!row) {
    return null
  }

  return {
    playerId:
      row.player_id,

    class:
      row.class,

    level:
      Number(row.level) || 1,

    exp:
      Number(row.exp) || 0,

    hp:
      Number(row.hp) || 0,

    maxHp:
      Number(row.max_hp) || 0,

    mana:
      Number(row.mana) || 0,

    maxMana:
      Number(row.max_mana) || 0,

    attack:
      Number(row.attack) || 0,

    defense:
      Number(row.defense) || 0,

    money:
      Number(row.money) || 0,

    bankMoney:
      Number(row.bank_money) || 0,

    wanted:
      Number(row.wanted) || 0,

    createdAt:
      Number(row.created_at) || 0,

    updatedAt:
      Number(row.updated_at) || 0
  }
}

function logMoney({
  playerId,
  walletDelta,
  bankDelta,
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
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    playerId,
    walletDelta,
    bankDelta,
    walletAfter,
    bankAfter,
    reason,
    note,
    now
  )
}

// =====================================
// PROFILE
// =====================================

export function ensureRpgProfile(
  jid
) {
  const playerId =
    getPlayerId(
      jid
    )

  if (!playerId) {
    return null
  }

  const existing =
    getRow(
      playerId
    )

  if (existing) {
    return toProfile(
      existing
    )
  }

  const now =
    Date.now()

  transaction(
    () => {
      const result =
        db.prepare(`
          INSERT OR IGNORE INTO rpg_profiles (
            player_id,
            class,
            level,
            exp,
            hp,
            max_hp,
            mana,
            max_mana,
            attack,
            defense,
            money,
            bank_money,
            wanted,
            created_at,
            updated_at
          )
          VALUES (
            ?, NULL, 1, 0,
            100, 100,
            50, 50,
            10, 8,
            1000, 0, 0,
            ?, ?
          )
        `).run(
          playerId,
          now,
          now
        )

      if (
        Number(
          result.changes
        ) > 0
      ) {
        logMoney({
          playerId,

          walletDelta:
            1000,

          bankDelta:
            0,

          walletAfter:
            1000,

          bankAfter:
            0,

          reason:
            'rpg_start',

          note:
            'Starter Money',

          now
        })
      }
    }
  )

  return toProfile(
    getRow(
      playerId
    )
  )
}

export function getRpgProfile(
  jid
) {
  return ensureRpgProfile(
    jid
  )
}

// =====================================
// CLASS CHOICE
// =====================================

export function chooseRpgClass(
  jid,
  value,
  {
    force = false
  } = {}
) {
  const profile =
    ensureRpgProfile(
      jid
    )

  if (!profile) {
    return {
      success: false,
      reason:
        'NO_PROFILE'
    }
  }

  const classId =
    normalizeClass(
      value
    )

  const info =
    RPG_CLASSES[
      classId
    ]

  if (!info) {
    return {
      success: false,
      reason:
        'INVALID_CLASS'
    }
  }

  return transaction(
    () => {
      const row =
        getRow(
          profile.playerId
        )

      if (
        row.class &&
        !force
      ) {
        return {
          success: false,
          reason:
            'CLASS_LOCKED',
          profile:
            toProfile(row)
        }
      }

      const firstClass =
        !row.class

      const stats =
        classStats(
          classId,
          row.level
        )

      const now =
        Date.now()

      db.prepare(`
        UPDATE rpg_profiles
        SET
          class = ?,
          hp = ?,
          max_hp = ?,
          mana = ?,
          max_mana = ?,
          attack = ?,
          defense = ?,
          updated_at = ?

        WHERE player_id = ?
      `).run(
        classId,

        stats.maxHp,
        stats.maxHp,

        stats.maxMana,
        stats.maxMana,

        stats.attack,
        stats.defense,

        now,
        profile.playerId
      )

      if (
        firstClass
      ) {
        const gearId =
          randomUUID()

        db.prepare(`
          INSERT INTO rpg_gear (
            gear_id,
            player_id,
            item_id,
            enchant_level,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, 0, ?, ?)
        `).run(
          gearId,
          profile.playerId,
          info.starter,
          now,
          now
        )

        db.prepare(`
          INSERT INTO rpg_equipment (
            player_id,
            weapon_gear_id,
            armor_gear_id,
            accessory_gear_id,
            updated_at
          )
          VALUES (?, ?, NULL, NULL, ?)

          ON CONFLICT(player_id)
          DO UPDATE SET
            weapon_gear_id =
              excluded.weapon_gear_id,
            updated_at =
              excluded.updated_at
        `).run(
          profile.playerId,
          gearId,
          now
        )

        db.prepare(`
          INSERT INTO rpg_inventory (
            player_id,
            item_id,
            quantity,
            created_at,
            updated_at
          )
          VALUES (
            ?,
            'small_potion',
            2,
            ?,
            ?
          )

          ON CONFLICT(
            player_id,
            item_id
          )
          DO UPDATE SET
            quantity =
              rpg_inventory.quantity +
              2,

            updated_at =
              excluded.updated_at
        `).run(
          profile.playerId,
          now,
          now
        )
      }

      return {
        success: true,
        firstClass,

        classInfo:
          info,

        profile:
          toProfile(
            getRow(
              profile.playerId
            )
          )
      }
    }
  )
}

// =====================================
// INVENTORY
// =====================================

export function getRpgInventory(
  jid
) {
  const profile =
    ensureRpgProfile(
      jid
    )

  if (!profile) {
    return null
  }

  const stacks =
    db.prepare(`
      SELECT
        item_id,
        quantity

      FROM rpg_inventory

      WHERE player_id = ?
        AND quantity > 0

      ORDER BY item_id
    `).all(
      profile.playerId
    )
      .map(
        row => ({
          ...row,
          item:
            getRpgItem(
              row.item_id
            )
        })
      )

  const equipped =
    db.prepare(`
      SELECT *
      FROM rpg_equipment
      WHERE player_id = ?
    `).get(
      profile.playerId
    )

  const gears =
    db.prepare(`
      SELECT
        gear_id,
        item_id,
        enchant_level

      FROM rpg_gear

      WHERE player_id = ?

      ORDER BY created_at
    `).all(
      profile.playerId
    )
      .map(
        row => ({
          ...row,

          item:
            getRpgItem(
              row.item_id
            ),

          equipped:
            Boolean(
              equipped &&
              (
                equipped.weapon_gear_id ===
                  row.gear_id ||
                equipped.armor_gear_id ===
                  row.gear_id ||
                equipped.accessory_gear_id ===
                  row.gear_id
              )
            )
        })
      )

  return {
    profile,
    stacks,
    gears
  }
}

// =====================================
// EQUIPMENT
// =====================================

export function getRpgEquipment(
  jid
) {
  const profile =
    ensureRpgProfile(
      jid
    )

  if (!profile) {
    return null
  }

  const equipment =
    db.prepare(`
      SELECT *
      FROM rpg_equipment
      WHERE player_id = ?
    `).get(
      profile.playerId
    )

  if (!equipment) {
    return {
      weapon:
        null,
      armor:
        null,
      accessory:
        null
    }
  }

  function gear(
    id
  ) {
    if (!id) {
      return null
    }

    const row =
      db.prepare(`
        SELECT *
        FROM rpg_gear
        WHERE gear_id = ?
          AND player_id = ?
      `).get(
        id,
        profile.playerId
      )

    if (!row) {
      return null
    }

    return {
      ...row,
      item:
        getRpgItem(
          row.item_id
        )
    }
  }

  return {
    weapon:
      gear(
        equipment.weapon_gear_id
      ),

    armor:
      gear(
        equipment.armor_gear_id
      ),

    accessory:
      gear(
        equipment.accessory_gear_id
      )
  }
}

// =====================================
// MONEY PARSER
// =====================================

export function parseRpgAmount(
  value
) {
  const raw =
    String(value || '')
      .trim()
      .toLowerCase()

  if (
    raw ===
    'all'
  ) {
    return 'all'
  }

  if (
    /^\d[\d.,]*$/.test(
      raw
    )
  ) {
    const number =
      Number(
        raw.replace(
          /[.,]/g,
          ''
        )
      )

    return (
      Number.isSafeInteger(
        number
      ) &&
      number > 0
    )
      ? number
      : null
  }

  const short =
    raw.match(
      /^(\d+)(k|m)$/
    )

  if (short) {
    const base =
      Number(
        short[1]
      )

    const multiply =
      short[2] === 'k'
        ? 1000
        : 1000000

    const number =
      base *
      multiply

    return Number.isSafeInteger(
      number
    )
      ? number
      : null
  }

  return null
}

// =====================================
// BANK
// =====================================

function moveBank(
  jid,
  rawAmount,
  mode
) {
  const profile =
    ensureRpgProfile(
      jid
    )

  if (!profile) {
    return {
      success: false,
      reason:
        'NO_PROFILE'
    }
  }

  const parsed =
    parseRpgAmount(
      rawAmount
    )

  if (!parsed) {
    return {
      success: false,
      reason:
        'INVALID_AMOUNT'
    }
  }

  return transaction(
    () => {
      const row =
        getRow(
          profile.playerId
        )

      const wallet =
        Number(row.money) || 0

      const bank =
        Number(
          row.bank_money
        ) || 0

      const source =
        mode === 'deposit'
          ? wallet
          : bank

      const amount =
        parsed === 'all'
          ? source
          : parsed

      if (
        amount <= 0
      ) {
        return {
          success: false,
          reason:
            'EMPTY'
        }
      }

      if (
        amount >
        source
      ) {
        return {
          success: false,

          reason:
            mode === 'deposit'
              ? 'INSUFFICIENT_WALLET'
              : 'INSUFFICIENT_BANK',

          available:
            source
        }
      }

      const newWallet =
        mode === 'deposit'
          ? wallet - amount
          : wallet + amount

      const newBank =
        mode === 'deposit'
          ? bank + amount
          : bank - amount

      const now =
        Date.now()

      db.prepare(`
        UPDATE rpg_profiles
        SET
          money = ?,
          bank_money = ?,
          updated_at = ?

        WHERE player_id = ?
      `).run(
        newWallet,
        newBank,
        now,
        profile.playerId
      )

      logMoney({
        playerId:
          profile.playerId,

        walletDelta:
          newWallet - wallet,

        bankDelta:
          newBank - bank,

        walletAfter:
          newWallet,

        bankAfter:
          newBank,

        reason:
          mode === 'deposit'
            ? 'bank_deposit'
            : 'bank_withdraw',

        now
      })

      return {
        success: true,
        amount,
        profile:
          toProfile(
            getRow(
              profile.playerId
            )
          )
      }
    }
  )
}

export function depositRpgMoney(
  jid,
  amount
) {
  return moveBank(
    jid,
    amount,
    'deposit'
  )
}

export function withdrawRpgMoney(
  jid,
  amount
) {
  return moveBank(
    jid,
    amount,
    'withdraw'
  )
}

// =====================================
// FUTURE OWNER / REWARD API
// =====================================

export function addRpgMoney(
  jid,
  amount,
  reason = 'add_money'
) {
  const profile =
    ensureRpgProfile(
      jid
    )

  const add =
    Math.trunc(
      Number(amount) || 0
    )

  if (
    !profile ||
    add <= 0
  ) {
    return null
  }

  return transaction(
    () => {
      const row =
        getRow(
          profile.playerId
        )

      const wallet =
        Number(row.money) || 0

      const next =
        wallet +
        add

      const now =
        Date.now()

      db.prepare(`
        UPDATE rpg_profiles
        SET
          money = ?,
          updated_at = ?

        WHERE player_id = ?
      `).run(
        next,
        now,
        profile.playerId
      )

      logMoney({
        playerId:
          profile.playerId,

        walletDelta:
          add,

        bankDelta:
          0,

        walletAfter:
          next,

        bankAfter:
          Number(
            row.bank_money
          ) || 0,

        reason,
        now
      })

      return toProfile(
        getRow(
          profile.playerId
        )
      )
    }
  )
}

export {
  RPG_ITEMS
}
