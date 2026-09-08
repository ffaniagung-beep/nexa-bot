import {
  restRpg
} from '../lib/rpg/rest.js'

import {
  resolveProfileJid
} from '../lib/profile.js'

function duration(
  ms
) {
  const total =
    Math.max(
      1,
      Math.ceil(
        Number(ms) /
        1000
      )
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
  name: 'rest',
  aliases: ['istirahat'],
  category: 'RPG',
  description: 'Memulihkan HP dan Mana',
  usage: '.rest',

  async run({
    sock,
    msg,
    jid
  }) {
    const userJid =
      await resolveProfileJid(
        sock,
        msg,
        jid
      )

    const r =
      restRpg(
        userJid
      )

    const errors = {
      IN_BATTLE:
        '⚔️ Lu lagi battle 😭\nSelesaikan atau kabur dulu.',

      FULL:
        '😴 HP dan Mana lu sudah penuh.',

      NO_PROFILE:
        '⚔️ Profile RPG belum tersedia.'
    }

    if (
      r.reason ===
      'COOLDOWN'
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            `🛏️ Belum bisa istirahat lagi.\n\n` +
            `⏳ Sisa: *${duration(r.cooldown)}*`
        },
        {
          quoted: msg
        }
      )
    }

    if (!r.success) {
      return sock.sendMessage(
        jid,
        {
          text:
            errors[r.reason] ||
            '❌ Rest gagal.'
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
          `╭━━━━〔 🛏️ *REST* 〕━━━━╮\n` +
          `│\n` +
          `│ Lu istirahat sebentar... 😴\n` +
          `│\n` +
          `│ ❤️ HP\n` +
          `│ ${r.oldHp} → *${r.hp}/${r.maxHp}*\n` +
          `│\n` +
          `│ 🔷 Mana\n` +
          `│ ${r.oldMana} → *${r.mana}/${r.maxMana}*\n` +
          `│\n` +
          `│ ⏳ Cooldown: *10 menit*\n` +
          `│\n` +
          `╰━━━━━━━━━━━━━━━━━━━━╯`
      },
      {
        quoted: msg
      }
    )
  }
}
