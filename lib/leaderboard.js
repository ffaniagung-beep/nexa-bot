import config from '../config.js'

import {
  listPlayers
} from './playerdb.js'

// =====================================
// OWNER
// =====================================

function digits(value) {
  return String(
    value || ''
  )
    .split('@')[0]
    .replace(
      /\D/g,
      ''
    )
}

function isOwnerJid(jid) {
  const number =
    digits(jid)

  const owners =
    Array.isArray(
      config.owner
    )
      ? config.owner
      : []

  const ownerJids =
    Array.isArray(
      config.ownerJids
    )
      ? config.ownerJids
      : []

  return [
    ...owners,
    ...ownerJids
  ].some(
    value =>
      digits(value) ===
      number
  )
}

// =====================================
// LEADERBOARD
// =====================================

export function getLeaderboard(
  type = 'level',
  limit = 10
) {
  const safeLimit =
    Math.max(
      1,
      Math.floor(
        Number(limit) || 10
      )
    )

  const users =
    listPlayers()
      .filter(
        user =>
          user.jid &&
          !isOwnerJid(
            user.jid
          )
      )
      .map(
        user => ({
          jid:
            user.jid,

          level:
            Number(
              user.level
            ) || 0,

          exp:
            Number(
              user.exp
            ) || 0,

          coin:
            Number(
              user.coin
            ) || 0
        })
      )

  if (
    type === 'coin'
  ) {
    users.sort(
      (a, b) =>
        b.coin -
        a.coin
    )
  } else {
    users.sort(
      (a, b) => {
        if (
          b.level !==
          a.level
        ) {
          return (
            b.level -
            a.level
          )
        }

        return (
          b.exp -
          a.exp
        )
      }
    )
  }

  return users.slice(
    0,
    safeLimit
  )
}

// =====================================
// OWNER SPECIAL ENTRY
// =====================================

export function getOwnerEntry() {
  const owner =
    Array.isArray(
      config.owner
    )
      ? config.owner[0]
      : null

  if (!owner) {
    return null
  }

  const number =
    digits(owner)

  if (!number) {
    return null
  }

  return {
    jid:
      `${number}@s.whatsapp.net`
  }
}
