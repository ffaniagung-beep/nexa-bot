import {
  claimRedeem
} from '../lib/redeem.js'

import {
  getProfileJid
} from '../lib/profile.js'

export default {
  name:
    'redeem',

  aliases: [
    'code'
  ],

  category:
    'GAME',

  description:
    'Menukarkan kode redeem NEXA',

  usage:
    '.redeem <kode>',

  async run({
    sock,
    msg,
    jid
  }) {
    const text =
      (
        msg.message?.conversation ||
        msg.message
          ?.extendedTextMessage
          ?.text ||
        ''
      )
        .trim()

    const code =
      text
        .split(/\s+/)
        .slice(1)
        .join('')
        .trim()

    if (!code) {
      return sock.sendMessage(
        jid,
        {
          text:
            `🎁 *REDEEM CODE*\n\n` +
            `Gunakan:\n` +
            `*.redeem <kode>*\n\n` +
            `Contoh:\n` +
            `*.redeem NEXAOPEN*`
        },
        {
          quoted:
            msg
        }
      )
    }

    const userJid =
      getProfileJid(
        msg,
        jid
      )

    const result =
      claimRedeem(
        code,
        userJid
      )

    if (
      !result.success
    ) {
      if (
        result.reason ===
        'NOT_FOUND'
      ) {
        return sock.sendMessage(
          jid,
          {
            text:
              '❌ Kode redeem tidak ditemukan.'
          },
          {
            quoted:
              msg
          }
        )
      }

      if (
        result.reason ===
        'EXPIRED'
      ) {
        return sock.sendMessage(
          jid,
          {
            text:
              '⌛ Kode redeem ini sudah kadaluarsa.'
          },
          {
            quoted:
              msg
          }
        )
      }

      if (
        result.reason ===
        'ALREADY_CLAIMED'
      ) {
        return sock.sendMessage(
          jid,
          {
            text:
              '🎁 Kamu sudah pernah menggunakan kode redeem ini.'
          },
          {
            quoted:
              msg
          }
        )
      }

      return
    }

    const reward =
      result.redeem

    let textResult =
      `🎁 *REDEEM BERHASIL*\n\n`

    if (
      reward.coin > 0
    ) {
      textResult +=
        `🪙 +${Number(reward.coin).toLocaleString('id-ID')} Coin\n`
    }

    if (
      reward.limit > 0
    ) {
      textResult +=
        `🎟 +${reward.limit} Limit\n`
    }

    if (
      result.premiumReceived
    ) {
      textResult +=
        `⭐ +${reward.premiumDays} Hari Premium\n`
    } else if (
      reward.premiumDays > 0
    ) {
      textResult +=
        `\n⭐ Bonus Premium untuk kode ini sudah habis.\n`
    }

    textResult +=
      `\nTerima kasih sudah menggunakan NEXA. ✦`

    await sock.sendMessage(
      jid,
      {
        text:
          textResult.trim()
      },
      {
        quoted:
          msg
      }
    )
  }
}
