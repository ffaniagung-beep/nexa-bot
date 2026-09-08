import {
  getRpgProfile,
  getRpgRequiredExp,
  RPG_CLASSES
} from '../lib/rpg/core.js'

import {
  getEquipmentStats
} from '../lib/rpg/store.js'

import {
  getRpgJid,
  rpgNum
} from '../lib/rpg/ui.js'

export default {
  name: 'stats',
  aliases: [],
  category: 'RPG',
  description: 'Melihat statistik karakter RPG',
  usage: '.stats',

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

    const stat =
      getEquipmentStats(
        userJid
      )

    const c =
      p?.class
        ? RPG_CLASSES[p.class]
        : null

    const text =
      `╭━━━━〔 📊 *RPG STATS* 〕━━━━╮\n` +
      `│\n` +
      `│ 🧬 ${
        c
          ? `${c.icon} *${c.name}*`
          : '*No Class*'
      }\n` +
      `│ ⭐ Level : *${p.level}*\n` +
      `│ ✨ EXP   : *${rpgNum(p.exp)}/${rpgNum(
        getRpgRequiredExp(p.level)
      )}*\n` +
      `│\n` +
      `├──────〔 ❤️ *STATUS* 〕──────\n` +
      `│ ❤️ HP   : *${p.hp}/${p.maxHp}*\n` +
      `│ 🔷 Mana : *${p.mana}/${p.maxMana}*\n` +
      `│\n` +
      `├──────〔 ⚔️ *COMBAT* 〕──────\n` +
      `│ ⚔️ ATK\n` +
      `│ Base ${stat.baseAttack} + Gear ${stat.gearAttack}\n` +
      `│ = *${stat.totalAttack}*\n` +
      `│\n` +
      `│ 🛡 DEF\n` +
      `│ Base ${stat.baseDefense} + Gear ${stat.gearDefense}\n` +
      `│ = *${stat.totalDefense}*\n` +
      `│\n` +
      `├──────〔 💰 *WEALTH* 〕──────\n` +
      `│ 💵 Wallet : *${rpgNum(p.money)}*\n` +
      `│ 🏦 Bank   : *${rpgNum(p.bankMoney)}*\n` +
      `│ 🚨 Wanted : *${p.wanted}*\n` +
      `│\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━━━╯`

    return sock.sendMessage(
      jid,
      { text },
      { quoted: msg }
    )
  }
}
