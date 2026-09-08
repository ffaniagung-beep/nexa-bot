import {
  unequipRpgGear
} from '../lib/rpg/store.js'

import {
  resolveProfileJid
} from '../lib/profile.js'

export default {
  name: 'unequip',
  aliases: [],
  category: 'RPG',
  menuHidden: true,
  description: 'Melepas equipment RPG',
  usage: '.unequip weapon/armor/accessory',

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
            `⚔️ Gunakan:\n` +
            `*.unequip weapon*\n` +
            `*.unequip armor*\n` +
            `*.unequip accessory*`
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
      unequipRpgGear(
        userJid,
        args[0]
      )

    const errors = {
      INVALID_SLOT:
        '❌ Slot: weapon / armor / accessory.',

      SLOT_EMPTY:
        '📭 Slot itu sudah kosong.'
    }

    if (!r.success) {
      return sock.sendMessage(
        jid,
        {
          text:
            errors[r.reason] ||
            '❌ Unequip gagal.'
        },
        { quoted: msg }
      )
    }

    return sock.sendMessage(
      jid,
      {
        text:
          `✅ Equipment slot *${r.slot}* dilepas.`
      },
      { quoted: msg }
    )
  }
}
