import {
  createRedeem
} from '../lib/redeem.js'

function getText(msg) {
  return (
    msg.message?.conversation ||
    msg.message
      ?.extendedTextMessage
      ?.text ||
    ''
  )
}

function parseDuration(
  value
) {
  const match =
    String(
      value || ''
    )
      .trim()
      .toLowerCase()
      .match(
        /^(\d+)(m|h|d)$/
      )

  if (!match) {
    return null
  }

  const amount =
    Number(
      match[1]
    )

  const unit =
    match[2]

  if (
    !Number.isInteger(
      amount
    ) ||
    amount <= 0
  ) {
    return null
  }

  if (
    unit === 'm'
  ) {
    return (
      amount *
      60 *
      1000
    )
  }

  if (
    unit === 'h'
  ) {
    return (
      amount *
      60 *
      60 *
      1000
    )
  }

  if (
    unit === 'd'
  ) {
    return (
      amount *
      24 *
      60 *
      60 *
      1000
    )
  }

  return null
}

function parseNumber(
  value
) {
  const n =
    Number(value)

  if (
    !Number.isInteger(n) ||
    n < 0
  ) {
    return null
  }

  return n
}

function formatDate(
  timestamp
) {
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
}

export default {
  name:
    'createredeem',

  aliases: [
    'newredeem'
  ],

  category:
    'OWNER',

  ownerOnly:
    true,

  description:
    'Membuat kode redeem',

  usage:
    '.createredeem KODE coin=1000 limit=5 prem=3 quota=3 expire=6h',

  async run({
    sock,
    msg,
    jid
  }) {
    const args =
      getText(msg)
        .trim()
        .split(/\s+/)
        .slice(1)

    const code =
      String(
        args.shift() || ''
      )
        .trim()
        .toUpperCase()

    if (!code) {
      return sock.sendMessage(
        jid,
        {
          text:
            `🎁 *CREATE REDEEM*\n\n` +
            `Format:\n` +
            `*.createredeem KODE coin=1000 limit=5 prem=3 quota=3 expire=6h*\n\n` +

            `Parameter:\n` +
            `coin= jumlah coin\n` +
            `limit= jumlah limit\n` +
            `prem= hari premium\n` +
            `quota= batas penerima premium\n` +
            `expire= masa berlaku kode\n\n` +

            `Durasi expire:\n` +
            `30m = 30 menit\n` +
            `6h = 6 jam\n` +
            `2d = 2 hari`
        },
        {
          quoted:
            msg
        }
      )
    }

    const options = {}

    for (
      const arg
      of args
    ) {
      const [
        rawKey,
        rawValue
      ] =
        arg.split('=')

      if (
        !rawKey ||
        rawValue ===
          undefined
      ) {
        continue
      }

      options[
        rawKey.toLowerCase()
      ] =
        rawValue
    }

    const coin =
      parseNumber(
        options.coin || 0
      )

    const limit =
      parseNumber(
        options.limit || 0
      )

    const premiumDays =
      parseNumber(
        options.prem || 0
      )

    const premiumQuota =
      parseNumber(
        options.quota || 0
      )

    const duration =
      parseDuration(
        options.expire
      )

    if (
      coin === null ||
      limit === null ||
      premiumDays === null ||
      premiumQuota === null
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            '❌ Reward harus berupa angka bulat positif.'
        },
        {
          quoted:
            msg
        }
      )
    }

    if (!duration) {
      return sock.sendMessage(
        jid,
        {
          text:
            `❌ Durasi expire tidak valid.\n\n` +
            `Contoh: *30m*, *6h*, atau *2d*.`
        },
        {
          quoted:
            msg
        }
      )
    }

    try {
      const redeem =
        createRedeem({
          code,

          coin,

          limit,

          premiumDays,

          premiumQuota,

          expiresAt:
            Date.now() +
            duration
        })

      let rewardText = ''

      if (
        redeem.coin > 0
      ) {
        rewardText +=
          `🪙 ${Number(redeem.coin).toLocaleString('id-ID')} Coin\n`
      }

      if (
        redeem.limit > 0
      ) {
        rewardText +=
          `🎟 ${redeem.limit} Limit\n`
      }

      if (
        redeem.premiumDays > 0
      ) {
        rewardText +=
          `⭐ ${redeem.premiumDays} Hari Premium\n`

        if (
          redeem.premiumQuota > 0
        ) {
          rewardText +=
            `👥 Premium hanya untuk ${redeem.premiumQuota} orang pertama\n`
        } else {
          rewardText +=
            `👥 Premium tanpa batas kuota\n`
        }
      }

      await sock.sendMessage(
        jid,
        {
          text:
            `✅ *REDEEM CREATED*\n\n` +
            `🎟 Code: *${redeem.code}*\n\n` +
            `${rewardText}\n` +
            `⌛ Kadaluarsa:\n` +
            `*${formatDate(redeem.expiresAt)}*\n\n` +
            `Gunakan:\n` +
            `*.redeem ${redeem.code}*`
        },
        {
          quoted:
            msg
        }
      )
    } catch (err) {
      if (
        err.message ===
        'CODE_EXISTS'
      ) {
        return sock.sendMessage(
          jid,
          {
            text:
              '❌ Kode redeem tersebut sudah ada.'
          },
          {
            quoted:
              msg
          }
        )
      }

      if (
        err.message ===
        'EMPTY_REWARD'
      ) {
        return sock.sendMessage(
          jid,
          {
            text:
              '❌ Redeem harus memiliki minimal satu hadiah.'
          },
          {
            quoted:
              msg
          }
        )
      }

      console.error(
        '🎁 create redeem:',
        err
      )

      await sock.sendMessage(
        jid,
        {
          text:
            '⚠️ Gagal membuat kode redeem.'
        },
        {
          quoted:
            msg
        }
      )
    }
  }
}
