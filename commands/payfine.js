import {
  payCrimeFine
} from '../lib/rpg/crime.js'

import {
  resolveProfileJid
} from '../lib/profile.js'

function num(
  value
) {
  return Number(
    value || 0
  ).toLocaleString(
    'id-ID'
  )
}

export default {
  name:
    'payfine',

  aliases: [
    'bayardenda'
  ],

  category:
    'RPG',

  description:
    'Membayar denda dan menghapus Wanted',

  usage:
    '.payfine',

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
      payCrimeFine(
        userJid
      )

    if (
      r.reason ===
      'NO_WANTED'
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            `😇 Wanted kamu sudah *0/5*.\n` +
            `Belum perlu bayar apa-apa.`
        },
        {
          quoted:
            msg
        }
      )
    }

    if (
      r.reason ===
      'MONEY_LOW'
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            `💸 Money di dompet kurang.\n\n` +
            `Denda: *${num(r.fine)}*\n` +
            `Wallet: *${num(r.money)}*\n` +
            `Kurang: *${num(r.missing)}*\n\n` +
            `🏦 Uang Bank tidak ditarik otomatis.`
        },
        {
          quoted:
            msg
        }
      )
    }

    if (!r.success) {
      return sock.sendMessage(
        jid,
        {
          text:
            '❌ Denda gagal dibayar.'
        },
        {
          quoted:
            msg
        }
      )
    }

    return sock.sendMessage(
      jid,
      {
        text:
          `╭━━〔 ✅ *DENDA DIBAYAR* 〕━━╮\n` +
          `│\n` +
          `│ 🚨 Wanted: *${r.oldWanted}/5 → 0/5*\n` +
          `│ 💵 Dibayar: *${num(r.paid)} Money*\n` +
          `│ 💼 Sisa: *${num(r.money)}*\n` +
          `│\n` +
          `│ Nama lu bersih lagi 😇\n` +
          `│\n` +
          `╰━━━━━━━━━━━━━━━━╯`
      },
      {
        quoted:
          msg
      }
    )
  }
}
