import fs from 'fs'

import {
  getTarget
} from './group.js'

import {
  getUser,
  updateUser,
  getRequiredExp
} from './userdb.js'

import { listPlayers } from './playerdb.js'

const USERS_FILE =
  './database/users.json'

// =====================================
// MESSAGE
// =====================================

export function getCommandText(
  msg
) {
  const m =
    msg?.message || {}

  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    ''
  )
}

export function getArgs(
  msg
) {
  return getCommandText(msg)
    .trim()
    .split(/\s+/)
    .slice(1)
}

export function getRest(
  msg
) {
  return getArgs(msg)
    .join(' ')
    .trim()
}

// =====================================
// TARGET
// =====================================

export function getOwnerTarget(
  msg
) {
  return getTarget(msg)
}

// =====================================
// NUMBER
// =====================================

export function findNumber(
  msg
) {
  const args =
    getArgs(msg)

  for (
    let i =
      args.length - 1;
    i >= 0;
    i--
  ) {
    const cleaned =
      String(args[i])
        .replace(/[^\d-]/g, '')

    if (
      cleaned &&
      /^-?\d+$/.test(cleaned)
    ) {
      return Number(cleaned)
    }
  }

  return null
}

export function formatNumber(
  value
) {
  return Number(value || 0)
    .toLocaleString(
      'id-ID'
    )
}

export function formatDate(
  timestamp
) {
  if (!timestamp) {
    return '-'
  }

  try {
    return new Intl.DateTimeFormat(
      'id-ID',
      {
        dateStyle:
          'long',

        timeStyle:
          'short',

        timeZone:
          'Asia/Jakarta'
      }
    ).format(
      new Date(timestamp)
    )
  } catch {
    return '-'
  }
}

// =====================================
// SETTERS
// =====================================

export function setLimit(
  jid,
  amount
) {
  return updateUser(
    jid,
    {
      limit:
        Math.max(
          0,
          Math.floor(amount)
        )
    }
  )
}

export function setCoin(
  jid,
  amount
) {
  return updateUser(
    jid,
    {
      coin:
        Math.max(
          0,
          Math.floor(amount)
        )
    }
  )
}

export function setLevel(
  jid,
  level
) {
  return updateUser(
    jid,
    {
      level:
        Math.max(
          0,
          Math.floor(level)
        ),

      exp: 0
    }
  )
}

// =====================================
// PREMIUM
// =====================================

export function removePremium(
  jid
) {
  return updateUser(
    jid,
    {
      premium: false,
      premiumUntil: null
    }
  )
}

export function getPremiumUsers() {
  const now =
    Date.now()

  return listPlayers()
    .filter(
      user =>
        user.premium === true &&
        Number(
          user.premiumUntil
        ) > now
    )
    .sort(
      (a, b) =>
        Number(
          a.premiumUntil
        ) -
        Number(
          b.premiumUntil
        )
    )
}

// =====================================
// USER STATS
// =====================================

export function userStats(
  jid
) {
  const user =
    getUser(jid)

  return {
    ...user,

    requiredExp:
      getRequiredExp(
        user.level
      )
  }
}

// =====================================
// RESET
// =====================================

export function resetUser(
  jid
) {
  const old =
    getUser(jid)

  return updateUser(
    jid,
    {
      name: null,
      age: null,
      gender: null,
      registeredAt: null,

      premium: false,
      premiumUntil: null,

      limit: 10,
      coin: 0,

      level: 0,
      exp: 0,

      lastDaily: 0,

      // Ban & tanggal pembuatan
      // sengaja tidak dihapus.
      banned:
        old.banned,

      createdAt:
        old.createdAt
    }
  )
}
