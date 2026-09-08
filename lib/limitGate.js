import config from '../config.js'

import {
  getUser,
  isPremium,
  useLimit
} from './userdb.js'

import {
  getProfileJid
} from './profile.js'

import {
  limitHabisMessage
} from './limitMessage.js'

// =====================================
// NEXA LIMIT GATE
// =====================================

// Command yang dipotong otomatis
// oleh middleware di index.js.
//
// GAME TIDAK dimasukkan di sini.
// Game dipotong langsung oleh startRound()
// supaya cooldown/round aktif tidak merugikan user.

const COMMAND_COSTS = {
  // Downloader
  pin: 1,
  pindl: 1,

  tiktok: 1,

  instagram: 1,
  ig: 1,

  twitter: 1,
  x: 1,

  facebook: 1,
  fb: 1,

  ytmp3: 1,
  ytmp4: 2,

  gdrive: 1,
  mediafire: 1
}

// =====================================
// OWNER
// =====================================

function digits(value) {
  return String(value || '')
    .split('@')[0]
    .replace(/\D/g, '')
}

export function isLimitOwner(
  msg,
  userJid
) {
  // Command dari nomor bot sendiri.
  if (
    msg?.key?.fromMe
  ) {
    return true
  }

  const targetNumber =
    digits(userJid)

  if (!targetNumber) {
    return false
  }

  const ownerNumbers =
    Array.isArray(
      config.owner
    )
      ? config.owner
      : []

  for (
    const owner
    of ownerNumbers
  ) {
    if (
      digits(owner) ===
      targetNumber
    ) {
      return true
    }
  }

  const ownerJids =
    Array.isArray(
      config.ownerJids
    )
      ? config.ownerJids
      : []

  for (
    const owner
    of ownerJids
  ) {
    if (
      digits(owner) ===
      targetNumber
    ) {
      return true
    }
  }

  return false
}

// =====================================
// COMMAND COST
// =====================================

export function getLimitCost(
  commandName
) {
  const name =
    String(
      commandName || ''
    )
      .trim()
      .toLowerCase()

  return (
    COMMAND_COSTS[name] ||
    0
  )
}

// =====================================
// USER ACCESS
// =====================================

export function getLimitAccess(
  msg,
  jid
) {
  const userJid =
    getProfileJid(
      msg,
      jid
    )

  const owner =
    isLimitOwner(
      msg,
      userJid
    )

  const premium =
    !owner &&
    isPremium(
      userJid
    )

  const user =
    getUser(
      userJid
    )

  return {
    userJid,
    user,
    owner,
    premium,
    unlimited:
      owner ||
      premium
  }
}

// =====================================
// PRECHECK
// =====================================

export function canUseLimit({
  msg,
  jid,
  cost
}) {
  const access =
    getLimitAccess(
      msg,
      jid
    )

  if (
    access.unlimited ||
    cost <= 0
  ) {
    return {
      allowed: true,
      ...access
    }
  }

  if (
    access.user.limit <
    cost
  ) {
    return {
      allowed: false,
      ...access
    }
  }

  return {
    allowed: true,
    ...access
  }
}

// =====================================
// CHARGE
// =====================================

export function chargeLimit({
  msg,
  jid,
  cost
}) {
  const access =
    getLimitAccess(
      msg,
      jid
    )

  if (
    access.unlimited ||
    cost <= 0
  ) {
    return {
      success: true,
      charged: false,
      ...access
    }
  }

  const result =
    useLimit(
      access.userJid,
      cost
    )

  return {
    success:
      result.success,

    charged:
      result.success,

    user:
      result.user,

    userJid:
      access.userJid,

    owner: false,
    premium: false,
    unlimited: false
  }
}

// =====================================
// LIMIT EMPTY RESPONSE
// =====================================

export async function sendLimitEmpty({
  sock,
  msg,
  jid
}) {
  return sock.sendMessage(
    jid,
    {
      text:
        limitHabisMessage(
          config.prefix
        )
    },
    {
      quoted:
        msg
    }
  )
}

// =====================================
// DOWNLOADER GATE
// =====================================

export async function checkCommandLimit({
  sock,
  msg,
  jid,
  commandName
}) {
  const cost =
    getLimitCost(
      commandName
    )

  // Command tidak memakai limit.
  if (cost <= 0) {
    return {
      allowed: true,
      cost: 0,
      charged: false
    }
  }

  const access =
    canUseLimit({
      msg,
      jid,
      cost
    })

  if (
    !access.allowed
  ) {
    await sendLimitEmpty({
      sock,
      msg,
      jid
    })

    return {
      allowed: false,
      cost,
      charged: false
    }
  }

  // Owner / Premium
  if (
    access.unlimited
  ) {
    return {
      allowed: true,
      cost,
      charged: false,
      unlimited: true
    }
  }

  const payment =
    chargeLimit({
      msg,
      jid,
      cost
    })

  if (
    !payment.success
  ) {
    await sendLimitEmpty({
      sock,
      msg,
      jid
    })

    return {
      allowed: false,
      cost,
      charged: false
    }
  }

  return {
    allowed: true,
    cost,
    charged: true,
    remaining:
      payment.user.limit
  }
}
