import {
  ensureUser,
  updateUser,
  addLimit,
  addCoin
} from '../lib/userdb.js'

import {
  getProfileJid
} from '../lib/profile.js'

// =====================================
// DAILY - RESET 00:00 WIB
// =====================================

function getJakartaDateKey(
  timestamp = Date.now()
) {
  return new Intl.DateTimeFormat(
    'en-CA',
    {
      timeZone:
        'Asia/Jakarta',

      year:
        'numeric',

      month:
        '2-digit',

      day:
        '2-digit'
    }
  ).format(
    new Date(timestamp)
  )
}

function getNextMidnightWIB() {
  const now =
    Date.now()

  const jakartaNow =
    new Date(
      now +
      7 * 60 * 60 * 1000
    )

  const nextMidnightUTC =
    Date.UTC(
      jakartaNow.getUTCFullYear(),
      jakartaNow.getUTCMonth(),
      jakartaNow.getUTCDate() + 1,
      0,
      0,
      0
    )

  return (
    nextMidnightUTC -
    7 * 60 * 60 * 1000
  )
}

function formatRemaining(ms) {
  const totalSeconds =
    Math.max(
      0,
      Math.ceil(
        ms / 1000
      )
    )

  const hours =
    Math.floor(
      totalSeconds / 3600
    )

  const minutes =
    Math.floor(
      (
        totalSeconds %
        3600
      ) / 60
    )

  return (
    `${hours} jam ${minutes} menit`
  )
}

export default {
  name:
    'daily',

  aliases: [
    'claim'
  ],

  category:
    'GAME',

  description:
    'Klaim hadiah harian NEXA',

  usage:
    '.daily',

  async run({
    sock,
    msg,
    jid,
    isOwner
  }) {
    const userJid =
      getProfileJid(
        msg,
        jid
      )

    const user =
      ensureUser(
        userJid
      )

    const today =
      getJakartaDateKey()

    const lastClaimDate =
      user.lastDaily
        ? getJakartaDateKey(
            user.lastDaily
          )
        : null

    // =================================
    // SUDAH CLAIM HARI INI
    // =================================

    if (
      lastClaimDate ===
      today
    ) {
      const resetAt =
        getNextMidnightWIB()

      const remaining =
        resetAt -
        Date.now()

      return sock.sendMessage(
        jid,
        {
          text:
            `☀️ *DAILY SUDAH DIKLAIM*\n\n` +
            `Kamu sudah mengambil hadiah hari ini.\n\n` +
            `⏳ Reset dalam sekitar *${formatRemaining(remaining)}*\n` +
            `🕛 Daily reset setiap *00:00 WIB*.`
        },
        {
          quoted:
            msg
        }
      )
    }

    // =================================
    // REWARD
    // =================================

    const LIMIT_REWARD =
      10

    const COIN_REWARD =
      50

    addLimit(
      userJid,
      LIMIT_REWARD
    )

    const updated =
      addCoin(
        userJid,
        COIN_REWARD
      )

    updateUser(
      userJid,
      {
        lastDaily:
          Date.now()
      }
    )

    await sock.sendMessage(
      jid,
      {
        text:
          `☀️ *DAILY CLAIMED*\n\n` +
          `🎟 +${LIMIT_REWARD} Limit\n` +
          `🪙 +${COIN_REWARD} Coin\n\n` +
          `🎟 Limit: *${isOwner ? '∞' : updated.limit}*\n` +
          `🪙 Coin: *${Number(updated.coin).toLocaleString('id-ID')}*\n\n` +
          `🕛 Daily berikutnya tersedia setelah *00:00 WIB*.`
      },
      {
        quoted:
          msg
      }
    )
  }
}
