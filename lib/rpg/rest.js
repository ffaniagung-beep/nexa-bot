import {
  DatabaseSync
} from 'node:sqlite'

import {
  ensureRpgProfile
} from './core.js'

import {
  getBattle
} from './combat.js'

const db =
  new DatabaseSync(
    './database/nexa.sqlite',
    {
      timeout: 5000
    }
  )

const REST_COOLDOWN =
  10 * 60 * 1000

function cooldownUntil(
  playerId
) {
  const row =
    db.prepare(`
      SELECT expires_at
      FROM rpg_cooldowns
      WHERE player_id = ?
        AND action = 'rest'
    `).get(
      playerId
    )

  return Math.max(
    0,
    Number(
      row?.expires_at
    ) || 0
  )
}

function setCooldown(
  playerId,
  expiresAt
) {
  db.prepare(`
    INSERT INTO rpg_cooldowns (
      player_id,
      action,
      expires_at
    )
    VALUES (?, 'rest', ?)

    ON CONFLICT(
      player_id,
      action
    )
    DO UPDATE SET
      expires_at =
        excluded.expires_at
  `).run(
    playerId,
    expiresAt
  )
}

export function restRpg(
  jid
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
    getBattle(
      jid
    )?.battle
  ) {
    return {
      success: false,
      reason: 'IN_BATTLE'
    }
  }

  const row =
    db.prepare(`
      SELECT *
      FROM rpg_profiles
      WHERE player_id = ?
    `).get(
      profile.playerId
    )

  if (!row) {
    return {
      success: false,
      reason: 'NO_PROFILE'
    }
  }

  if (
    Number(row.hp) >=
      Number(row.max_hp) &&
    Number(row.mana) >=
      Number(row.max_mana)
  ) {
    return {
      success: false,
      reason: 'FULL'
    }
  }

  const now =
    Date.now()

  const until =
    cooldownUntil(
      profile.playerId
    )

  if (
    until >
    now
  ) {
    return {
      success: false,
      reason: 'COOLDOWN',
      cooldown:
        until - now
    }
  }

  const oldHp =
    Number(row.hp) || 0

  const oldMana =
    Number(row.mana) || 0

  const maxHp =
    Number(row.max_hp) || 100

  const maxMana =
    Number(row.max_mana) || 50

  db.exec(
    'BEGIN IMMEDIATE'
  )

  try {
    db.prepare(`
      UPDATE rpg_profiles
      SET
        hp = ?,
        mana = ?,
        updated_at = ?

      WHERE player_id = ?
    `).run(
      maxHp,
      maxMana,
      now,
      profile.playerId
    )

    setCooldown(
      profile.playerId,
      now +
      REST_COOLDOWN
    )

    db.exec(
      'COMMIT'
    )
  } catch (err) {
    try {
      db.exec(
        'ROLLBACK'
      )
    } catch {}

    throw err
  }

  return {
    success: true,

    oldHp,
    oldMana,

    hp:
      maxHp,

    mana:
      maxMana,

    maxHp,
    maxMana,

    cooldown:
      REST_COOLDOWN
  }
}
