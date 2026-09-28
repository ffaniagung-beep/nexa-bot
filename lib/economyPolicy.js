// NEXA ECONOMY POLICY V2
import {
  DatabaseSync
} from 'node:sqlite'

import {
  resolvePlayerId
} from './playerdb.js'

const db =
  new DatabaseSync(
    './database/nexa.sqlite',
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

function rollback() {
  try {
    db.exec(
      'ROLLBACK'
    )
  } catch {}
}

function cleanPositiveInt(
  value
) {
  return Math.max(
    0,
    Math.trunc(
      Number(value) ||
      0
    )
  )
}


function insertEconomyLog({
  playerId,
  metric,
  delta,
  balanceAfter,
  reason,
  now
}) {
  const cleanDelta =
    Math.trunc(
      Number(delta) ||
      0
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
    String(
      reason ||
      'economyV2'
    ),
    now
  )
}

export function purchaseShopItemAtomic(
  jid,
  item
) {
  const playerId =
    resolvePlayerId(
      jid,
      false
    )

  if (!playerId) {
    return {
      success: false,
      reason:
        'PLAYER_NOT_FOUND'
    }
  }

  const price =
    cleanPositiveInt(
      item?.price
    )

  const type =
    String(
      item?.type ||
      ''
    ).trim()

  if (
    price <= 0 ||
    ![
      'limit',
      'premium'
    ].includes(type)
  ) {
    return {
      success: false,
      reason:
        'ITEM_INVALID'
    }
  }

  const now =
    Date.now()

  db.exec(
    'BEGIN IMMEDIATE'
  )

  try {
    const row =
      db.prepare(`
        SELECT
          coin,
          limit_value,
          premium,
          premium_until
        FROM players
        WHERE id = ?
      `).get(
        playerId
      )

    if (!row) {
      rollback()

      return {
        success: false,
        reason:
          'PLAYER_NOT_FOUND'
      }
    }

    const coin =
      Number(
        row.coin
      ) || 0

    if (
      coin <
      price
    ) {
      rollback()

      return {
        success: false,
        reason:
          'COIN_LOW',
        missing:
          price -
          coin,
        user: {
          coin,
          limit:
            Number(
              row.limit_value
            ) || 0,
          premium:
            Boolean(
              row.premium
            ),
          premiumUntil:
            Number(
              row.premium_until
            ) || null
        }
      }
    }

    const nextCoin =
      coin -
      price

    let nextLimit =
      Number(
        row.limit_value
      ) || 0

    let nextPremium =
      Boolean(
        row.premium
      )

    let nextPremiumUntil =
      Number(
        row.premium_until
      ) || 0

    if (
      nextPremium &&
      nextPremiumUntil <= now
    ) {
      nextPremium =
        false

      nextPremiumUntil =
        0
    }

    if (
      type ===
      'limit'
    ) {
      const amount =
        cleanPositiveInt(
          item?.amount
        )

      if (amount <= 0) {
        throw new Error(
          'SHOP_LIMIT_AMOUNT_INVALID'
        )
      }

      nextLimit +=
        amount
    } else {
      const days =
        cleanPositiveInt(
          item?.days
        )

      if (days <= 0) {
        throw new Error(
          'SHOP_PREMIUM_DAYS_INVALID'
        )
      }

      const base =
        nextPremium &&
        nextPremiumUntil > now
          ? nextPremiumUntil
          : now

      nextPremium =
        true

      nextPremiumUntil =
        base +
        days *
        86400000
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
      nextPremium
        ? 1
        : 0,
      nextPremiumUntil ||
        null,
      now,
      playerId
    )

    insertEconomyLog({
      playerId,
      metric:
        'coin',
      delta:
        -price,
      balanceAfter:
        nextCoin,
      reason:
        'shop_purchase',
      now
    })

    if (
      type ===
      'limit'
    ) {
      insertEconomyLog({
        playerId,
        metric:
          'limit',
        delta:
          cleanPositiveInt(
            item?.amount
          ),
        balanceAfter:
          nextLimit,
        reason:
          'shop_purchase',
        now
      })
    }

    db.exec(
      'COMMIT'
    )

    return {
      success: true,
      reason:
        'OK',
      user: {
        coin:
          nextCoin,
        limit:
          nextLimit,
        premium:
          nextPremium,
        premiumUntil:
          nextPremiumUntil ||
          null
      }
    }
  } catch (
    error
  ) {
    rollback()
    throw error
  }
}

// NEXA_DAILY_LIMIT_REFILL_V1
const dailyLimitRefillCache =
  new Map()

function getJakartaDayKey(
  timestamp =
    Date.now()
) {
  return new Intl.DateTimeFormat(
    'en-CA',
    {
      timeZone:
        'Asia/Jakarta',

      year:
        'numeric',

      month:
        '2-digit',

      day:
        '2-digit'
    }
  ).format(
    new Date(timestamp)
  )
}

function getJakartaDayStart(
  timestamp =
    Date.now()
) {
  const [
    year,
    month,
    day
  ] =
    getJakartaDayKey(
      timestamp
    )
      .split('-')
      .map(Number)

  return (
    Date.UTC(
      year,
      month - 1,
      day,
      0,
      0,
      0,
      0
    ) -
    7 * 60 * 60 * 1000
  )
}

export function ensureDailyLimitFloor(
  jid,
  floor = 10,
  {
    now =
      Date.now()
  } = {}
) {
  const playerId =
    resolvePlayerId(
      jid,
      false
    )

  if (!playerId) {
    return {
      success: false,
      reason:
        'PLAYER_NOT_FOUND',
      refilled: false,
      delta: 0
    }
  }

  const refillAt =
    Number(now) ||
    Date.now()

  const day =
    getJakartaDayKey(
      refillAt
    )

  if (
    dailyLimitRefillCache.get(
      playerId
    ) === day
  ) {
    return {
      success: true,
      refilled: false,
      cached: true,
      day
    }
  }

  const minimum =
    Math.max(
      0,
      Math.trunc(
        Number(floor) || 0
      )
    )

  const dayStart =
    getJakartaDayStart(
      refillAt
    )

  db.exec(
    'BEGIN IMMEDIATE'
  )

  try {
    const row =
      db.prepare(`
        SELECT limit_value
        FROM players
        WHERE id = ?
      `).get(
        playerId
      )

    if (!row) {
      rollback()

      return {
        success: false,
        reason:
          'PLAYER_NOT_FOUND',
        refilled: false,
        delta: 0
      }
    }

    const marker =
      db.prepare(`
        SELECT 1 AS found
        FROM economy_log
        WHERE player_id = ?
          AND metric = 'limit'
          AND reason = 'dailyLimitRefill'
          AND created_at >= ?
        LIMIT 1
      `).get(
        playerId,
        dayStart
      )

    const current =
      Math.max(
        0,
        Number(
          row.limit_value
        ) || 0
      )

    if (marker?.found) {
      db.exec(
        'COMMIT'
      )

      dailyLimitRefillCache.set(
        playerId,
        day
      )

      return {
        success: true,
        refilled: false,
        delta: 0,
        limit:
          current,
        floor:
          minimum,
        day
      }
    }

    const next =
      Math.max(
        current,
        minimum
      )

    const delta =
      next -
      current

    if (delta > 0) {
      db.prepare(`
        UPDATE players
        SET
          limit_value = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        next,
        refillAt,
        playerId
      )
    }

    // Marker harian tetap dicatat walau saldo sudah >= floor.
    // Jadi Limit tidak refill dua kali di hari yang sama
    // setelah user memakai sebagian saldonya.
    db.prepare(`
      INSERT INTO economy_log (
        player_id,
        metric,
        delta,
        balance_after,
        reason,
        created_at
      )
      VALUES (?, 'limit', ?, ?, 'dailyLimitRefill', ?)
    `).run(
      playerId,
      delta,
      next,
      refillAt
    )

    db.exec(
      'COMMIT'
    )

    dailyLimitRefillCache.set(
      playerId,
      day
    )

    return {
      success: true,
      refilled:
        delta > 0,
      delta,
      previous:
        current,
      limit:
        next,
      floor:
        minimum,
      day
    }
  } catch (
    error
  ) {
    rollback()
    throw error
  }
}

// NEXA_GAME_ECONOMY_V2
export function grantGameCoin(
  jid,
  requestedCoin,
  {
    now =
      Date.now()
  } = {}
) {
  const playerId =
    resolvePlayerId(
      jid,
      false
    )

  if (!playerId) {
    return {
      success: false,
      reason:
        'PLAYER_NOT_FOUND',
      granted: 0,
      coin: 0
    }
  }

  const granted =
    cleanPositiveInt(
      requestedCoin
    )

  const claimAt =
    Number(now) ||
    Date.now()

  db.exec(
    'BEGIN IMMEDIATE'
  )

  try {
    const row =
      db.prepare(`
        SELECT coin
        FROM players
        WHERE id = ?
      `).get(
        playerId
      )

    if (!row) {
      rollback()

      return {
        success: false,
        reason:
          'PLAYER_NOT_FOUND',
        granted: 0,
        coin: 0
      }
    }

    const currentCoin =
      Number(
        row.coin
      ) || 0

    const nextCoin =
      currentCoin +
      granted

    if (granted > 0) {
      db.prepare(`
        UPDATE players
        SET
          coin = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        nextCoin,
        claimAt,
        playerId
      )

      insertEconomyLog({
        playerId,
        metric:
          'coin',
        delta:
          granted,
        balanceAfter:
          nextCoin,
        reason:
          'gameReward',
        now:
          claimAt
      })
    }

    db.exec(
      'COMMIT'
    )

    return {
      success: true,
      requested:
        granted,
      granted,
      coin:
        nextCoin
    }
  } catch (
    error
  ) {
    rollback()
    throw error
  }
}
