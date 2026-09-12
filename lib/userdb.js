// NEXA USERDB ATOMIC ECONOMY V1
import {
  getPlayer,
  resolvePlayerId,
  listPlayers,
  mutatePlayerAtomic
} from './playerdb.js'

// =====================================
// USER KEY
// =====================================

export function userKey(jid) {
  return (
    resolvePlayerId(
      jid,
      true
    ) || ''
  )
}

// =====================================
// DEFAULT VIEW
// =====================================

function defaultUser() {
  return {
    playerId: null,

    name: null,
    age: null,
    gender: null,

    registeredAt: null,

    banned: false,

    premium: false,
    premiumUntil: null,

    limit: 10,
    coin: 0,

    level: 0,
    exp: 0,

    lastDaily: 0,

    createdAt: 0,
    updatedAt: 0
  }
}

// =====================================
// GET / ENSURE
// =====================================

export function getUser(jid) {
  return (
    getPlayer(jid) ||
    defaultUser()
  )
}

export function ensureUser(jid) {
  const user =
    getPlayer(jid)

  if (!user) {
    throw new Error(
      'INVALID_USER_JID'
    )
  }

  return user
}

// =====================================
// ATOMIC MUTATION
// =====================================

export function mutateUserAtomic(
  jid,
  mutator,
  reason =
    'mutateUserAtomic'
) {
  return mutatePlayerAtomic(
    jid,
    mutator,
    reason
  )
}

export function updateUser(
  jid,
  changes,
  reason =
    'updateUser'
) {
  const result =
    mutatePlayerAtomic(
      jid,
      () => ({
        changes:
          changes || {}
      }),
      reason
    )

  return result.user
}

// =====================================
// LEVEL
// =====================================

export function getRequiredExp(
  level
) {
  return (
    100 +
    Math.max(
      0,
      Number(level) || 0
    ) * 50
  )
}

export function addExp(
  jid,
  amount
) {
  const add =
    Math.max(
      0,
      Math.trunc(
        Number(amount) || 0
      )
    )

  const result =
    mutatePlayerAtomic(
      jid,
      user => {
        const oldLevel =
          Number(
            user.level
          ) || 0

        let exp =
          (
            Number(
              user.exp
            ) || 0
          ) +
          add

        let level =
          oldLevel

        while (true) {
          const required =
            getRequiredExp(
              level
            )

          if (
            exp <
            required
          ) {
            break
          }

          exp -=
            required

          level += 1
        }

        return {
          changes: {
            exp,
            level
          },

          meta: {
            oldLevel,
            leveledUp:
              level >
              oldLevel,
            levelsGained:
              level -
              oldLevel
          }
        }
      },
      'addExp'
    )

  return {
    ...result.user,
    ...result.meta
  }
}

// =====================================
// COIN
// =====================================

export function addCoin(
  jid,
  amount
) {
  const add =
    Math.trunc(
      Number(amount) || 0
    )

  return mutatePlayerAtomic(
    jid,
    user => ({
      changes: {
        coin:
          Math.max(
            0,
            (
              Number(
                user.coin
              ) || 0
            ) +
            add
          )
      }
    }),
    'addCoin'
  ).user
}

export function spendCoin(
  jid,
  amount
) {
  const cost =
    Math.max(
      0,
      Math.trunc(
        Number(amount) || 0
      )
    )

  const result =
    mutatePlayerAtomic(
      jid,
      user => {
        const balance =
          Number(
            user.coin
          ) || 0

        if (
          balance <
          cost
        ) {
          return {
            changes: {},

            meta: {
              success: false,
              missing:
                cost -
                balance
            }
          }
        }

        return {
          changes: {
            coin:
              balance -
              cost
          },

          meta: {
            success: true,
            missing: 0
          }
        }
      },
      'spendCoin'
    )

  return {
    success:
      Boolean(
        result.meta
          ?.success
      ),

    user:
      result.user,

    missing:
      Number(
        result.meta
          ?.missing
      ) || 0
  }
}

