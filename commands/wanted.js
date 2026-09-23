import {
  getCrimeStatus
} from '../lib/rpg/crime.js'

import {
  resolveProfileJid
} from '../lib/profile.js'

import {
  rpgCommand,
  sendRpgQuickPanel
} from '../lib/rpg/uxV2.js'

function num(
  value
) {
  return Number(
    value || 0
  ).toLocaleString(
    'id-ID'
  )
}

function duration(
  ms
) {
  if (
    !ms ||
    ms <= 0
  ) {
    return 'Siap'
  }

  const total =
    Math.ceil(
      ms /
      1000
    )

  const minutes =
    Math.floor(
      total /
      60
    )

  const seconds =
    total %
    60

  return (
    `${minutes}m ${seconds}d`
  )
}

export default {
  name:
    'wanted',

  aliases: [],
  category:
    'RPG',

  description:
    'Melihat status Wanted RPG',

  usage:
    '.wanted',

  async run({
    sock,
    msg,
    jid,
    config
  }) {
    const userJid =
      await resolveProfileJid(
        sock,
        msg,
        jid
      )

    const r =
      getCrimeStatus(
        userJid
      )

    const stars =
      '🚨'.repeat(
        r.wanted
      ) +
      '▫️'.repeat(
        Math.max(
          0,
          5 -
          r.wanted
        )
      )

    const body =
      `${stars}\n` +
      `Wanted *${r.wanted}/5*\n` +
      `💵 Denda *${num(r.fine)} Money*\n` +
      `⏳ Crime cooldown *${duration(r.globalCooldown)}*`

    const actions = [
      {
        text: '🏦 Bank',
        id: rpgCommand(config, 'bank')
      },
      {
        text: '👤 Profile',
        id: rpgCommand(config, 'rpg')
      },
      {
        text: '⚔️ RPG Hub',
        id: rpgCommand(config, 'menu', 'rpg')
      }
    ]

    if (
      r.wanted > 0
    ) {
      actions.unshift({
        text: '💵 Bayar Denda',
        id: rpgCommand(config, 'payfine')
      })
    }

    return sendRpgQuickPanel({
      sock,
      msg,
      jid,
      title:
        '🚨 NEXA • WANTED STATUS',
      body,
      actions
    })
  }
}
