import fs from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import {
  userKey
} from './userdb.js'
import {
  ensureDatabaseDirectory,
  runDatabaseMigrations
} from './dbMigrations.js'

const DB_FILE =
  './database/nexa.sqlite'

const LEGACY_FILE =
  './database/redeems.json'

ensureDatabaseDirectory(
  DB_FILE
)

const db =
  new DatabaseSync(
    DB_FILE,
    {
      timeout: 10000
    }
  )

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 10000;
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
`)

runDatabaseMigrations(
  db
)

function codeKey(code) {
  return String(code || '')
    .trim()
    .toUpperCase()
}

function rowToRedeem(
  row,
  claimedBy = null
) {
  if (!row) {
    return null
  }

  const claims =
    claimedBy ||
    db.prepare(`
      SELECT player_id
      FROM redeem_claims
      WHERE code = ?
      ORDER BY claimed_at ASC
    `).all(
      row.code
    ).map(
      item =>
        item.player_id
    )

  return {
    code:
      row.code,

    coin:
      Number(row.coin) || 0,

    limit:
      Number(
        row.limit_value
      ) || 0,

    premiumDays:
      Number(
        row.premium_days
      ) || 0,

    premiumQuota:
      Number(
        row.premium_quota
      ) || 0,

    premiumClaimed:
      Number(
        row.premium_claimed
      ) || 0,

    claimedBy:
      claims,

    createdAt:
      Number(
        row.created_at
      ) || 0,

    expiresAt:
      Number(
        row.expires_at
      ) || 0
  }
}

function migrateLegacyRedeemsOnce() {
  const migrationKey =
    'legacy_redeems_json_v1'

  const done =
    db.prepare(`
      SELECT value
      FROM core_settings_meta
      WHERE key = ?
    `).get(
      migrationKey
    )

  if (done) {
    return
  }

  let legacy = {}

  try {
    if (
      fs.existsSync(
        LEGACY_FILE
      )
    ) {
      const parsed =
        JSON.parse(
          fs.readFileSync(
            LEGACY_FILE,
            'utf8'
          )
        )

      if (
        parsed &&
        typeof parsed ===
          'object' &&
        !Array.isArray(parsed)
      ) {
        legacy = parsed
      }
    }
  } catch {
    legacy = {}
  }

  db.exec(
    'BEGIN IMMEDIATE'
  )

  try {
    const recheck =
      db.prepare(`
        SELECT value
        FROM core_settings_meta
        WHERE key = ?
      `).get(
        migrationKey
      )

    if (recheck) {
      db.exec('COMMIT')
      return
    }

    const insertRedeem =
      db.prepare(`
        INSERT OR IGNORE INTO redeems (
          code,
          coin,
          limit_value,
          premium_days,
          premium_quota,
          premium_claimed,
          created_at,
          expires_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)

    const insertClaim =
      db.prepare(`
        INSERT OR IGNORE INTO redeem_claims (
          code,
          player_id,
          premium_received,
          claimed_at
        )
        VALUES (?, ?, ?, ?)
      `)

    for (
      const [rawCode, value]
      of Object.entries(legacy)
    ) {
      const code =
        codeKey(
          value?.code ||
          rawCode
        )

      if (!code) {
        continue
      }

      const createdAt =
        Number(
          value?.createdAt
        ) ||
        Date.now()

      insertRedeem.run(
        code,
        Math.max(
          0,
          Math.trunc(
            Number(
              value?.coin
            ) || 0
          )
        ),
        Math.max(
          0,
          Math.trunc(
            Number(
              value?.limit
            ) || 0
          )
        ),
        Math.max(
          0,
          Math.trunc(
            Number(
              value?.premiumDays
            ) || 0
          )
        ),
        Math.max(
          0,
          Math.trunc(
            Number(
              value?.premiumQuota
            ) || 0
          )
        ),
        Math.max(
          0,
          Math.trunc(
            Number(
              value?.premiumClaimed
            ) || 0
          )
        ),
        createdAt,
        Number(
          value?.expiresAt
        ) ||
        createdAt
      )

      const claimedBy =
        Array.isArray(
          value?.claimedBy
        )
          ? value.claimedBy
          : []

      for (
        const rawPlayerId
        of claimedBy
      ) {
        const playerId =
          String(
            rawPlayerId || ''
          ).trim()

        if (!playerId) {
          continue
        }

        insertClaim.run(
          code,
          playerId,
          0,
          createdAt
        )
      }
    }

    db.prepare(`
      INSERT INTO core_settings_meta (
        key,
        value
      )
      VALUES (?, ?)
    `).run(
      migrationKey,
      String(Date.now())
    )

    db.exec('COMMIT')
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {}

    throw error
  }
}

