import {
  getPlayer,
  updatePlayer,
  resolvePlayerId,
  listPlayers,
  recordEconomyLog
} from './playerdb.js'

// =====================================
// USER KEY
//
// Sekarang key sebenarnya adalah
// internal playerId.
//
// Function ini tetap dipertahankan
// supaya command lama kompatibel.
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
// GET USER
// =====================================

export function getUser(jid) {
  return (
    getPlayer(jid) ||
    defaultUser()
  )
}

// =====================================
// ENSURE USER
// =====================================

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
// UPDATE USER
// =====================================

export function updateUser(
  jid,
  changes,
  reason = 'updateUser'
) {
  const before =
    getUser(jid)

  const user =
    updatePlayer(
      jid,
      changes
    )

  if (!user) {
    throw new Error(
      'INVALID_USER_JID'
    )
  }

  const tracked = [
    'coin',
    'limit',
    'exp',
    'level'
  ]

  for (
    const metric
    of tracked
  ) {
    if (
      !Object.hasOwn(
        changes || {},
        metric
      )
    ) {
      continue
    }

    const oldValue =
      Number(
        before?.[metric]
      ) || 0

    const newValue =
      Number(
        user?.[metric]
      ) || 0

    const delta =
      newValue -
      oldValue

    if (!delta) {
      continue
    }

    recordEconomyLog(
      jid,
      metric,
      delta,
      newValue,
      reason
    )
  }

  return user
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
  const user =
    getUser(jid)

  const oldLevel =
    user.level

  let exp =
    user.exp +
    Math.max(
      0,
      Number(amount) || 0
    )

  let level =
    user.level

  let leveledUp =
    false

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

    level++

    leveledUp =
      true
  }

  const updated =
    updateUser(
      jid,
      {
        exp,
        level
      },
      'addExp'
    )

  return {
    ...updated,

    oldLevel,

    leveledUp,

    levelsGained:
      level -
      oldLevel
  }
}

// =====================================
// COIN
// =====================================

export function addCoin(
  jid,
  amount
) {
  const user =
    getUser(jid)

  const add =
    Number(amount) || 0

  return updateUser(
    jid,
    {
      coin:
        Math.max(
          0,
          user.coin +
          add
        )
    },
    'addCoin'
  )
}

export function spendCoin(
  jid,
  amount
) {
  const user =
    getUser(jid)

  const cost =
    Math.max(
      0,
      Number(amount) || 0
    )

  if (
    user.coin <
    cost
  ) {
    return {
      success: false,

      user,

      missing:
        cost -
        user.coin
    }
  }

  const updated =
    updateUser(
      jid,
      {
        coin:
          user.coin -
          cost
      },
      'spendCoin'
    )

  return {
    success: true,

    user:
      updated,

    missing: 0
  }
}

// =====================================
// LIMIT
// =====================================

export function addLimit(
  jid,
  amount
) {
  const user =
    getUser(jid)

  const add =
    Number(amount) || 0

  return updateUser(
    jid,
    {
      limit:
        Math.max(
          0,
          user.limit +
          add
        )
    },
    'addLimit'
  )
}

export function useLimit(
  jid,
  amount = 1
) {
  const user =
    getUser(jid)

  const cost =
    Math.max(
      0,
      Number(amount) || 0
    )

  if (
    user.limit <
    cost
  ) {
    return {
      success: false,
      user
    }
  }

  const updated =
    updateUser(
      jid,
      {
        limit:
          user.limit -
          cost
      },
      'useLimit'
    )

  return {
    success: true,
    user: updated
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
      }
    )
  }

  return false
}

export function addPremium(
  jid,
  days
) {
  const user =
    getUser(jid)

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

  const current =
    Number(
      user.premiumUntil
    ) || 0

  const base =
    current > now
      ? current
      : now

  return updateUser(
    jid,
    {
      premium: true,

      premiumUntil:
        base +
        duration
    }
  )
}

// =====================================
// BAN
// =====================================
//
// Untuk sementara API ini tetap ada.
// List global akan kita pindahkan ke SQLite
// di tahap ownerTools/leaderboard berikutnya.
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
