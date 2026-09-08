import fs from 'fs'

import {
  addCoin,
  addLimit,
  addPremium,
  userKey
} from './userdb.js'

const FILE =
  './database/redeems.json'

// =====================================
// DATABASE
// =====================================

function ensure() {
  if (
    !fs.existsSync(
      './database'
    )
  ) {
    fs.mkdirSync(
      './database',
      {
        recursive: true
      }
    )
  }

  if (
    !fs.existsSync(FILE)
  ) {
    fs.writeFileSync(
      FILE,
      '{}'
    )
  }
}

function read() {
  ensure()

  try {
    return JSON.parse(
      fs.readFileSync(
        FILE,
        'utf8'
      )
    )
  } catch {
    return {}
  }
}

function save(data) {
  ensure()

  fs.writeFileSync(
    FILE,
    JSON.stringify(
      data,
      null,
      2
    )
  )
}

// =====================================
// CODE
// =====================================

function codeKey(code) {
  return String(code || '')
    .trim()
    .toUpperCase()
}

export function getRedeem(
  code
) {
  const db =
    read()

  return (
    db[
      codeKey(code)
    ] ||
    null
  )
}

// =====================================
// CREATE
// =====================================

export function createRedeem({
  code,
  coin = 0,
  limit = 0,
  premiumDays = 0,
  premiumQuota = 0,
  expiresAt
}) {
  const db =
    read()

  const key =
    codeKey(code)

  if (!key) {
    throw new Error(
      'INVALID_CODE'
    )
  }

  if (db[key]) {
    throw new Error(
      'CODE_EXISTS'
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

  db[key] = {
    code:
      key,

    coin:
      rewardCoin,

    limit:
      rewardLimit,

    premiumDays:
      premDays,

    premiumQuota:
      premQuota,

    premiumClaimed:
      0,

    claimedBy:
      [],

    createdAt:
      Date.now(),

    expiresAt:
      Number(
        expiresAt
      )
  }

  save(db)

  return db[key]
}

// =====================================
// DELETE
// =====================================

export function deleteRedeem(
  code
) {
  const db =
    read()

  const key =
    codeKey(code)

  if (!db[key]) {
    return false
  }

  delete db[key]

  save(db)

  return true
}

// =====================================
// ACTIVE LIST
// =====================================

export function getRedeemList() {
  const db =
    read()

  return Object.values(db)
    .sort(
      (a, b) =>
        Number(
          b.createdAt
        ) -
        Number(
          a.createdAt
        )
    )
}

// =====================================
// CLAIM
// =====================================

export function claimRedeem(
  code,
  jid
) {
  const db =
    read()

  const key =
    codeKey(code)

  const redeem =
    db[key]

  if (!redeem) {
    return {
      success:
        false,

      reason:
        'NOT_FOUND'
    }
  }

  if (
    Number(
      redeem.expiresAt
    ) <= Date.now()
  ) {
    return {
      success:
        false,

      reason:
        'EXPIRED'
    }
  }

  const uid =
    userKey(jid)

  redeem.claimedBy =
    Array.isArray(
      redeem.claimedBy
    )
      ? redeem.claimedBy
      : []

  if (
    redeem.claimedBy.includes(
      uid
    )
  ) {
    return {
      success:
        false,

      reason:
        'ALREADY_CLAIMED'
    }
  }

  // =================================
  // PREMIUM QUOTA
  // =================================

  let premiumReceived =
    false

  if (
    redeem.premiumDays > 0 &&
    (
      redeem.premiumQuota <= 0 ||
      redeem.premiumClaimed <
        redeem.premiumQuota
    )
  ) {
    premiumReceived =
      true

    redeem.premiumClaimed =
      Number(
        redeem.premiumClaimed
      ) + 1
  }

  // Tandai redeemed SEBELUM hadiah diproses.
  redeem.claimedBy.push(
    uid
  )

  db[key] =
    redeem

  save(db)

  // =================================
  // REWARDS
  // =================================

  let user = null

  if (
    redeem.coin > 0
  ) {
    user =
      addCoin(
        jid,
        redeem.coin
      )
  }

  if (
    redeem.limit > 0
  ) {
    user =
      addLimit(
        jid,
        redeem.limit
      )
  }

  if (
    premiumReceived
  ) {
    user =
      addPremium(
        jid,
        redeem.premiumDays
      )
  }

  return {
    success:
      true,

    redeem,

    user,

    premiumReceived
  }
}
