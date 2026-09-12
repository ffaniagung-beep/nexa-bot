// NEXA DAILY ATOMIC V1
import {
  claimDailyRewards
} from '../lib/userdb.js'

import {
  getProfileJid
} from '../lib/profile.js'

// =====================================
// DAILY - RESET 00:00 WIB
// =====================================

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

    const LIMIT_REWARD =
      10

    const COIN_REWARD =
      50

    const claim =
      claimDailyRewards(
        userJid,
        {
          limitReward:
            LIMIT_REWARD,

          coinReward:
            COIN_REWARD
        }
      )

    if (!claim.claimed) {
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

    const updated =
      claim.user

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
