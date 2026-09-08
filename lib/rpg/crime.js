import {
  DatabaseSync
} from 'node:sqlite'

import {
  resolvePlayerId
} from '../playerdb.js'

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

const GLOBAL_COOLDOWN =
  30 * 60 * 1000

const TARGET_COOLDOWN =
  2 * 60 * 60 * 1000

const WALLET_PROTECTION =
  500

const MAX_THEFT =
  2500

const MAX_WANTED =
  5

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

// =====================================
// PROFILE
// =====================================

function profileById(
  playerId
) {
  return db.prepare(`
    SELECT
      r.*,
      p.name,
      p.registered_at

    FROM rpg_profiles r

    JOIN players p
      ON p.id = r.player_id

    WHERE r.player_id = ?
      AND p.registered_at IS NOT NULL
  `).get(
    playerId
  )
}

function publicProfile(
  row
) {
  if (!row) {
    return null
  }

  return {
    playerId:
      row.player_id,

    name:
      row.name ||
      'Player',

    level:
      Number(row.level) || 1,

    money:
      Number(row.money) || 0,

    bankMoney:
      Number(row.bank_money) || 0,

    wanted:
      Number(row.wanted) || 0
  }
}

// =====================================
// OWNER PROTECTION
// =====================================

function ownerCandidateJids(
  config
) {
  const result =
    new Set()

  for (
    const raw
    of Array.isArray(
      config?.owner
    )
      ? config.owner
      : []
  ) {
    const digits =
      String(raw || '')
        .replace(
          /\D/g,
          ''
        )

    if (digits) {
      result.add(
        `${digits}@s.whatsapp.net`
      )
    }
  }

  for (
    const raw
    of Array.isArray(
      config?.ownerJids
    )
      ? config.ownerJids
      : []
  ) {
    const jid =
      String(raw || '')
        .trim()
        .toLowerCase()

    if (jid) {
      result.add(
        jid
      )
    }
  }

  return [
    ...result
  ]
}

function isProtectedOwner(
  targetPlayerId,
  config
) {
  for (
    const jid
    of ownerCandidateJids(
      config
    )
  ) {
    const ownerId =
      resolvePlayerId(
        jid,
        false
      )

    if (
      ownerId &&
      ownerId ===
        targetPlayerId
    ) {
      return true
    }
  }

  return false
}

// =====================================
// COOLDOWN
// =====================================

function cooldownKey(
  targetPlayerId
) {
  return (
    `maling_target:` +
    targetPlayerId
  )
}

