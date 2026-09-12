// NEXA LIMIT GATE V2
import config from '../config.js'

import {
  getUser,
  isPremium,
  useLimit,
  addLimit
} from './userdb.js'

import {
  getProfileJid
} from './profile.js'

import {
  limitHabisMessage
} from './limitMessage.js'

// =====================================
// STATIC COMMAND COST POLICY
// =====================================
//
// Heavy commands with dynamic/transactional billing
// (APK, MediaFire, maker, AI, games) charge themselves.
//
// This table only handles commands that can be charged safely
// at the global command middleware layer.

const COMMAND_COSTS = {
  pindl: {
    normal: 1,
    premium: 1
  },

  tiktok: {
    normal: 2,
    premium: 1
  },

  instagram: {
    normal: 2,
    premium: 1
  },

  ig: {
    normal: 2,
    premium: 1
  },

  twitter: {
    normal: 2,
    premium: 1
  },

  x: {
    normal: 2,
    premium: 1
  },

  facebook: {
    normal: 2,
    premium: 1
  },

  fb: {
    normal: 2,
    premium: 1
  },

  ytmp3: {
    normal: 2,
    premium: 1
  },

  ytmp4: {
    normal: 3,
    premium: 2
  },

  gdrive: {
    normal: 3,
    premium: 2
  }
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

    // Economy V2:
    // Premium mendapat DISKON, bukan unlimited.
    // Hanya Owner yang bebas biaya Limit.
    unlimited:
      owner
  }
}

// =====================================
// COST HELPERS
// =====================================

function cleanCost(
  value
) {
  return Math.max(
    0,
    Math.trunc(
      Number(value) || 0
    )
  )
}

export function getEffectiveLimitCost(
  access,
  normalCost,
  premiumCost =
    normalCost
) {
  if (
    access?.owner
  ) {
    return 0
  }

  return access?.premium
    ? cleanCost(
        premiumCost
      )
    : cleanCost(
        normalCost
      )
}

export function getLimitCost(
  commandName,
  {
    premium = false,
    owner = false
  } = {}
) {
  if (owner) {
    return 0
  }

  const name =
    String(
      commandName || ''
    )
      .trim()
      .toLowerCase()

  const policy =
    COMMAND_COSTS[
      name
    ]

  if (!policy) {
    return 0
  }

  return premium
    ? cleanCost(
        policy.premium
      )
    : cleanCost(
        policy.normal
      )
}

// =====================================
// PRECHECK
// =====================================

export function canUseLimit({
  msg,
  jid,
  cost,
  premiumCost =
    cost
}) {
  const access =
    getLimitAccess(
      msg,
      jid
    )

  const finalCost =
    getEffectiveLimitCost(
      access,
      cost,
      premiumCost
    )

  if (
    access.owner ||
    finalCost <= 0
  ) {
    return {
      allowed: true,
      cost:
        finalCost,
      ...access
    }
  }

  if (
    Number(
      access.user
        ?.limit
    ) <
      finalCost
  ) {
    return {
      allowed: false,
      cost:
        finalCost,
      ...access
    }
  }

  return {
    allowed: true,
    cost:
      finalCost,
    ...access
  }
}

// =====================================
// CHARGE / REFUND
// =====================================

export function chargeLimit({
  msg,
  jid,
  cost,
  premiumCost =
    cost
}) {
  const access =
    getLimitAccess(
      msg,
      jid
    )

  const finalCost =
    getEffectiveLimitCost(
      access,
      cost,
      premiumCost
    )

  if (
    access.owner ||
    finalCost <= 0
  ) {
    return {
      success: true,
      charged: false,
      cost: 0,
      ...access
    }
  }

  const result =
    useLimit(
      access.userJid,
      finalCost
    )

  return {
    success:
      Boolean(
        result?.success
      ),

    charged:
      Boolean(
        result?.success
      ),

    cost:
      finalCost,

    user:
      result?.user ||
      access.user,

    userJid:
      access.userJid,

    owner:
      false,

    premium:
      access.premium,

    unlimited:
      false
  }
}

export function refundLimit(
  reservation,
  reason =
    'refund'
) {
  const cost =
    cleanCost(
      reservation?.cost
    )

  if (
    !reservation?.charged ||
    !reservation?.userJid ||
    cost <= 0
  ) {
    return {
      refunded: false,
      user:
        reservation?.user ||
        null,
      reason
    }
  }

  const user =
    addLimit(
      reservation.userJid,
      cost
    )

  reservation.charged =
    false

  reservation.refunded =
    true

  return {
    refunded: true,
    cost,
    user,
    reason
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
// GLOBAL COMMAND GATE
// =====================================

export async function checkCommandLimit({
  sock,
  msg,
  jid,
  commandName
}) {
  const access =
    getLimitAccess(
      msg,
      jid
    )

  const cost =
    getLimitCost(
      commandName,
      {
        owner:
          access.owner,
        premium:
          access.premium
      }
    )

  if (cost <= 0) {
    return {
      allowed: true,
      cost: 0,
      charged: false,
      ...access
    }
  }

  if (
    !access.owner &&
    Number(
      access.user
        ?.limit
    ) <
      cost
  ) {
    await sendLimitEmpty({
      sock,
      msg,
      jid
    })

    return {
      allowed: false,
      cost,
      charged: false,
      ...access
    }
  }

  const payment =
    chargeLimit({
      msg,
      jid,

      // Cost sudah final untuk tier user ini.
      cost,
      premiumCost:
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
      charged: false,
      ...access
    }
  }

  return {
    allowed: true,
    cost,
    charged:
      payment.charged,
    ...payment
  }
}