// =====================================
// LIMIT
// =====================================

export function addLimit(
  jid,
  amount
) {
  const add =
    Math.trunc(
      Number(amount) || 0
    )

  return mutatePlayerAtomic(
    jid,
    user => ({
      changes: {
        limit:
          Math.max(
            0,
            (
              Number(
                user.limit
              ) || 0
            ) +
            add
          )
      }
    }),
    'addLimit'
  ).user
}

export function useLimit(
  jid,
  amount = 1
) {
  const cost =
    Math.max(
      0,
      Math.trunc(
        Number(amount) || 0
      )
    )

  const result =
    mutatePlayerAtomic(
      jid,
      user => {
        const balance =
          Number(
            user.limit
          ) || 0

        if (
          balance <
          cost
        ) {
          return {
            changes: {},

            meta: {
              success: false
            }
          }
        }

        return {
          changes: {
            limit:
              balance -
              cost
          },

          meta: {
            success: true
          }
        }
      },
      'useLimit'
    )

  return {
    success:
      Boolean(
        result.meta
          ?.success
      ),

    user:
      result.user
  }
}

// =====================================
// DAILY - ATOMIC ACROSS PROCESSES
// =====================================

function getJakartaDateKey(
  timestamp = Date.now()
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

export function claimDailyRewards(
  jid,
  {
    limitReward = 10,
    coinReward = 50,
    now = Date.now()
  } = {}
) {
  const cleanLimit =
    Math.max(
      0,
      Math.trunc(
        Number(
          limitReward
        ) || 0
      )
    )

  const cleanCoin =
    Math.max(
      0,
      Math.trunc(
        Number(
          coinReward
        ) || 0
      )
    )

  const claimAt =
    Number(now) ||
    Date.now()

  const today =
    getJakartaDateKey(
      claimAt
    )

  const result =
    mutatePlayerAtomic(
      jid,
      user => {
        const last =
          Number(
            user.lastDaily
          ) || 0

        if (
          last &&
          getJakartaDateKey(
            last
          ) === today
        ) {
          return {
            changes: {},

            meta: {
              claimed: false
            }
          }
        }

        return {
          changes: {
            limit:
              (
                Number(
                  user.limit
                ) || 0
              ) +
              cleanLimit,

            coin:
              (
                Number(
                  user.coin
                ) || 0
              ) +
              cleanCoin,

            lastDaily:
              claimAt
          },

          meta: {
            claimed: true
          }
        }
      },
      'daily'
    )

  return {
    claimed:
      Boolean(
        result.meta
          ?.claimed
      ),

    user:
      result.user
  }
}

// =====================================
// PREMIUM
// =====================================

export function isPremium(jid) {
  const user =
    getUser(jid)

  const until =
    Number(
      user.premiumUntil
    ) || 0

  if (
    user.premium &&
    until >
      Date.now()
  ) {
    return true
  }

  if (
    user.premium &&
    until <=
      Date.now()
  ) {
    updateUser(
      jid,
      {
        premium: false,
        premiumUntil: null
      },
      'premiumExpiry'
    )
  }

  return false
}

export function addPremium(
  jid,
  days
) {
  const duration =
    Math.max(
      1,
      Number(days) || 1
    ) *
    24 *
    60 *
    60 *
    1000

  const now =
    Date.now()

  return mutatePlayerAtomic(
    jid,
    user => {
      const current =
        Number(
          user.premiumUntil
        ) || 0

      const base =
        current > now
          ? current
          : now

      return {
        changes: {
          premium: true,

          premiumUntil:
            base +
            duration
        }
      }
    },
    'addPremium'
  ).user
}

// =====================================
// BAN
// =====================================

export function getBannedUsers() {
  return listPlayers()
    .filter(
      user =>
        user.banned
    )
    .map(
      user =>
        user.jid
    )
    .filter(Boolean)
}
