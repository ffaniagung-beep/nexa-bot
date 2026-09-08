import {
  sellRpgItem
} from '../lib/rpg/store.js'

import {
  resolveProfileJid
} from '../lib/profile.js'

function num(value) {
  return Number(value || 0)
    .toLocaleString('id-ID')
}

export default {
  name: 'rpgsell',
  aliases: [],
  category: 'RPG',
  menuHidden: true,
  description: 'Menjual item atau gear RPG',
  usage: '.rpgsell <item_id/#gear> [jumlah]',

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
            `💵 Gunakan:\n` +
            `*.rpgsell slime_gel 3*\n` +
            `*.rpgsell #AB12CD34*`
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
      sellRpgItem(
        userJid,
        args[0],
        args[1] || 1
      )

    const errors = {
      GEAR_NOT_FOUND:
        '❌ Gear code tidak ditemukan.',

      GEAR_EQUIPPED:
        '⚔️ Lepas gear dulu sebelum dijual.',

      NOT_SELLABLE:
        '❌ Item itu tidak bisa dijual.',

      USE_GEAR_CODE:
        '⚔️ Jual gear pakai kode #GEAR dari *.inventory*.',

      INVALID_QTY:
        '❌ Jumlah tidak valid.',

      ITEM_LOW:
        `📦 Item kurang. Kamu punya *${r.owned || 0}*.`
    }

    if (!r.success) {
      return sock.sendMessage(
        jid,
        {
          text:
            errors[r.reason] ||
            '❌ Penjualan gagal.'
        },
        { quoted: msg }
      )
    }

    return sock.sendMessage(
      jid,
      {
        text:
          `💵 *ITEM TERJUAL*\n\n` +
          `${r.item.icon} ${r.item.name} ×${r.qty}\n` +
          `💵 +${num(r.gain)} Money\n` +
          `💼 Saldo: *${num(r.money)}*`
      },
      { quoted: msg }
    )
  }
}
