import {
  DatabaseSync
} from 'node:sqlite'

import {
  ensureRpgProfile
} from './core.js'

import {
  getBattle
} from './combat.js'

import {
  getRpgItem
} from './items.js'

const db =
  new DatabaseSync(
    './database/nexa.sqlite',
    {
      timeout: 5000
    }
  )

export function useRpgItem(
  jid,
  itemId
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

  if (
    getBattle(jid)?.battle
  ) {
    return {
      success: false,
      reason: 'IN_BATTLE'
    }
  }

  const item =
    getRpgItem(
      itemId
    )

  if (
    !item ||
    item.type !==
      'consumable'
  ) {
    return {
      success: false,
      reason: 'NOT_CONSUMABLE'
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
        Number(
          item.minLevel || 1
        )
    }
  }

  db.exec(
    'BEGIN IMMEDIATE'
  )

  try {
    const row =
      db.prepare(`
        SELECT *
        FROM rpg_profiles
        WHERE player_id = ?
      `).get(
        profile.playerId
      )

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

    if (
      Number(inv?.quantity) <= 0
    ) {
      db.exec('ROLLBACK')

      return {
        success: false,
        reason: 'NO_ITEM'
      }
    }

    const oldHp =
      Number(row.hp)

    const oldMana =
      Number(row.mana)

    const maxHp =
      Number(row.max_hp)

    const maxMana =
      Number(row.max_mana)

    const nextHp =
      Math.min(
        maxHp,
        oldHp +
        Number(item.heal || 0)
      )

    const nextMana =
      Math.min(
        maxMana,
        oldMana +
        Number(item.mana || 0)
      )

    if (
      nextHp === oldHp &&
      nextMana === oldMana
    ) {
      db.exec('ROLLBACK')

      return {
        success: false,
        reason: 'FULL'
      }
    }

    const now =
      Date.now()

    db.prepare(`
      UPDATE rpg_inventory
      SET
        quantity =
          quantity - 1,
        updated_at = ?
      WHERE player_id = ?
        AND item_id = ?
    `).run(
      now,
      profile.playerId,
      item.id
    )

    db.prepare(`
      UPDATE rpg_profiles
      SET
        hp = ?,
        mana = ?,
        updated_at = ?
      WHERE player_id = ?
    `).run(
      nextHp,
      nextMana,
      now,
      profile.playerId
    )

    db.exec(
      'COMMIT'
    )

    return {
      success: true,
      item,

      healed:
        nextHp - oldHp,

      manaRestored:
        nextMana - oldMana,

      hp:
        nextHp,

      mana:
        nextMana,

      maxHp,
      maxMana
    }
  } catch (err) {
    try {
      db.exec(
        'ROLLBACK'
      )
    } catch {}

    throw err
  }
}
