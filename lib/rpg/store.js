import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

import {
  ensureRpgProfile
} from './core.js'

import {
  initRpgSchema
} from './schema.js'

import {
  RPG_ITEMS,
  getRpgItem
} from './items.js'

const db = new DatabaseSync(
  './database/nexa.sqlite',
  { timeout: 5000 }
)

initRpgSchema(db)

// =====================================
// TRANSACTION
// =====================================

function transaction(fn) {
  db.exec('BEGIN IMMEDIATE')

  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    try {
      db.exec('ROLLBACK')
    } catch {}

    throw err
  }
}

function profileRow(playerId) {
  return db.prepare(`
    SELECT *
    FROM rpg_profiles
    WHERE player_id = ?
  `).get(playerId)
}

function equipmentRow(playerId) {
  return db.prepare(`
    SELECT *
    FROM rpg_equipment
    WHERE player_id = ?
  `).get(playerId)
}

function logMoney({
  playerId,
  delta,
  walletAfter,
  bankAfter,
  reason,
  note = null
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
    Date.now()
  )
}

// =====================================
// GEAR CODE
// =====================================

export function gearCode(gearId) {
  return (
    '#' +
    String(gearId || '')
      .replace(/-/g, '')
      .slice(0, 8)
      .toUpperCase()
  )
}

