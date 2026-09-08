import {
  equipRpgGear
} from '../lib/rpg/store.js'

import {
  resolveProfileJid
} from '../lib/profile.js'

export default {
  name: 'equip',
  aliases: [],
  category: 'RPG',
  menuHidden: true,
  description: 'Memakai equipment RPG',
  usage: '.equip #GEAR',

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
            `⚔️ Gunakan gear code dari *.inventory*.\n\n` +
            `Contoh:\n*.equip #AB12CD34*`
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
      equipRpgGear(
        userJid,
        args[0]
      )

    const errors = {
      GEAR_NOT_FOUND:
        '❌ Gear tidak ditemukan.',

      WRONG_CLASS:
        '🧬 Gear itu tidak cocok dengan Class kamu.',

      INVALID_GEAR:
        '❌ Item itu bukan equipment.'
    }

    if (!r.success) {
      return sock.sendMessage(
        jid,
        {
          text:
            errors[r.reason] ||
            '❌ Equip gagal.'
        },
        { quoted: msg }
      )
    }

    return sock.sendMessage(
      jid,
      {
        text:
          `✅ *EQUIPPED*\n\n` +
          `${r.item.icon} *${r.item.name}*\n` +
          `📌 Slot: *${r.slot}*\n` +
          `✨ Enchant: *+${r.gear.enchant_level || 0}*`
      },
      { quoted: msg }
    )
  }
}
