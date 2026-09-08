import {
  buyRpgItem
} from '../lib/rpg/store.js'

import {
  resolveProfileJid
} from '../lib/profile.js'

function num(value) {
  return Number(value || 0)
    .toLocaleString('id-ID')
}

export default {
  name: 'rpgbuy',
  aliases: [],
  category: 'RPG',
  menuHidden: true,
  description: 'Membeli item RPG',
  usage: '.rpgbuy <id> [jumlah]',

  async run({
    sock,
    msg,
    jid,
    args
  }) {
    if (!args?.[0]) {
      return sock.sendMessage(
        jid,
        {
          text:
            '🛒 Gunakan:\n' +
            '*.rpgbuy <item_id> [jumlah]*'
        },
        { quoted: msg }
      )
    }

    const userJid =
      await resolveProfileJid(
        sock,
        msg,
        jid
      )

    const r =
      buyRpgItem(
        userJid,
        args[0],
        args[1] || 1
      )

    const errors = {
      NOT_FOR_SALE:
        '❌ Item tidak dijual di RPG Store.',

      INVALID_QTY:
        '❌ Jumlah tidak valid.',

      GEAR_QTY:
        '⚔️ Equipment hanya bisa dibeli satu per transaksi.',

      NO_CLASS:
        '🧬 Pilih Class dulu.',

      WRONG_CLASS:
        `🧬 Equipment itu bukan untuk Class kamu.`,

      MONEY_LOW:
        `💸 Money kurang *${num(r.missing)}*.`
    }

    if (!r.success) {
      return sock.sendMessage(
        jid,
        {
          text:
            errors[r.reason] ||
            '❌ Pembelian gagal.'
        },
        { quoted: msg }
      )
    }

    return sock.sendMessage(
      jid,
      {
        text:
          `✅ *PEMBELIAN BERHASIL*\n\n` +
          `${r.item.icon} ${r.item.name} ×${r.qty}\n` +
          `💵 -${num(r.total)} Money\n` +
          `💼 Sisa: *${num(r.money)}*`
      },
      { quoted: msg }
    )
  }
}
