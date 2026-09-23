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

import {
  rpgBar,
  rpgCommand,
  sendRpgQuickPanel
} from '../lib/rpg/uxV2.js'

export default {
  name: 'rpg',
  aliases: [],
  category: 'RPG',
  description: 'Melihat profil RPG',
  usage: '.rpg',

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

    const body =
      `${info?.icon || '🧬'} *${info?.name || 'Belum dipilih'}* • Lv.${p.level}\n` +
      `✨ EXP ${rpgNum(p.exp)}/${rpgNum(getRpgRequiredExp(p.level))}\n\n` +
      `❤️ ${rpgBar(p.hp, p.maxHp)} ${p.hp}/${p.maxHp}\n` +
      `🔷 ${rpgBar(p.mana, p.maxMana)} ${p.mana}/${p.maxMana}\n` +
      `⚔️ ATK *${p.attack}*  •  🛡 DEF *${p.defense}*\n\n` +
      `💵 Wallet *${rpgNum(p.money)}*\n` +
      `🏦 Bank *${rpgNum(p.bankMoney)}*\n` +
      `🚨 Wanted *${p.wanted}/5*\n\n` +
      `🗡️ Weapon: ${weapon}` +
      (
        p.class
          ? ''
          : `\n\n💡 Pilih class untuk membuka progression.`
      )

    const actions = [
      {
        text: '📊 Stats',
        id: rpgCommand(config, 'stats')
      },
      {
        text: '🌲 Adventure',
        id: rpgCommand(config, 'adventure')
      },
      {
        text: '🎒 Inventory',
        id: rpgCommand(config, 'inventory')
      },
      {
        text: '🛒 Store',
        id: rpgCommand(config, 'rpgshop')
      },
      {
        text: '🏦 Bank',
        id: rpgCommand(config, 'bank')
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

    if (!p.class) {
      actions.unshift({
        text: '🧬 Pilih Class',
        id: rpgCommand(config, 'class')
      })
    }

    return sendRpgQuickPanel({
      sock,
      msg,
      jid,
      title:
        '⚔️ NEXA • RPG PROFILE',
      body,
      actions
    })
  }
}
