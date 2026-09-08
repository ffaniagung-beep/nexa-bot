import {
  getOwnerTarget,
  getRest,
  formatNumber,
  formatDate
} from '../lib/ownerTools.js'

import {
  resolvePlayerId,
  getPlayer
} from '../lib/playerdb.js'

import {
  isPremium,
  getRequiredExp
} from '../lib/userdb.js'

import {
  formatGender
} from '../lib/profile.js'

// =====================================
// NUMBER TARGET
// =====================================

function targetFromNumber(
  value
) {
  let number =
    String(
      value || ''
    )
      .trim()
      .replace(
        /\D/g,
        ''
      )

  // 08xxx -> 628xxx
  if (
    number.startsWith('0')
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
// PREMIUM REMAINING
// =====================================

function premiumRemaining(
  timestamp
) {
  let ms =
    Math.max(
      0,
      Number(timestamp) -
        Date.now()
    )

  const days =
    Math.floor(
      ms / 86400000
    )

  ms %= 86400000

  const hours =
    Math.floor(
      ms / 3600000
    )

  ms %= 3600000

  const minutes =
    Math.floor(
      ms / 60000
    )

  ms %= 60000

  const seconds =
    Math.floor(
      ms / 1000
    )

  return (
    `${days} hari ` +
    `${hours} jam ` +
    `${minutes} menit ` +
    `${seconds} detik`
  )
}

// =====================================
// COMMAND
// =====================================

export default {
  name:
    'userstats',

  aliases: [
    'ustats'
  ],

  category:
    'OWNER',

  ownerOnly:
    true,

  description:
    'Melihat data user dari database NEXA',

  usage:
    '.userstats <nomor>',

  async run({
    sock,
    msg,
    jid
  }) {
    // =================================
    // TARGET:
    // mention / reply lebih dulu
    // =================================

    let target =
      getOwnerTarget(
        msg
      )

    // =================================
    // TARGET VIA NOMOR
    //
    // .userstats 628xxx
    // .userstats 08xxx
    // =================================

    if (!target) {
      const rest =
        getRest(
          msg
        )

      const first =
        String(
          rest || ''
        )
          .trim()
          .split(/\s+/)[0]

      target =
        targetFromNumber(
          first
        )
    }

    if (!target) {
      return sock.sendMessage(
        jid,
        {
          text:
            `👑 *USER STATS*\n\n` +
            `Gunakan salah satu:\n\n` +
            `*.userstats 628xxxxxxxxxx*\n` +
            `*.userstats @user*\n` +
            `atau reply pesan user dengan *.userstats*`
        },
        {
          quoted:
            msg
        }
      )
    }

    // =================================
    // HARUS SUDAH ADA DI DATABASE
    //
    // false = JANGAN create user baru
    // =================================

    const playerId =
      resolvePlayerId(
        target,
        false
      )

    if (!playerId) {
      return sock.sendMessage(
        jid,
        {
          text:
            '❌ User tersebut tidak ditemukan di database NEXA.'
        },
        {
          quoted:
            msg
        }
      )
    }

    // =================================
    // PREMIUM EXPIRY CHECK
    //
    // Kalau expired:
    // premium=false
    // premiumUntil=null
    // =================================

    const premiumActive =
      isPremium(
        target
      )

    // Ambil ulang sesudah expiry check
    // supaya datanya paling baru.
    const user =
      getPlayer(
        target
      )

    if (
      !user ||
      !user.registeredAt
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            '❌ User ditemukan, tapi belum terdaftar sebagai user NEXA.'
        },
        {
          quoted:
            msg
        }
      )
    }

    const requiredExp =
      getRequiredExp(
        user.level
      )

    const premium =
      premiumActive
        ? 'Premium ⭐'
        : 'Free'

    let premiumInfo =
      ''

    if (
      premiumActive &&
      user.premiumUntil
    ) {
      premiumInfo =
        `⏳ Sisa Premium: *${premiumRemaining(
          user.premiumUntil
        )}*\n` +
        `📅 Sampai: *${formatDate(
          user.premiumUntil
        )}*\n`
    }

    const text =
      `👤 *NEXA USER DATA*\n\n` +

      `🏷 Nama: *${user.name || '-'}*\n` +
      `🎂 Umur: *${user.age ?? '-'}*\n` +
      `⚧ Gender: *${formatGender(
        user.gender
      )}*\n\n` +

      `🧬 Level: *${formatNumber(
        user.level
      )}*\n` +

      `✨ EXP: *${formatNumber(
        user.exp
      )}/${formatNumber(
        requiredExp
      )}*\n` +

      `🎟 Limit: *${formatNumber(
        user.limit
      )}*\n` +

      `🪙 Coin: *${formatNumber(
        user.coin
      )}*\n\n` +

      `⭐ Status: *${premium}*\n` +
      premiumInfo +

      `🚫 Banned: *${
        user.banned
          ? 'Ya'
          : 'Tidak'
      }*\n\n` +

      `📋 Terdaftar: *${formatDate(
        user.registeredAt
      )}*`

    await sock.sendMessage(
      jid,
      {
        text
      },
      {
        quoted:
          msg
      }
    )
  }
}
