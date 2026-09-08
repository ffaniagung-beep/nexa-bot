import path from 'node:path'
import { randomInt } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

import {
  resolvePlayerId
} from './playerdb.js'

import {
  getRequiredExp
} from './userdb.js'

const db =
  new DatabaseSync(
    path.resolve(
      './database/nexa.sqlite'
    )
  )

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS hoki_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    claim_key TEXT NOT NULL UNIQUE,
    player_id TEXT NOT NULL,
    claim_day TEXT NOT NULL,
    main_type TEXT NOT NULL,
    main_amount INTEGER NOT NULL,
    main_chance REAL NOT NULL,
    exp_amount INTEGER NOT NULL,
    luck_percent INTEGER NOT NULL,
    rarity TEXT NOT NULL,
    claimed_at INTEGER NOT NULL,

    FOREIGN KEY(player_id)
      REFERENCES players(id)
      ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS
    idx_hoki_player_time
  ON hoki_claims(
    player_id,
    claimed_at DESC
  );
`)

// =====================================
// 1000 tiket = presisi 0.1%
// =====================================

const MAIN = [
  { max: 350, type: 'limit',   amount: 1,    chance: 35,  rarity: 'COMMON',    luck: [15, 38] },
  { max: 600, type: 'limit',   amount: 2,    chance: 25,  rarity: 'COMMON',    luck: [30, 48] },
  { max: 750, type: 'limit',   amount: 3,    chance: 15,  rarity: 'COMMON',    luck: [42, 58] },
  { max: 850, type: 'limit',   amount: 5,    chance: 10,  rarity: 'UNCOMMON',  luck: [55, 68] },
  { max: 910, type: 'coin',    amount: 10,   chance: 6,   rarity: 'UNCOMMON',  luck: [62, 73] },
  { max: 950, type: 'coin',    amount: 25,   chance: 4,   rarity: 'RARE',      luck: [70, 79] },
  { max: 970, type: 'coin',    amount: 50,   chance: 2,   rarity: 'RARE',      luck: [78, 86] },
  { max: 980, type: 'coin',    amount: 100,  chance: 1,   rarity: 'EPIC',      luck: [86, 91] },
  { max: 988, type: 'coin',    amount: 250,  chance: 0.8, rarity: 'EPIC',      luck: [91, 94] },
  { max: 993, type: 'coin',    amount: 500,  chance: 0.5, rarity: 'LEGENDARY', luck: [94, 96] },
  { max: 997, type: 'limit',   amount: 10,   chance: 0.4, rarity: 'LEGENDARY', luck: [96, 97] },
  { max: 999, type: 'coin',    amount: 1000, chance: 0.2, rarity: 'MYTHIC',    luck: [98, 99] },
  { max: 1000,type: 'premium', amount: 2,    chance: 0.1, rarity: 'MYTHIC',    luck: [100,100] }
]

const EXP = [
  { max: 500, amount: 5 },
  { max: 800, amount: 10 },
  { max: 950, amount: 15 },
  { max: 990, amount: 25 },
  { max: 999, amount: 50 },
  { max: 1000, amount: 100 }
]

const WIB =
  7 * 60 * 60 * 1000

export function getHokiDay(
  now = Date.now()
) {
  const d =
    new Date(
      now + WIB
    )

  return [
    d.getUTCFullYear(),
    String(
      d.getUTCMonth() + 1
    ).padStart(2, '0'),
    String(
      d.getUTCDate()
    ).padStart(2, '0')
  ].join('-')
}

export function hokiResetIn(
  now = Date.now()
) {
  const d =
    new Date(
      now + WIB
    )

  const next =
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate() + 1
    ) -
    WIB

  return Math.max(
    0,
    next - now
  )
}

function pick(
  table
) {
  const roll =
    randomInt(
      1,
      1001
    )

  return table.find(
    item =>
      roll <= item.max
  )
}

function luckValue(
  reward
) {
  const [
    min,
    max
  ] = reward.luck

  return min === max
    ? min
    : randomInt(
        min,
        max + 1
      )
}

function applyExp(
  level,
  exp,
  amount
) {
  const oldLevel =
    Number(level) || 0

  let nextLevel =
    oldLevel

  let nextExp =
    (Number(exp) || 0) +
    amount

  let guard = 0

  while (
    guard++ < 10000
  ) {
    const need =
      Number(
        getRequiredExp(
          nextLevel
        )
      )

    if (
      !Number.isFinite(need) ||
      need <= 0 ||
      nextExp < need
    ) {
      break
    }

    nextExp -= need
    nextLevel += 1
  }

  return {
    oldLevel,
    level:
      nextLevel,
    exp:
      nextExp,
    levelUps:
      nextLevel - oldLevel
  }
}

function economyLog(
  playerId,
  metric,
  delta,
  balance,
  now
) {
  db.prepare(`
    INSERT INTO economy_log (
      player_id,
      metric,
      delta,
      balance_after,
      reason,
      created_at
    )
    VALUES (?, ?, ?, ?, 'hoki', ?)
  `).run(
    playerId,
    metric,
    delta,
    balance,
    now
  )
}

export function claimHoki({
  jid,
  isOwner = false
}) {
  const playerId =
    resolvePlayerId(
      jid,
      false
    )

  if (!playerId) {
    return {
      success: false,
      reason: 'PLAYER_NOT_FOUND'
    }
  }

  const now =
    Date.now()

  const day =
    getHokiDay(
      now
    )

  const normalKey =
    `${playerId}:${day}`

  db.exec(
    'BEGIN IMMEDIATE'
  )

  try {
    const user =
      db.prepare(`
        SELECT
          registered_at,
          premium,
          premium_until,
          limit_value,
          coin,
          level,
          exp

        FROM players
        WHERE id = ?
      `).get(
        playerId
      )

    if (
      !user ||
      !user.registered_at
    ) {
      db.exec(
        'ROLLBACK'
      )

      return {
        success: false,
        reason: 'NOT_REGISTERED'
      }
    }

    if (!isOwner) {
      const old =
        db.prepare(`
          SELECT *
          FROM hoki_claims
          WHERE claim_key = ?
          LIMIT 1
        `).get(
          normalKey
        )

      if (old) {
        db.exec(
          'ROLLBACK'
        )

        return {
          success: false,
          reason:
            'ALREADY_CLAIMED',
          previous:
            old,
          resetIn:
            hokiResetIn(now)
        }
      }
    }

    const main =
      pick(MAIN)

    const bonus =
      pick(EXP)

    let limit =
      Number(
        user.limit_value
      ) || 0

    let coin =
      Number(
        user.coin
      ) || 0

    let premium =
      Boolean(
        user.premium
      )

    let premiumUntil =
      Number(
        user.premium_until
      ) || 0

    if (
      premium &&
      premiumUntil <= now
    ) {
      premium = false
      premiumUntil = 0
    }

    if (
      main.type ===
      'limit'
    ) {
      limit +=
        main.amount
    }

    if (
      main.type ===
      'coin'
    ) {
      coin +=
        main.amount
    }

    if (
      main.type ===
        'premium' &&
      !isOwner
    ) {
      const base =
        premium &&
        premiumUntil > now
          ? premiumUntil
          : now

      premium = true

      premiumUntil =
        base +
        (
          main.amount *
          86400000
        )
    }

    const expResult =
      applyExp(
        user.level,
        user.exp,
        bonus.amount
      )

    db.prepare(`
      UPDATE players
      SET
        limit_value = ?,
        coin = ?,
        level = ?,
        exp = ?,
        premium = ?,
        premium_until = ?,
        updated_at = ?

      WHERE id = ?
    `).run(
      limit,
      coin,
      expResult.level,
      expResult.exp,
      premium ? 1 : 0,
      premiumUntil || null,
      now,
      playerId
    )

    if (
      main.type ===
      'limit'
    ) {
      economyLog(
        playerId,
        'limit',
        main.amount,
        limit,
        now
      )
    }

    if (
      main.type ===
      'coin'
    ) {
      economyLog(
        playerId,
        'coin',
        main.amount,
        coin,
        now
      )
    }

    economyLog(
      playerId,
      'exp',
      bonus.amount,
      expResult.exp,
      now
    )

    const claimKey =
      isOwner
        ? (
            `${playerId}:OWNER:` +
            `${now}:` +
            `${randomInt(
              100000,
              1000000
            )}`
          )
        : normalKey

    const luck =
      luckValue(
        main
      )

    db.prepare(`
      INSERT INTO hoki_claims (
        claim_key,
        player_id,
        claim_day,
        main_type,
        main_amount,
        main_chance,
        exp_amount,
        luck_percent,
        rarity,
        claimed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      claimKey,
      playerId,
      day,
      main.type,
      main.amount,
      main.chance,
      bonus.amount,
      luck,
      main.rarity,
      now
    )

    db.exec(
      'COMMIT'
    )

    return {
      success: true,
      isOwner,
      main,
      bonus,
      luck,
      limit,
      coin,
      level:
        expResult.level,
      exp:
        expResult.exp,
      oldLevel:
        expResult.oldLevel,
      levelUps:
        expResult.levelUps,
      premiumUntil:
        premiumUntil || null
    }
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
