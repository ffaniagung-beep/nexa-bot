import {
  getOwnerTarget,
  removePremium
} from '../lib/ownerTools.js'

import {
  resolvePlayerId
} from '../lib/playerdb.js'

function targetFromNumber(
  value
) {
  let number =
    String(
      value || ''
    )
      .replace(
        /\D/g,
        ''
      )

  if (
    number.startsWith(
      '0'
    )
  ) {
    number =
      '62' +
      number.slice(1)
  }

  if (
    number.length < 8 ||
    number.length > 15
  ) {
    return null
  }

  return (
    number +
    '@s.whatsapp.net'
  )
}

export default {
  name:
    'delprem',

  aliases: [
    'delpremium'
  ],

  category:
    'OWNER',

  ownerOnly:
    true,

  description:
    'Mencabut Premium user',

  usage:
    '.delprem @user',

  async run({
    sock,
    msg,
    jid,
    args
  }) {
    let target =
      getOwnerTarget(
        msg
      )

    if (
      !target &&
      args?.[0]
    ) {
      target =
        targetFromNumber(
          args[0]
        )
    }

    if (!target) {
      return sock.sendMessage(
        jid,
        {
          text:
            `👑 *DELETE PREMIUM*\n\n` +
            `Mention / reply:\n` +
            `*.delprem @user*\n\n` +
            `Atau nomor:\n` +
            `*.delprem 628xxx*`
        },
        {
          quoted:
            msg
        }
      )
    }

    const playerId =
      await resolvePlayerId(
        target
      )

    if (!playerId) {
      return sock.sendMessage(
        jid,
        {
          text:
            '❌ User tidak ditemukan di database NEXA.'
        },
        {
          quoted:
            msg
        }
      )
    }

    removePremium(
      target
    )

    const mention =
      `@${String(
        target
      ).split('@')[0]}`

    await sock.sendMessage(
      jid,
      {
        text:
          `✅ Premium ${mention} berhasil dicabut.`,

        mentions: [
          target
        ]
      },
      {
        quoted:
          msg
      }
    )
  }
}
