import {
  addPremium
} from '../lib/userdb.js'

import {
  getOwnerTarget,
  formatDate
} from '../lib/ownerTools.js'

import {
  resolvePlayerId
} from '../lib/playerdb.js'

// =====================================
// TARGET NUMBER
// =====================================

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

  // Nomor Indonesia lokal:
  // 08xxx -> 628xxx
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

// =====================================
// COMMAND
// =====================================

export default {
  name:
    'addprem',

  aliases: [
    'addpremium'
  ],

  category:
    'OWNER',

  ownerOnly:
    true,

  description:
    'Menambah Premium user',

  usage:
    '.addprem @user <hari>',

  async run({
    sock,
    msg,
    jid,
    args
  }) {
    const values =
      Array.isArray(
        args
      )
        ? args
        : []

    // Mention / quoted user.
    let target =
      getOwnerTarget(
        msg
      )

    let days = null

    // =================================
    // MODE MENTION / REPLY
    //
    // .addprem @user 5
    // reply user -> .addprem 5
    // =================================

    if (target) {
      const rawDays =
        values[
          values.length - 1
        ]

      days =
        Number(
          String(
            rawDays || ''
          )
            .replace(
              /\D/g,
              ''
            )
        )
    }

    // =================================
    // MODE NOMOR
    //
    // .addprem 628xxx 5
    // .addprem 08xxx 5
    // =================================

    if (!target) {
      if (
        values.length >= 2
      ) {
        target =
          targetFromNumber(
            values[0]
          )

        days =
          Number(
            String(
              values[
                values.length - 1
              ] || ''
            )
              .replace(
                /\D/g,
                ''
              )
          )
      }
    }

    if (
      !target ||
      !Number.isInteger(
        days
      ) ||
      days <= 0 ||
      days > 3650
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            `👑 *ADD PREMIUM*\n\n` +
            `Group / mention:\n` +
            `*.addprem @user 5*\n\n` +

            `Reply pesan user:\n` +
            `*.addprem 5*\n\n` +

            `Lewat nomor:\n` +
            `*.addprem 628xxx 5*`
        },
        {
          quoted:
            msg
        }
      )
    }

    // User wajib sudah ada
    // di database NEXA.
    const playerId =
      await resolvePlayerId(
        target
      )

    if (!playerId) {
      return sock.sendMessage(
        jid,
        {
          text:
            `❌ User tersebut belum terdaftar di NEXA.`
        },
        {
          quoted:
            msg
        }
      )
    }

    const user =
      addPremium(
        target,
        days
      )

    const mention =
      `@${String(
        target
      ).split('@')[0]}`

    await sock.sendMessage(
      jid,
      {
        text:
          `⭐ *PREMIUM DITAMBAHKAN*\n\n` +
          `👤 User: ${mention}\n` +
          `⏳ Durasi: *+${days} Hari*\n` +
          `📅 Aktif sampai:\n` +
          `*${formatDate(
            user.premiumUntil
          )}*\n\n` +
          `✅ Bebas Limit\n` +
          `🛡️ Anti-Spam tetap berlaku\n` +
          `🔒 Tidak mendapat akses Owner`,

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
