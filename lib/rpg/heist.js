import {
  DatabaseSync
} from 'node:sqlite'

import {
  ensureRpgProfile
} from './core.js'

import {
  getEquipmentStats
} from './store.js'

const db =
  new DatabaseSync(
    './database/nexa.sqlite',
    {
      timeout: 5000
    }
  )

const HEIST_COOLDOWN =
  12 * 60 * 60 * 1000

const MAX_WANTED =
  5

export const BANK_TIERS = {
  city: {
    id: 'city',
    icon: '🏦',
    name: 'City Bank',

    minLevel: 5,
    security: 95,

    reward: 1500,
    penalty: 300,

    wanted: 1
  },

  grand: {
    id: 'grand',
    icon: '🏛️',
    name: 'Grand Bank',

    minLevel: 10,
    security: 180,

    reward: 5000,
    penalty: 1000,

    wanted: 2
  },

  royal: {
    id: 'royal',
    icon: '👑',
    name: 'Royal NEXA Bank',

    minLevel: 20,
    security: 320,

    reward: 15000,
    penalty: 3000,

    wanted: 3
  }
}

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
  } catch (err) {
    try {
      db.exec(
        'ROLLBACK'
      )
    } catch {}

    throw err
  }
}

function row(
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

function cooldownUntil(
  playerId
) {
  const found =
    db.prepare(`
      SELECT expires_at
      FROM rpg_cooldowns
      WHERE player_id = ?
        AND action =
          'bank_heist_global'
    `).get(
      playerId
    )

  return Math.max(
    0,
    Number(
      found?.expires_at
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
    VALUES (
      ?,
      'bank_heist_global',
      ?
    )

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

function moneyLog({
  playerId,
  delta,
  walletAfter,
  bankAfter,
  reason,
  note
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
    VALUES (
      ?, ?, 0, ?, ?, ?, ?, ?
    )
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

function randomText(
  list
) {
  return list[
    Math.floor(
      Math.random() *
      list.length
    )
  ]
}

function successText() {
  return randomText([
    '🔓 Jalur keamanan berhasil dilewati sebelum alarm sempat bereaksi.',
    '🕶️ Rencananya rapi. Security baru sadar setelah semuanya selesai.',
    '🗿 Entah bagaimana rencana itu benar-benar bekerja.',
    '🚪 Sistem pengamanan berhasil ditembus dan jalan keluar masih terbuka.'
  ])
}

function failText() {
  return randomText([
    '🚨 Security terlalu kuat. Alarm langsung menyala.',
    '💀 Rencananya bagus... sampai security ikut punya rencana.',
    '🫠 Sistem keamanan membaca gerakan lu terlalu cepat.',
    '🚔 Jalur keluar tertutup sebelum aksi selesai.'
  ])
}

function heistPower(
  jid,
  profile
) {
  const stats =
    getEquipmentStats(
      jid
    )

  const attack =
    Number(
      stats?.totalAttack
    ) || 0

  const defense =
    Number(
      stats?.totalDefense
    ) || 0

  return (
    Number(profile.level) *
      10 +
    attack +
    defense -
    Number(profile.wanted) *
      8
  )
}

export function getBankHeistStatus(
  jid
) {
  const profile =
    ensureRpgProfile(
      jid
    )

  if (!profile) {
    return null
  }

  const current =
    row(
      profile.playerId
    )

  return {
    profile,

    power:
      heistPower(
        jid,
        current
      ),

    cooldown:
      Math.max(
        0,
        cooldownUntil(
          profile.playerId
        ) -
        Date.now()
      ),

    tiers:
      BANK_TIERS
  }
}

export function attemptBankHeist(
  jid,
  tierId,
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

  const tier =
    BANK_TIERS[
      String(
        tierId || ''
      )
        .trim()
        .toLowerCase()
    ]

  if (!tier) {
    return {
      success: false,
      reason: 'INVALID_TIER'
    }
  }

  const before =
    row(
      profile.playerId
    )

  if (
    !isOwner &&
    Number(before.level) <
    tier.minLevel
  ) {
    return {
      success: false,
      reason: 'LEVEL_LOW',

      required:
        tier.minLevel,

      tier
    }
  }

  if (
    Number(before.wanted) >=
    MAX_WANTED
  ) {
    return {
      success: false,
      reason: 'WANTED_MAX'
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

  const power =
    heistPower(
      jid,
      before
    )

  const passed =
    power >=
    tier.security

  return transaction(
    () => {
      const fresh =
        row(
          profile.playerId
        )

      if (!fresh) {
        return {
          success: false,
          reason: 'PROFILE_CHANGED'
        }
      }

      // Re-check cooldown under lock.
      const lockedUntil =
        cooldownUntil(
          profile.playerId
        )

      if (
        lockedUntil >
        Date.now()
      ) {
        return {
          success: false,
          reason: 'COOLDOWN',

          cooldown:
            lockedUntil -
            Date.now()
        }
      }

      const wantedAfter =
        Math.min(
          MAX_WANTED,
          Number(fresh.wanted) +
          tier.wanted
        )

      setCooldown(
        profile.playerId,
        now +
        HEIST_COOLDOWN
      )

      // ===============================
      // SUCCESS
      // ===============================

      if (passed) {
        const oldMoney =
          Number(
            fresh.money
          ) || 0

        const next =
          oldMoney +
          tier.reward

        db.prepare(`
          UPDATE rpg_profiles
          SET
            money = ?,
            wanted = ?,
            updated_at = ?

          WHERE player_id = ?
        `).run(
          next,
          wantedAfter,
          now,
          profile.playerId
        )

        moneyLog({
          playerId:
            profile.playerId,

          delta:
            tier.reward,

          walletAfter:
            next,

          bankAfter:
            Number(
              fresh.bank_money
            ) || 0,

          reason:
            'bank_heist_success',

          note:
            tier.id
        })

        return {
          success: true,
          outcome: 'SUCCESS',

          tier,
          power,

          reward:
            tier.reward,

          money:
            next,

          wanted:
            wantedAfter,

          scenario:
            successText(),

          cooldown:
            HEIST_COOLDOWN
        }
      }

      // ===============================
      // FAILED
      // ===============================

      const oldMoney =
        Number(
          fresh.money
        ) || 0

      const penalty =
        Math.min(
          oldMoney,
          tier.penalty
        )

      const next =
        oldMoney -
        penalty

      db.prepare(`
        UPDATE rpg_profiles
        SET
          money = ?,
          wanted = ?,
          updated_at = ?

        WHERE player_id = ?
      `).run(
        next,
        wantedAfter,
        now,
        profile.playerId
      )

      if (
        penalty > 0
      ) {
        moneyLog({
          playerId:
            profile.playerId,

          delta:
            -penalty,

          walletAfter:
            next,

          bankAfter:
            Number(
              fresh.bank_money
            ) || 0,

          reason:
            'bank_heist_failed',

          note:
            tier.id
        })
      }

      return {
        success: true,
        outcome: 'FAILED',

        tier,
        power,

        penalty,

        money:
          next,

        wanted:
          wantedAfter,

        scenario:
          failText(),

        cooldown:
          HEIST_COOLDOWN
      }
    }
  )
}
