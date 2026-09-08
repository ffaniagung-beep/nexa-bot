import {
  getRpgProfile,
  getRpgRequiredExp,
  getRpgEquipment,
  RPG_CLASSES
} from '../lib/rpg/core.js'

import {
  getRpgJid,
  rpgNum
} from '../lib/rpg/ui.js'

export default {
  name: 'rpg',
  aliases: [],
  category: 'RPG',
  description: 'Melihat profil RPG',
  usage: '.rpg',

  async run({
    sock,
    msg,
    jid
  }) {
    const userJid =
      await getRpgJid({
        sock,
        msg,
        jid
      })

    const p =
      getRpgProfile(
        userJid
      )

    if (!p) {
      return
    }

    const info =
      p.class
        ? RPG_CLASSES[
            p.class
          ]
        : null

    const equip =
      getRpgEquipment(
        userJid
      )

    const weapon =
      equip?.weapon?.item
        ? (
            `${equip.weapon.item.icon} ` +
            `${equip.weapon.item.name}` +
            (
              equip.weapon.enchant_level
                ? ` +${equip.weapon.enchant_level}`
                : ''
            )
          )
        : '-'

    const text =
      `╭━━〔 ⚔️ *RPG PROFILE* 〕━━╮\n` +
      `│\n` +
      `│ 🧬 Class : *${
        info
          ? `${info.icon} ${info.name}`
          : 'Belum dipilih'
      }*\n` +
      `│ ⭐ Level : *${p.level}*\n` +
      `│ ✨ EXP   : *${rpgNum(p.exp)}/${rpgNum(
        getRpgRequiredExp(p.level)
      )}*\n` +
      `│\n` +
      `│ ❤️ HP   : *${p.hp}/${p.maxHp}*\n` +
      `│ 🔷 Mana : *${p.mana}/${p.maxMana}*\n` +
      `│ ⚔️ ATK  : *${p.attack}*\n` +
      `│ 🛡 DEF  : *${p.defense}*\n` +
      `│\n` +
      `│ 💵 Money : *${rpgNum(p.money)}*\n` +
      `│ 🏦 Bank  : *${rpgNum(p.bankMoney)}*\n` +
      `│ 🚨 Wanted: *${p.wanted}*\n` +
      `│\n` +
      `│ 🗡️ Weapon:\n` +
      `│ ${weapon}\n` +
      `│\n` +
      `╰━━━━━━━━━━━━━━━━╯` +
      (
        p.class
          ? ''
          : `\n\n💡 Pilih class dengan *.class*`
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
