import {
  stableInt,
  jakartaDayKey
} from './fun.js'

import {
  getProfileJid
} from './profile.js'

// =====================================
// JID
// =====================================

function normalizeJid(
  value
) {
  const jid =
    String(
      value || ''
    )
      .trim()

  if (!jid) {
    return ''
  }

  return jid.replace(
    /:\d+@/,
    '@'
  )
}

function sameJid(
  a,
  b
) {
  return (
    normalizeJid(a) ===
    normalizeJid(b)
  )
}

export function mentionText(
  jid
) {
  const id =
    normalizeJid(
      jid
    )
      .split('@')[0]

  return (
    `@${id}`
  )
}

// =====================================
// GROUP MEMBERS
// =====================================

export async function getGroupMembers({
  sock,
  msg,
  jid,
  excludeSender = false
}) {
  if (
    !String(jid)
      .endsWith('@g.us')
  ) {
    throw new Error(
      'GROUP_ONLY'
    )
  }

  const metadata =
    await sock.groupMetadata(
      jid
    )

  const sender =
    normalizeJid(
      getProfileJid(
        msg,
        jid
      ) ||
      msg?.key?.participant ||
      msg?.participant
    )

  const bot =
    normalizeJid(
      sock?.user?.id
    )

  const result = []

  for (
    const participant
    of (
      metadata?.participants ||
      []
    )
  ) {
    const member =
      normalizeJid(
        participant?.id
      )

    if (!member) {
      continue
    }

    if (
      bot &&
      sameJid(
        member,
        bot
      )
    ) {
      continue
    }

    if (
      excludeSender &&
      sender &&
      sameJid(
        member,
        sender
      )
    ) {
      continue
    }

    if (
      !result.includes(
        member
      )
    ) {
      result.push(
        member
      )
    }
  }

  return {
    metadata,
    sender,
    members:
      result
  }
}

// =====================================
// DAILY MEMBER
// =====================================

export function dailyMember({
  members
}) {
  if (
    !Array.isArray(
      members
    ) ||
    !members.length
  ) {
    return null
  }

  const index =
    Math.floor(
      Math.random() *
      members.length
    )

  return members[
    index
  ]
}

export function dailyPercent(
  _seed,
  min = 0,
  max = 100
) {
  min =
    Math.ceil(min)

  max =
    Math.floor(max)

  return (
    min +
    Math.floor(
      Math.random() *
      (
        max -
        min +
        1
      )
    )
  )
}

export function makeBar(
  value
) {
  const filled =
    Math.max(
      0,
      Math.min(
        10,
        Math.round(
          value / 10
        )
      )
    )

  return (
    '█'.repeat(
      filled
    ) +
    '░'.repeat(
      10 - filled
    )
  )
}