function findGear(playerId, input) {
  const wanted =
    String(input || '')
      .trim()
      .replace(/^#/, '')
      .toUpperCase()

  if (!wanted) {
    return null
  }

  const rows = db.prepare(`
    SELECT *
    FROM rpg_gear
    WHERE player_id = ?
  `).all(playerId)

  const matches =
    rows.filter(
      row =>
        gearCode(row.gear_id)
          .slice(1) === wanted
    )

  return matches.length === 1
    ? matches[0]
    : null
}

function isEquipped(playerId, gearId) {
  const eq =
    equipmentRow(playerId)

  if (!eq) {
    return false
  }

  return (
    eq.weapon_gear_id === gearId ||
    eq.armor_gear_id === gearId ||
    eq.accessory_gear_id === gearId
  )
}

// =====================================
// BONUS
// =====================================

export function gearStatBonus(
  item,
  enchantLevel = 0
) {
  const enchant =
    Math.max(
      0,
      Number(enchantLevel) || 0
    )

  let attack =
    Number(item?.attack) || 0

  let defense =
    Number(item?.defense) || 0

  if (item?.slot === 'weapon') {
    attack += enchant * 2
  } else if (
    item?.slot === 'armor'
  ) {
    defense += enchant * 2
  } else if (
    item?.slot === 'accessory'
  ) {
    attack += enchant
    defense += enchant
  }

  return {
    attack,
    defense
  }
}

export function getEquipmentStats(jid) {
  const profile =
    ensureRpgProfile(jid)

  if (!profile) {
    return null
  }

  const eq =
    equipmentRow(profile.playerId)

  const result = {
    baseAttack:
      profile.attack,

    baseDefense:
      profile.defense,

    gearAttack: 0,
    gearDefense: 0,

    totalAttack:
      profile.attack,

    totalDefense:
      profile.defense
  }

  if (!eq) {
    return result
  }

  for (
    const gearId
    of [
      eq.weapon_gear_id,
      eq.armor_gear_id,
      eq.accessory_gear_id
    ].filter(Boolean)
  ) {
    const gear =
      db.prepare(`
        SELECT *
        FROM rpg_gear
        WHERE gear_id = ?
          AND player_id = ?
      `).get(
        gearId,
        profile.playerId
      )

    if (!gear) {
      continue
    }

    const item =
      getRpgItem(
        gear.item_id
      )

    const bonus =
      gearStatBonus(
        item,
        gear.enchant_level
      )

    result.gearAttack +=
      bonus.attack

    result.gearDefense +=
      bonus.defense
  }

  result.totalAttack =
    result.baseAttack +
    result.gearAttack

  result.totalDefense =
    result.baseDefense +
    result.gearDefense

  return result
}

// =====================================
// MONEY -> GLOBAL EXCHANGE
// =====================================

export const RPG_EXCHANGE = {
  coin: {
    key: 'coin',
    icon: '🪙',
    name: 'Coin',
    price: 50000,
    reward: 100,
    dailyCap: 500
  },

  limit: {
    key: 'limit',
    icon: '🎟️',
    name: 'Limit',
    price: 30000,
    reward: 1,
    dailyCap: 5
  }
}

function localDayStart() {
  const date =
    new Date()

  date.setHours(
    0,
    0,
    0,
    0
  )

  return date.getTime()
}

export function exchangeRpgMoney(
  jid,
  kind,
  amount = 1,
  {
    isOwner = false
  } = {}
) {
  const profile =
    ensureRpgProfile(
      jid
    )

  if (!profile) {
    return {
      success: false,
      reason: 'NO_PROFILE'
    }
  }

  const type =
    String(kind || '')
      .trim()
      .toLowerCase()

  const config =
    RPG_EXCHANGE[
      type
    ]

  if (!config) {
    return {
      success: false,
      reason: 'INVALID_KIND'
    }
  }

  const qty =
    Math.trunc(
      Number(amount) || 0
    )

  if (
    qty < 1 ||
    qty > 99
  ) {
    return {
      success: false,
      reason: 'INVALID_QTY'
    }
  }

  return transaction(
    () => {
      const now =
        Date.now()

      const row =
        profileRow(
          profile.playerId
        )

      const user =
        db.prepare(`
          SELECT
            coin,
            limit_value,
            premium,
            premium_until
          FROM players
          WHERE id = ?
        `).get(
          profile.playerId
        )

      if (
        !row ||
        !user
      ) {
        return {
          success: false,
          reason: 'NO_PLAYER'
        }
      }

      const premiumActive =
        Boolean(
          user.premium
        ) &&
        Number(
          user.premium_until
        ) > now

      if (
        type === 'limit' &&
        (
          isOwner ||
          premiumActive
        )
      ) {
        return {
          success: false,
          reason: 'UNLIMITED_LIMIT'
        }
      }

      const reward =
        config.reward *
        qty

      const cost =
        config.price *
        qty

      const reason =
        `rpg_exchange_${type}`

      const usedRow =
        db.prepare(`
          SELECT
            COALESCE(
              SUM(delta),
              0
            ) AS used

          FROM economy_log

          WHERE player_id = ?
            AND metric = ?
            AND reason = ?
            AND created_at >= ?
        `).get(
          profile.playerId,
          type,
          reason,
          localDayStart()
        )

      const used =
        Math.max(
          0,
          Number(
            usedRow?.used
          ) || 0
        )

      const remaining =
        Math.max(
          0,
          config.dailyCap -
          used
        )

      if (
        reward >
        remaining
      ) {
        return {
          success: false,
          reason: 'DAILY_CAP',
          remaining,
          dailyCap:
            config.dailyCap
        }
      }

      const wallet =
        Number(
          row.money
        ) || 0

      if (
        wallet <
        cost
      ) {
        return {
          success: false,
          reason: 'MONEY_LOW',
          missing:
            cost -
            wallet
        }
      }

      const oldGlobal =
        type === 'coin'
          ? (
              Number(
                user.coin
              ) || 0
            )
          : (
              Number(
                user.limit_value
              ) || 0
            )

      const nextGlobal =
        oldGlobal +
        reward

      const nextMoney =
        wallet -
        cost

      if (
        !Number.isSafeInteger(
          nextGlobal
        ) ||
        !Number.isSafeInteger(
          nextMoney
        )
      ) {
        return {
          success: false,
          reason: 'OVERFLOW'
        }
      }

      db.prepare(`
        UPDATE rpg_profiles
        SET
          money = ?,
          updated_at = ?
        WHERE player_id = ?
      `).run(
        nextMoney,
        now,
        profile.playerId
      )

      if (
        type === 'coin'
      ) {
        db.prepare(`
          UPDATE players
          SET
            coin = ?,
            updated_at = ?
          WHERE id = ?
        `).run(
          nextGlobal,
          now,
          profile.playerId
        )
      } else {
        db.prepare(`
          UPDATE players
          SET
            limit_value = ?,
            updated_at = ?
          WHERE id = ?
        `).run(
          nextGlobal,
          now,
          profile.playerId
        )
      }

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
        profile.playerId,
        -cost,
        nextMoney,
        Number(
          row.bank_money
        ) || 0,
        reason,
        `${type} +${reward}`,
        now
      )

      db.prepare(`
        INSERT INTO economy_log (
          player_id,
          metric,
          delta,
          balance_after,
          reason,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        profile.playerId,
        type,
        reward,
        nextGlobal,
        reason,
        now
      )

      return {
        success: true,
        kind:
          type,
        config,
        qty,
        cost,
        reward,
        money:
          nextMoney,
        globalBalance:
          nextGlobal,
        remaining:
          remaining -
          reward
      }
    }
  )
}

// =====================================
// SHOP
// =====================================

export function getRpgShop(jid) {
  const profile =
    ensureRpgProfile(jid)

  if (!profile) {
    return null
  }

  const items =
    Object.values(
      RPG_ITEMS
    )
      .filter(
        item =>
          Number.isFinite(
            item.buyPrice
          ) &&
          item.buyPrice > 0
      )
      .filter(
        item =>
          !item.class ||
          item.class ===
            profile.class
      )

  return {
    profile,
    items
  }
}

// =====================================
// BUY
// =====================================

export function buyRpgItem(
  jid,
  itemId,
  amount = 1
) {
  const profile =
    ensureRpgProfile(jid)

  if (!profile) {
    return {
      success: false,
      reason: 'NO_PROFILE'
    }
  }

  const item =
    getRpgItem(itemId)

  if (
    !item ||
    !Number.isFinite(
      item.buyPrice
    ) ||
    item.buyPrice <= 0
  ) {
    return {
      success: false,
      reason: 'NOT_FOR_SALE'
    }
  }

  let qty =
    Math.trunc(
      Number(amount) || 1
    )

  if (
    qty < 1 ||
    qty > 99
  ) {
    return {
      success: false,
      reason: 'INVALID_QTY'
    }
  }

  if (
    item.type === 'gear' &&
    qty !== 1
  ) {
    return {
      success: false,
      reason: 'GEAR_QTY'
    }
  }

  if (
    item.type === 'gear' &&
    !profile.class
  ) {
    return {
      success: false,
      reason: 'NO_CLASS'
    }
  }

  if (
    item.class &&
    item.class !==
      profile.class
  ) {
    return {
      success: false,
      reason: 'WRONG_CLASS',
      requiredClass:
        item.class
    }
  }

  if (
    Number(profile.level) <
    Number(item.minLevel || 1)
  ) {
    return {
      success: false,
      reason: 'LEVEL_LOW',
      requiredLevel:
        Number(item.minLevel || 1)
    }
  }

  const total =
    item.buyPrice *
    qty

  return transaction(
    () => {
      const row =
        profileRow(
          profile.playerId
        )

      const wallet =
        Number(row.money) || 0

      if (
        wallet <
        total
      ) {
        return {
          success: false,
          reason: 'MONEY_LOW',
          missing:
            total - wallet,
          money:
            wallet
        }
      }

      const now =
        Date.now()

      if (
        item.type === 'gear'
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
          item.id,
          now,
          now
        )
      } else {
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
          profile.playerId,
          item.id,
          qty,
          now,
          now
        )
      }

      const next =
        wallet -
        total

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

        delta:
          -total,

        walletAfter:
          next,

        bankAfter:
          Number(row.bank_money) || 0,

        reason:
          'rpg_shop_buy',

        note:
          `${item.id} x${qty}`
      })

      return {
        success: true,
        item,
        qty,
        total,
        money:
          next
      }
    }
  )
}

// =====================================
// SELL
// =====================================

export function sellRpgItem(
  jid,
  target,
  amount = 1
) {
  const profile =
    ensureRpgProfile(jid)

  if (!profile) {
    return {
      success: false,
      reason: 'NO_PROFILE'
    }
  }

  const raw =
    String(target || '')
      .trim()

  // Individual gear
  if (
    raw.startsWith('#')
  ) {
    return transaction(
      () => {
        const gear =
          findGear(
            profile.playerId,
            raw
          )

        if (!gear) {
          return {
            success: false,
            reason: 'GEAR_NOT_FOUND'
          }
        }

        if (
          isEquipped(
            profile.playerId,
            gear.gear_id
          )
        ) {
          return {
            success: false,
            reason: 'GEAR_EQUIPPED'
          }
        }

        const item =
          getRpgItem(
            gear.item_id
          )

        if (
          !item ||
          !Number.isFinite(
            item.sellPrice
          ) ||
          item.sellPrice <= 0
        ) {
          return {
            success: false,
            reason: 'NOT_SELLABLE'
          }
        }

        const row =
          profileRow(
            profile.playerId
          )

        const wallet =
          Number(row.money) || 0

        const gain =
          item.sellPrice +
          (
            Math.max(
              0,
              Number(
                gear.enchant_level
              ) || 0
            ) *
            100
          )

        const next =
          wallet +
          gain

        db.prepare(`
          DELETE FROM rpg_gear
          WHERE gear_id = ?
            AND player_id = ?
        `).run(
          gear.gear_id,
          profile.playerId
        )

        db.prepare(`
          UPDATE rpg_profiles
          SET
            money = ?,
            updated_at = ?
          WHERE player_id = ?
        `).run(
          next,
          Date.now(),
          profile.playerId
        )

        logMoney({
          playerId:
            profile.playerId,

          delta:
            gain,

          walletAfter:
            next,

          bankAfter:
            Number(row.bank_money) || 0,

          reason:
            'rpg_shop_sell_gear',

          note:
            gear.item_id
        })

        return {
          success: true,
          type: 'gear',
          item,
          qty: 1,
          gain,
          money:
            next
        }
      }
    )
  }

  const item =
    getRpgItem(raw)

  if (
    !item ||
    !Number.isFinite(
      item.sellPrice
    ) ||
    item.sellPrice <= 0
  ) {
    return {
      success: false,
      reason: 'NOT_SELLABLE'
    }
  }

  if (item.type === 'gear') {
    return {
      success: false,
      reason: 'USE_GEAR_CODE'
    }
  }

  const qty =
    Math.trunc(
      Number(amount) || 1
    )

  if (
    qty < 1 ||
    qty > 999
  ) {
    return {
      success: false,
      reason: 'INVALID_QTY'
    }
  }

  return transaction(
    () => {
      const inv =
        db.prepare(`
          SELECT quantity
          FROM rpg_inventory
          WHERE player_id = ?
            AND item_id = ?
        `).get(
          profile.playerId,
          item.id
        )

      const owned =
        Number(inv?.quantity) || 0

      if (
        owned <
        qty
      ) {
        return {
          success: false,
          reason: 'ITEM_LOW',
          owned
        }
      }

      const gain =
        item.sellPrice *
        qty

      const row =
        profileRow(
          profile.playerId
        )

      const wallet =
        Number(row.money) || 0

      const next =
        wallet +
        gain

      const now =
        Date.now()

      db.prepare(`
        UPDATE rpg_inventory
        SET
          quantity = quantity - ?,
          updated_at = ?
        WHERE player_id = ?
          AND item_id = ?
      `).run(
        qty,
        now,
        profile.playerId,
        item.id
      )

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

        delta:
          gain,

        walletAfter:
          next,

        bankAfter:
          Number(row.bank_money) || 0,

        reason:
          'rpg_shop_sell',

        note:
          `${item.id} x${qty}`
      })

      return {
        success: true,
        type: 'stack',
        item,
        qty,
        gain,
        money:
          next
      }
    }
  )
}

// =====================================
// INVENTORY DETAIL
// =====================================

export function getRpgInventoryDetail(
  jid
) {
  const profile =
    ensureRpgProfile(jid)

  if (!profile) {
    return null
  }

  const eq =
    equipmentRow(
      profile.playerId
    )

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
    ).map(
      row => ({
        ...row,
        item:
          getRpgItem(
            row.item_id
          )
      })
    )

  const gears =
    db.prepare(`
      SELECT *
      FROM rpg_gear
      WHERE player_id = ?
      ORDER BY created_at, gear_id
    `).all(
      profile.playerId
    ).map(
      gear => ({
        ...gear,

        code:
          gearCode(
            gear.gear_id
          ),

        item:
          getRpgItem(
            gear.item_id
          ),

        equipped:
          Boolean(
            eq &&
            (
              eq.weapon_gear_id ===
                gear.gear_id ||
              eq.armor_gear_id ===
                gear.gear_id ||
              eq.accessory_gear_id ===
                gear.gear_id
            )
          )
      })
    )

  return {
    profile,
    stacks,
    gears,
    equipment:
      eq || null
  }
}

// =====================================
// EQUIP
// =====================================

export function equipRpgGear(
  jid,
  code
) {
  const profile =
    ensureRpgProfile(jid)

  if (!profile) {
    return {
      success: false,
      reason: 'NO_PROFILE'
    }
  }

  const gear =
    findGear(
      profile.playerId,
      code
    )

  if (!gear) {
    return {
      success: false,
      reason: 'GEAR_NOT_FOUND'
    }
  }

  const item =
    getRpgItem(
      gear.item_id
    )

  if (
    !item ||
    item.type !== 'gear' ||
    !item.slot
  ) {
    return {
      success: false,
      reason: 'INVALID_GEAR'
    }
  }

  if (
    item.class &&
    item.class !==
      profile.class
  ) {
    return {
      success: false,
      reason: 'WRONG_CLASS'
    }
  }

  if (
    Number(profile.level) <
    Number(item.minLevel || 1)
  ) {
    return {
      success: false,
      reason: 'LEVEL_LOW',
      requiredLevel:
        Number(item.minLevel || 1)
    }
  }

  const columns = {
    weapon:
      'weapon_gear_id',

    armor:
      'armor_gear_id',

    accessory:
      'accessory_gear_id'
  }

  const column =
    columns[
      item.slot
    ]

  if (!column) {
    return {
      success: false,
      reason: 'INVALID_SLOT'
    }
  }

  return transaction(
    () => {
      const now =
        Date.now()

      db.prepare(`
        INSERT OR IGNORE INTO rpg_equipment (
          player_id,
          weapon_gear_id,
          armor_gear_id,
          accessory_gear_id,
          updated_at
        )
        VALUES (?, NULL, NULL, NULL, ?)
      `).run(
        profile.playerId,
        now
      )

      db.prepare(`
        UPDATE rpg_equipment
        SET
          ${column} = ?,
          updated_at = ?
        WHERE player_id = ?
      `).run(
        gear.gear_id,
        now,
        profile.playerId
      )

      return {
        success: true,
        gear,
        item,
        slot:
          item.slot
      }
    }
  )
}

export function unequipRpgGear(
  jid,
  slot
) {
  const profile =
    ensureRpgProfile(jid)

  if (!profile) {
    return {
      success: false,
      reason: 'NO_PROFILE'
    }
  }

  const clean =
    String(slot || '')
      .trim()
      .toLowerCase()

  const columns = {
    weapon:
      'weapon_gear_id',

    armor:
      'armor_gear_id',

    accessory:
      'accessory_gear_id'
  }

  const column =
    columns[
      clean
    ]

  if (!column) {
    return {
      success: false,
      reason: 'INVALID_SLOT'
    }
  }

  const eq =
    equipmentRow(
      profile.playerId
    )

  if (
    !eq ||
    !eq[column]
  ) {
    return {
      success: false,
      reason: 'SLOT_EMPTY'
    }
  }

  db.prepare(`
    UPDATE rpg_equipment
    SET
      ${column} = NULL,
      updated_at = ?
    WHERE player_id = ?
  `).run(
    Date.now(),
    profile.playerId
  )

  return {
    success: true,
    slot:
      clean
  }
}

// =====================================
// ENCHANT
//
// 100% berhasil.
// Tidak ada RNG / chance gagal.
// =====================================

export function getEnchantRequirement(
  level
) {
  const next =
    Math.max(
      1,
      Number(level) || 1
    )

  let materialId

  if (next <= 2) {
    materialId =
      'slime_gel'
  } else if (
    next <= 4
  ) {
    materialId =
      'wolf_fang'
  } else if (
    next <= 7
  ) {
    materialId =
      'goblin_scrap'
  } else {
    materialId =
      'bone_fragment'
  }

  const materialQty =
    next <= 4
      ? 2
      : next <= 7
        ? 3
        : 4

  return {
    nextLevel:
      next,

    money:
      300 *
      next *
      next,

    materialId,

    material:
      getRpgItem(
        materialId
      ),

    materialQty
  }
}

export function enchantRpgGear(
  jid,
  code
) {
  const profile =
    ensureRpgProfile(jid)

  if (!profile) {
    return {
      success: false,
      reason: 'NO_PROFILE'
    }
  }

  return transaction(
    () => {
      const gear =
        findGear(
          profile.playerId,
          code
        )

      if (!gear) {
        return {
          success: false,
          reason: 'GEAR_NOT_FOUND'
        }
      }

      const item =
        getRpgItem(
          gear.item_id
        )

      if (
        !item ||
        item.type !== 'gear'
      ) {
        return {
          success: false,
          reason: 'INVALID_GEAR'
        }
      }

      const current =
        Math.max(
          0,
          Number(
            gear.enchant_level
          ) || 0
        )

      if (
        current >= 10
      ) {
        return {
          success: false,
          reason: 'MAX_ENCHANT'
        }
      }

      const req =
        getEnchantRequirement(
          current + 1
        )

      const row =
        profileRow(
          profile.playerId
        )

      const wallet =
        Number(row.money) || 0

      if (
        wallet <
        req.money
      ) {
        return {
          success: false,
          reason: 'MONEY_LOW',
          missing:
            req.money - wallet,
          requirement:
            req
        }
      }

      const inv =
        db.prepare(`
          SELECT quantity
          FROM rpg_inventory
          WHERE player_id = ?
            AND item_id = ?
        `).get(
          profile.playerId,
          req.materialId
        )

      const owned =
        Number(
          inv?.quantity
        ) || 0

      if (
        owned <
        req.materialQty
      ) {
        return {
          success: false,
          reason: 'MATERIAL_LOW',
          owned,
          requirement:
            req
        }
      }

      const nextMoney =
        wallet -
        req.money

      const now =
        Date.now()

      db.prepare(`
        UPDATE rpg_inventory
        SET
          quantity =
            quantity - ?,
          updated_at = ?
        WHERE player_id = ?
          AND item_id = ?
      `).run(
        req.materialQty,
        now,
        profile.playerId,
        req.materialId
      )

      db.prepare(`
        UPDATE rpg_gear
        SET
          enchant_level = ?,
          updated_at = ?
        WHERE gear_id = ?
          AND player_id = ?
      `).run(
        current + 1,
        now,
        gear.gear_id,
        profile.playerId
      )

      db.prepare(`
        UPDATE rpg_profiles
        SET
          money = ?,
          updated_at = ?
        WHERE player_id = ?
      `).run(
        nextMoney,
        now,
        profile.playerId
      )

      logMoney({
        playerId:
          profile.playerId,

        delta:
          -req.money,

        walletAfter:
          nextMoney,

        bankAfter:
          Number(row.bank_money) || 0,

        reason:
          'rpg_enchant',

        note:
          `${item.id} +${current + 1}`
      })

      return {
        success: true,
        item,
        gear,
        oldLevel:
          current,

        newLevel:
          current + 1,

        requirement:
          req,

        money:
          nextMoney
      }
    }
  )
}

export {
  RPG_ITEMS
}
