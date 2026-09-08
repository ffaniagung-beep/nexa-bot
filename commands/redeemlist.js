import {
  getRedeemList
} from '../lib/redeem.js'

function formatDate(
  timestamp
) {
  return new Intl.DateTimeFormat(
    'id-ID',
    {
      dateStyle:
        'medium',

      timeStyle:
        'short',

      timeZone:
        'Asia/Jakarta'
    }
  ).format(
    new Date(timestamp)
  )
}

export default {
  name:
    'redeemlist',

  aliases: [
    'listredeem'
  ],

  category:
    'OWNER',

  ownerOnly:
    true,

  description:
    'Melihat daftar kode redeem',

  usage:
    '.redeemlist',

  async run({
    sock,
    msg,
    jid
  }) {
    const list =
      getRedeemList()

    if (!list.length) {
      return sock.sendMessage(
        jid,
        {
          text:
            '🎁 Belum ada kode redeem.'
        },
        {
          quoted:
            msg
        }
      )
    }

    let text =
      `🎁 *REDEEM LIST*\n\n`

    for (
      const redeem
      of list
    ) {
      const expired =
        Number(
          redeem.expiresAt
        ) <= Date.now()

      text +=
        `*${redeem.code}*\n`

      text +=
        expired
          ? `Status: ⌛ Expired\n`
          : `Status: ✅ Aktif\n`

      if (
        redeem.coin > 0
      ) {
        text +=
          `🪙 ${Number(redeem.coin).toLocaleString('id-ID')} Coin\n`
      }

      if (
        redeem.limit > 0
      ) {
        text +=
          `🎟 ${redeem.limit} Limit\n`
      }

      if (
        redeem.premiumDays > 0
      ) {
        text +=
          `⭐ ${redeem.premiumDays} Hari Premium\n`

        if (
          redeem.premiumQuota > 0
        ) {
          text +=
            `👥 Premium: ${redeem.premiumClaimed}/${redeem.premiumQuota}\n`
        }
      }

      text +=
        `🎫 Redeemed: ${redeem.claimedBy?.length || 0}\n`

      text +=
        `⌛ ${formatDate(redeem.expiresAt)}\n\n`
    }

    await sock.sendMessage(
      jid,
      {
        text:
          text.trim()
      },
      {
        quoted:
          msg
      }
    )
  }
}