migrateLegacyRedeemsOnce()

export function getRedeem(
  code
) {
  const key =
    codeKey(code)

  if (!key) {
    return null
  }

  const row =
    db.prepare(`
      SELECT *
      FROM redeems
      WHERE code = ?
    `).get(
      key
    )

  return rowToRedeem(
    row
  )
}

export function createRedeem({
  code,
  coin = 0,
  limit = 0,
  premiumDays = 0,
  premiumQuota = 0,
  expiresAt
}) {
  const key =
    codeKey(code)

  if (!key) {
    throw new Error(
      'INVALID_CODE'
    )
  }

  const rewardCoin =
    Math.max(
      0,
      Math.floor(
        Number(coin) || 0
      )
    )

  const rewardLimit =
    Math.max(
      0,
      Math.floor(
        Number(limit) || 0
      )
    )

  const premDays =
    Math.max(
      0,
      Math.floor(
        Number(
          premiumDays
        ) || 0
      )
    )

  const premQuota =
    premDays > 0
      ? Math.max(
          0,
          Math.floor(
            Number(
              premiumQuota
            ) || 0
          )
        )
      : 0

  if (
    rewardCoin <= 0 &&
    rewardLimit <= 0 &&
    premDays <= 0
  ) {
    throw new Error(
      'EMPTY_REWARD'
    )
  }

  const now =
    Date.now()

  try {
    db.prepare(`
      INSERT INTO redeems (
        code,
        coin,
        limit_value,
        premium_days,
        premium_quota,
        premium_claimed,
        created_at,
        expires_at
      )
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      key,
      rewardCoin,
      rewardLimit,
      premDays,
      premQuota,
      now,
      Number(expiresAt)
    )
  } catch (error) {
    if (
      String(
        error?.message || ''
      ).includes(
        'UNIQUE constraint failed'
      )
    ) {
      throw new Error(
        'CODE_EXISTS'
      )
    }

    throw error
  }

  return getRedeem(
    key
  )
}

export function deleteRedeem(
  code
) {
  const key =
    codeKey(code)

  if (!key) {
    return false
  }

  const result =
    db.prepare(`
      DELETE FROM redeems
      WHERE code = ?
    `).run(
      key
    )

  return (
    Number(
      result.changes
    ) > 0
  )
}

export function getRedeemList() {
  const rows =
    db.prepare(`
      SELECT *
      FROM redeems
      ORDER BY created_at DESC
    `).all()

  const claimRows =
    db.prepare(`
      SELECT
        code,
        player_id
      FROM redeem_claims
      ORDER BY claimed_at ASC
    `).all()

  const claims =
    new Map()

  for (
    const claim
    of claimRows
  ) {
    const list =
      claims.get(
        claim.code
      ) || []

    list.push(
      claim.player_id
    )

    claims.set(
      claim.code,
      list
    )
  }

  return rows.map(
    row =>
      rowToRedeem(
        row,
        claims.get(
          row.code
        ) || []
      )
  )
}

function logEconomyDelta(
  playerId,
  metric,
  delta,
  balanceAfter
) {
  const cleanDelta =
    Math.trunc(
      Number(delta) || 0
    )

  if (!cleanDelta) {
    return
  }

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
    playerId,
    metric,
    cleanDelta,
    Math.trunc(
      Number(
        balanceAfter
      ) || 0
    ),
    'redeem',
    Date.now()
  )
}

export function claimRedeem(
  code,
  jid
) {
  const key =
    codeKey(code)

  if (!key) {
    return {
      success: false,
      reason: 'NOT_FOUND'
    }
  }

  // Resolve/create identity sebelum transaksi redeem.
  // Reward + claim sendiri diproses dalam SATU transaksi SQLite.
  const uid =
    userKey(jid)

  if (!uid) {
    throw new Error(
      'INVALID_USER_JID'
    )
  }

  db.exec(
    'BEGIN IMMEDIATE'
  )

  try {
    const row =
      db.prepare(`
        SELECT *
        FROM redeems
        WHERE code = ?
      `).get(
        key
      )

    if (!row) {
      db.exec('ROLLBACK')

      return {
        success: false,
        reason: 'NOT_FOUND'
      }
    }

    if (
      Number(
        row.expires_at
      ) <= Date.now()
    ) {
      db.exec('ROLLBACK')

      return {
        success: false,
        reason: 'EXPIRED'
      }
    }

    const existingClaim =
      db.prepare(`
        SELECT 1 AS claimed
        FROM redeem_claims
        WHERE code = ?
          AND player_id = ?
      `).get(
        key,
        uid
      )

    if (
      existingClaim?.claimed
    ) {
      db.exec('ROLLBACK')

      return {
        success: false,
        reason: 'ALREADY_CLAIMED'
      }
    }

    const player =
      db.prepare(`
        SELECT *
        FROM players
        WHERE id = ?
      `).get(
        uid
      )

    if (!player) {
      throw new Error(
        'PLAYER_NOT_FOUND'
      )
    }

    const reward =
      rowToRedeem(
        row,
        []
      )

    const premiumReceived =
      reward.premiumDays > 0 &&
      (
        reward.premiumQuota <= 0 ||
        reward.premiumClaimed <
          reward.premiumQuota
      )

    const oldCoin =
      Number(player.coin) || 0

    const oldLimit =
      Number(
        player.limit_value
      ) || 0

    const nextCoin =
      Math.max(
        0,
        oldCoin +
        reward.coin
      )

    const nextLimit =
      Math.max(
        0,
        oldLimit +
        reward.limit
      )

    let premium =
      Boolean(
        player.premium
      )

    let premiumUntil =
      Number(
        player.premium_until
      ) ||
      null

    if (premiumReceived) {
      const now =
        Date.now()

      const base =
        Number(
          premiumUntil
        ) > now
          ? Number(
              premiumUntil
            )
          : now

      premium = true
      premiumUntil =
        base +
        reward.premiumDays *
        24 *
        60 *
        60 *
        1000
    }

    db.prepare(`
      UPDATE players
      SET
        coin = ?,
        limit_value = ?,
        premium = ?,
        premium_until = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      nextCoin,
      nextLimit,
      premium ? 1 : 0,
      premiumUntil,
      Date.now(),
      uid
    )

    logEconomyDelta(
      uid,
      'coin',
      nextCoin - oldCoin,
      nextCoin
    )

    logEconomyDelta(
      uid,
      'limit',
      nextLimit - oldLimit,
      nextLimit
    )

    db.prepare(`
      INSERT INTO redeem_claims (
        code,
        player_id,
        premium_received,
        claimed_at
      )
      VALUES (?, ?, ?, ?)
    `).run(
      key,
      uid,
      premiumReceived
        ? 1
        : 0,
      Date.now()
    )

    if (premiumReceived) {
      db.prepare(`
        UPDATE redeems
        SET premium_claimed =
          premium_claimed + 1
        WHERE code = ?
      `).run(
        key
      )
    }

    const updatedRow =
      db.prepare(`
        SELECT *
        FROM redeems
        WHERE code = ?
      `).get(
        key
      )

    db.exec('COMMIT')

    return {
      success: true,
      redeem:
        rowToRedeem(
          updatedRow,
          []
        ),
      user: {
        playerId: uid,
        coin: nextCoin,
        limit: nextLimit,
        premium,
        premiumUntil
      },
      premiumReceived
    }
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {}

    throw error
  }
}
