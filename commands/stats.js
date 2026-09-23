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

import {
  rpgBar,
  rpgCommand,
  sendRpgQuickPanel
} from '../lib/rpg/uxV2.js'

export default {
  name: 'stats',
  aliases: [],
  category: 'RPG',
  description: 'Melihat statistik karakter RPG',
  usage: '.stats',

  async run({
    sock,
    msg,
    jid,
    config
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

    const body =
      `${c?.icon || '🧬'} *${c?.name || 'No Class'}* • Lv.${p.level}\n` +
      `✨ EXP ${rpgNum(p.exp)}/${rpgNum(getRpgRequiredExp(p.level))}\n\n` +
      `❤️ ${rpgBar(p.hp, p.maxHp)} ${p.hp}/${p.maxHp}\n` +
      `🔷 ${rpgBar(p.mana, p.maxMana)} ${p.mana}/${p.maxMana}\n\n` +
      `⚔️ ATK  ${stat.baseAttack} + ${stat.gearAttack} gear = *${stat.totalAttack}*\n` +
      `🛡 DEF  ${stat.baseDefense} + ${stat.gearDefense} gear = *${stat.totalDefense}*\n\n` +
      `💵 Wallet *${rpgNum(p.money)}*  •  🏦 Bank *${rpgNum(p.bankMoney)}*\n` +
      `🚨 Wanted *${p.wanted}/5*`

    return sendRpgQuickPanel({
      sock,
      msg,
      jid,
      title:
        '📊 NEXA • RPG STATS',
      body,
      actions: [
        {
          text: '👤 Profile',
          id: rpgCommand(config, 'rpg')
        },
        {
          text: '🎒 Inventory',
          id: rpgCommand(config, 'inventory')
        },
        {
          text: '🌲 Adventure',
          id: rpgCommand(config, 'adventure')
        },
        {
          text: '🗺️ Region',
          id: rpgCommand(config, 'region')
        },
        {
          text: '⚔️ RPG Hub',
          id: rpgCommand(config, 'menu', 'rpg')
        }
      ]
    })
  }
}
