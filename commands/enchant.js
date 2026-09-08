import {
  enchantRpgGear
} from '../lib/rpg/store.js'

import {
  resolveProfileJid
} from '../lib/profile.js'

function num(value) {
  return Number(value || 0)
    .toLocaleString('id-ID')
}

export default {
  name: 'enchant',
  aliases: [],
  category: 'RPG',
  menuHidden: true,
  description: 'Upgrade equipment hingga +10',
  usage: '.enchant #GEAR',

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
            `✨ Gunakan:\n` +
            `*.enchant #GEAR*\n\n` +
            `Kode gear ada di *.inventory*.\n` +
            `Enchant selalu berhasil ✅`
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
      enchantRpgGear(
        userJid,
        args[0]
      )

    if (!r.success) {
      if (
        r.reason ===
        'MONEY_LOW'
      ) {
        return sock.sendMessage(
          jid,
          {
            text:
              `💸 Money kurang.\n\n` +
              `Butuh: *${num(
                r.requirement?.money
              )} Money*`
          },
          { quoted: msg }
        )
      }

      if (
        r.reason ===
        'MATERIAL_LOW'
      ) {
        const req =
          r.requirement

        return sock.sendMessage(
          jid,
          {
            text:
              `📦 Material kurang.\n\n` +
              `${req.material.icon} *${req.material.name}*\n` +
              `Butuh: *${req.materialQty}*\n` +
              `Punya: *${r.owned}*`
          },
          { quoted: msg }
        )
      }

      const errors = {
        GEAR_NOT_FOUND:
          '❌ Gear tidak ditemukan.',

        MAX_ENCHANT:
          '✨ Gear itu sudah mencapai *+10 MAX*.',

        INVALID_GEAR:
          '❌ Item itu tidak bisa di-enchant.'
      }

      return sock.sendMessage(
        jid,
        {
          text:
            errors[r.reason] ||
            '❌ Enchant gagal.'
        },
        { quoted: msg }
      )
    }

    return sock.sendMessage(
      jid,
      {
        text:
          `╭━━〔 ✨ *ENCHANT SUCCESS* 〕━━╮\n` +
          `│\n` +
          `│ ${r.item.icon} *${r.item.name}*\n` +
          `│ +${r.oldLevel} → *+${r.newLevel}*\n` +
          `│\n` +
          `│ 💵 -${num(r.requirement.money)} Money\n` +
          `│ ${r.requirement.material.icon} ` +
          `-${r.requirement.materialQty} ` +
          `${r.requirement.material.name}\n` +
          `│\n` +
          `│ ✅ Tidak ada chance gagal.\n` +
          `│\n` +
          `╰━━━━━━━━━━━━━━━━╯`
      },
      { quoted: msg }
    )
  }
}