function cooldownUntil(
  playerId,
  action
) {
  const row =
    db.prepare(`
      SELECT expires_at
      FROM rpg_cooldowns
      WHERE player_id = ?
        AND action = ?
    `).get(
      playerId,
      action
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
  action,
  expiresAt
) {
  db.prepare(`
    INSERT INTO rpg_cooldowns (
      player_id,
      action,
      expires_at
    )
    VALUES (?, ?, ?)

    ON CONFLICT(
      player_id,
      action
    )
    DO UPDATE SET
      expires_at =
        excluded.expires_at
  `).run(
    playerId,
    action,
    expiresAt
  )
}

// =====================================
// ECONOMY LOG
// =====================================

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
    VALUES (?, ?, 0, ?, ?, ?, ?, ?)
  `).run(
    playerId,
    delta,
    walletAfter,
    bankAfter,
    reason,
    note || null,
    Date.now()
  )
}

// =====================================
// CRIME POWER
//
// Deterministik.
// Tidak ada roll finansial.
// =====================================

function crimePower(
  jid,
  row
) {
  const stats =
    getEquipmentStats(
      jid
    )

  const combatScore =
    stats
      ? Math.floor(
          (
            stats.totalAttack +
            stats.totalDefense
          ) /
          2
        )
      : 10

  return (
    Number(row.level) *
      10 +
    combatScore -
    Number(row.wanted) *
      2
  )
}

function securityPower(
  targetJid,
  row
) {
  const stats =
    getEquipmentStats(
      targetJid
    )

  const combatScore =
    stats
      ? Math.floor(
          (
            stats.totalAttack +
            stats.totalDefense
          ) /
          2
        )
      : 10

  return (
    Number(row.level) *
      10 +
    combatScore +
    3
  )
}

// =====================================
// SCENARIO TEXT
//
// Random hanya kosmetik.
// Tidak menentukan uang.
// =====================================

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

function successScenario() {
  return randomText([
    '🧤 Gerakannya mulus. Target baru sadar setelah semuanya selesai.',
    '🕶️ Kamu berhasil lewat tanpa menarik perhatian.',
    '🐈 Timing-nya pas banget. Dompet target lengah sebentar.',
    '🗿 Entah bagaimana... rencana absurd itu malah berhasil.'
  ])
}

function failScenario() {
  return randomText([
    '🚨 Target keburu sadar dan aksinya gagal.',
    '🫠 Gerakan kamu terlalu mencurigakan. Ketahuan.',
    '👀 Target ternyata lebih waspada dari perkiraan.',
    '💀 Baru mulai aja sudah bikin suasana mencurigakan.'
  ])
}

// =====================================
// MAIN
// =====================================

export function attemptTheft({
  attackerJid,
  targetJid,
  config,
  isOwner = false
}) {
  const attacker =
    ensureRpgProfile(
      attackerJid
    )

  if (!attacker) {
    return {
      success: false,
      reason:
        'NO_ATTACKER_RPG'
    }
  }

  const attackerId =
    attacker.playerId

  const targetId =
    resolvePlayerId(
      targetJid,
      false
    )

  if (!targetId) {
    return {
      success: false,
      reason:
        'TARGET_NOT_FOUND'
    }
  }

  // =================================
  // OWNER PROTECTION
  // HARUS sebelum cooldown.
  // =================================

  if (
    isProtectedOwner(
      targetId,
      config
    )
  ) {
    return {
      success: false,
      reason:
        'OWNER_PROTECTED'
    }
  }

  if (
    targetId ===
    attackerId
  ) {
    return {
      success: false,
      reason:
        'SELF_TARGET'
    }
  }

  const target =
    profileById(
      targetId
    )

  if (!target) {
    return {
      success: false,
      reason:
        'TARGET_NO_RPG'
    }
  }

  const attackerRow =
    profileById(
      attackerId
    )

  if (!attackerRow) {
    return {
      success: false,
      reason:
        'NO_ATTACKER_RPG'
    }
  }

  if (
    !isOwner &&
    Number(
      attackerRow.level
    ) < 3
  ) {
    return {
      success: false,
      reason:
        'LEVEL_LOW',
      requiredLevel:
        3
    }
  }

  if (
    Number(
      attackerRow.wanted
    ) >=
    MAX_WANTED
  ) {
    return {
      success: false,
      reason:
        'WANTED_MAX'
    }
  }

  const stealable =
    Math.max(
      0,
      Number(target.money) -
      WALLET_PROTECTION
    )

  if (
    stealable < 25
  ) {
    return {
      success: false,
      reason:
        'TARGET_PROTECTED',
      protected:
        WALLET_PROTECTION
    }
  }

  const now =
    Date.now()

  const globalUntil =
    cooldownUntil(
      attackerId,
      'maling_global'
    )

  if (
    globalUntil >
    now
  ) {
    return {
      success: false,
      reason:
        'GLOBAL_COOLDOWN',
      cooldown:
        globalUntil -
        now
    }
  }

  const targetUntil =
    cooldownUntil(
      attackerId,
      cooldownKey(
        targetId
      )
    )

  if (
    targetUntil >
    now
  ) {
    return {
      success: false,
      reason:
        'TARGET_COOLDOWN',
      cooldown:
        targetUntil -
        now
    }
  }

  // =================================
  // DETERMINE RESULT
  // =================================

  const attackerScore =
    crimePower(
      attackerJid,
      attackerRow
    )

  const targetScore =
    securityPower(
      targetJid,
      target
    )

  const won =
    attackerScore >
    targetScore

  return transaction(
    () => {
      // Re-read balances inside lock.
      const freshAttacker =
        profileById(
          attackerId
        )

      const freshTarget =
        profileById(
          targetId
        )

      if (
        !freshAttacker ||
        !freshTarget
      ) {
        return {
          success: false,
          reason:
            'PROFILE_CHANGED'
        }
      }

      const freshStealable =
        Math.max(
          0,
          Number(
            freshTarget.money
          ) -
          WALLET_PROTECTION
        )

      if (
        freshStealable < 25
      ) {
        return {
          success: false,
          reason:
            'TARGET_PROTECTED',
          protected:
            WALLET_PROTECTION
        }
      }

      setCooldown(
        attackerId,
        'maling_global',
        now +
        GLOBAL_COOLDOWN
      )

      setCooldown(
        attackerId,
        cooldownKey(
          targetId
        ),
        now +
        TARGET_COOLDOWN
      )

      const wantedAfter =
        Math.min(
          MAX_WANTED,
          Number(
            freshAttacker.wanted
          ) +
          1
        )

      // =================================
      // SUCCESS
      // =================================

      if (won) {
        const amount =
          Math.min(
            MAX_THEFT,
            freshStealable,
            Math.max(
              25,
              Math.floor(
                freshStealable *
                0.08
              )
            )
          )

        const attackerMoney =
          Number(
            freshAttacker.money
          ) +
          amount

        const targetMoney =
          Number(
            freshTarget.money
          ) -
          amount

        db.prepare(`
          UPDATE rpg_profiles
          SET
            money = ?,
            wanted = ?,
            updated_at = ?

          WHERE player_id = ?
        `).run(
          attackerMoney,
          wantedAfter,
          now,
          attackerId
        )

        db.prepare(`
          UPDATE rpg_profiles
          SET
            money = ?,
            updated_at = ?

          WHERE player_id = ?
        `).run(
          targetMoney,
          now,
          targetId
        )

        moneyLog({
          playerId:
            attackerId,

          delta:
            amount,

          walletAfter:
            attackerMoney,

          bankAfter:
            Number(
              freshAttacker.bank_money
            ) || 0,

          reason:
            'crime_theft_gain',

          note:
            `target:${targetId}`
        })

        moneyLog({
          playerId:
            targetId,

          delta:
            -amount,

          walletAfter:
            targetMoney,

          bankAfter:
            Number(
              freshTarget.bank_money
            ) || 0,

          reason:
            'crime_stolen',

          note:
            `actor:${attackerId}`
        })

        return {
          success: true,
          outcome:
            'SUCCESS',

          amount,
          wanted:
            wantedAfter,

          attackerMoney,
          targetMoney,

          targetName:
            freshTarget.name ||
            'Player',

          attackerScore,
          targetScore,

          scenario:
            successScenario()
        }
      }

      // =================================
      // FAILED
      // =================================

      const fine =
        Math.min(
          Number(
            freshAttacker.money
          ) || 0,

          Math.min(
            500,
            100 +
            Number(
              freshAttacker.level
            ) *
            25
          )
        )

      const attackerMoney =
        Math.max(
          0,
          Number(
            freshAttacker.money
          ) -
          fine
        )

      db.prepare(`
        UPDATE rpg_profiles
        SET
          money = ?,
          wanted = ?,
          updated_at = ?

        WHERE player_id = ?
      `).run(
        attackerMoney,
        wantedAfter,
        now,
        attackerId
      )

      if (
        fine > 0
      ) {
        moneyLog({
          playerId:
            attackerId,

          delta:
            -fine,

          walletAfter:
            attackerMoney,

          bankAfter:
            Number(
              freshAttacker.bank_money
            ) || 0,

          reason:
            'crime_failed_fine',

          note:
            `target:${targetId}`
        })
      }

      return {
        success: true,
        outcome:
          'FAILED',

        fine,
        wanted:
          wantedAfter,

        attackerMoney,

        targetName:
          freshTarget.name ||
          'Player',

        attackerScore,
        targetScore,

        scenario:
          failScenario()
      }
    }
  )
}

// =====================================
// STATUS
// =====================================

export function getCrimeStatus(
  jid
) {
  const profile =
    ensureRpgProfile(
      jid
    )

  if (!profile) {
    return null
  }

  const row =
    profileById(
      profile.playerId
    )

  const wanted =
    Number(
      row?.wanted
    ) || 0

  return {
    wanted,

    maxWanted:
      MAX_WANTED,

    fine:
      wanted *
      750,

    globalCooldown:
      Math.max(
        0,
        cooldownUntil(
          profile.playerId,
          'maling_global'
        ) -
        Date.now()
      )
  }
}

// =====================================
// PAY FINE
// =====================================

export function payCrimeFine(
  jid
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

  return transaction(
    () => {
      const row =
        profileById(
          profile.playerId
        )

      if (!row) {
        return {
          success: false,
          reason:
            'NO_PROFILE'
        }
      }

      const wanted =
        Number(
          row.wanted
        ) || 0

      if (
        wanted <= 0
      ) {
        return {
          success: false,
          reason:
            'NO_WANTED'
        }
      }

      const fine =
        wanted *
        750

      const money =
        Number(
          row.money
        ) || 0

      if (
        money <
        fine
      ) {
        return {
          success: false,
          reason:
            'MONEY_LOW',

          fine,

          missing:
            fine -
            money,

          money
        }
      }

      const next =
        money -
        fine

      const now =
        Date.now()

      db.prepare(`
        UPDATE rpg_profiles
        SET
          money = ?,
          wanted = 0,
          updated_at = ?

        WHERE player_id = ?
      `).run(
        next,
        now,
        profile.playerId
      )

      moneyLog({
        playerId:
          profile.playerId,

        delta:
          -fine,

        walletAfter:
          next,

        bankAfter:
          Number(
            row.bank_money
          ) || 0,

        reason:
          'crime_payfine',

        note:
          `wanted:${wanted}`
      })

      return {
        success: true,
        paid:
          fine,

        oldWanted:
          wanted,

        money:
          next
      }
    }
  )
}
