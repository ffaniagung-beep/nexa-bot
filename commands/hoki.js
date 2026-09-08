import {
  claimHoki
} from '../lib/hoki.js'

import {
  resolveProfileJid
} from '../lib/profile.js'

import {
  getRequiredExp
} from '../lib/userdb.js'

function num(
  value
) {
  return Number(
    value || 0
  ).toLocaleString(
    'id-ID'
  )
}

function rewardText(
  type,
  amount
) {
  if (type === 'limit') {
    return `🎟 +${num(amount)} Limit`
  }

  if (type === 'coin') {
    return `🪙 +${num(amount)} Coin`
  }

  if (type === 'premium') {
    return `👑 Premium +${amount} Hari`
  }

  return '🎁 Mystery Reward'
}

function rarity(
  value
) {
  return ({
    COMMON:
      '⚪ COMMON',
    UNCOMMON:
      '🟢 UNCOMMON',
    RARE:
      '🔵 RARE',
    EPIC:
      '🟣 EPIC',
    LEGENDARY:
      '🟡 LEGENDARY',
    MYTHIC:
      '🔴 MYTHIC'
  })[value] || value
}

function premiumDate(
  value
) {
  if (!value) {
    return '-'
  }

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
    new Date(value)
  )
}

function resetText(
  ms
) {
  const hour =
    Math.floor(
      ms / 3600000
    )

  const minute =
    Math.floor(
      (
        ms %
        3600000
      ) /
      60000
    )

  return (
    `${hour} jam ` +
    `${minute} menit`
  )
}

export default {
  name:
    'hoki',

  aliases: [
    'luck'
  ],

  category:
    'FUN',

  description:
    'Mengambil reward Hoki gratis',

  usage:
    '.hoki',

  async run({
    sock,
    msg,
    jid,
    isOwner
  }) {
    const userJid =
      await resolveProfileJid(
        sock,
        msg,
        jid
      )

    let result

    try {
      result =
        claimHoki({
          jid:
            userJid,
          isOwner:
            Boolean(isOwner)
        })
    } catch (
      err
    ) {
      console.error(
        '🍀 HOKI:',
        err
      )

      return sock.sendMessage(
        jid,
        {
          text:
            '⚠️ Hoki gagal diproses 😭'
        },
        {
          quoted: msg
        }
      )
    }

    if (
      !result.success
    ) {
      if (
        result.reason ===
        'ALREADY_CLAIMED'
      ) {
        return sock.sendMessage(
          jid,
          {
            text:
              `🍀 *HOKI SUDAH DIPAKAI* 😭\n\n` +
              `🎁 Tadi dapat:\n` +
              `*${rewardText(
                result.previous.main_type,
                result.previous.main_amount
              )}*\n` +
              `✨ *+${num(
                result.previous.exp_amount
              )} EXP*\n\n` +
              `⏳ Reset dalam *${resetText(
                result.resetIn
              )}*\n` +
              `🕛 Bisa coba lagi pukul *00:00 WIB*.`
          },
          {
            quoted: msg
          }
        )
      }

      return sock.sendMessage(
        jid,
        {
          text:
            '❌ User belum terdaftar di NEXA.'
        },
        {
          quoted: msg
        }
      )
    }

    const required =
      getRequiredExp(
        result.level
      )

    let detail =
      ''

    if (
      result.main.type ===
      'limit'
    ) {
      detail =
        `\n🎟 Limit sekarang: *${
          result.isOwner
            ? '∞'
            : num(
                result.limit
              )
        }*`
    }

    if (
      result.main.type ===
      'coin'
    ) {
      detail =
        `\n🪙 Coin sekarang: *${num(
          result.coin
        )}*`
    }

    if (
      result.main.type ===
        'premium'
    ) {
      detail =
        result.isOwner
          ? (
              `\n👑 Jackpot Premium kena Owner 😭\n` +
              `Akses lu udah di atas Premium.`
            )
          : (
              `\n👑 Premium langsung aktif!\n` +
              `📅 Sampai: *${premiumDate(
                result.premiumUntil
              )}*`
            )
    }

    let levelUp =
      ''

    if (
      result.levelUps > 0
    ) {
      levelUp =
        `\n\n🎉 *LEVEL UP!*\n` +
        `Level *${result.oldLevel} → ${result.level}*`
    }

    const title =
      result.main.chance === 0.1
        ? '💫 *MYTHIC JACKPOT!*'
        : result.main.chance <= 1
          ? '🔥 *RARE DROP!*'
          : '🍀 *NEXA HOKI*'

    const text =
      `╭━━〔 ${title} 〕━━╮\n` +
      `│\n` +
      `│ 🎲 Tingkat Hoki: *${result.luck}%*\n` +
      `│ 🏷 ${rarity(
        result.main.rarity
      )}\n` +
      `│\n` +
      `│ 🎁 Reward Utama:\n` +
      `│ *${rewardText(
        result.main.type,
        result.main.amount
      )}*\n` +
      `│\n` +
      `│ ✨ Bonus:\n` +
      `│ *+${num(
        result.bonus.amount
      )} EXP*\n` +
      `│\n` +
      `╰━━━━━━━━━━━━━━━━╯` +

      detail +

      `\n✨ EXP: *${num(
        result.exp
      )}/${num(
        required
      )}*` +

      levelUp +

      (
        result.isOwner
          ? `\n\n😇 Owner boleh roll lagi.`
          : `\n\n🕛 Hoki berikutnya: *00:00 WIB*`
      )

    return sock.sendMessage(
      jid,
      {
        text
      },
      {
        quoted: msg
      }
    )
  }
}
