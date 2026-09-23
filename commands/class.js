import {
  chooseRpgClass,
  RPG_CLASSES
} from '../lib/rpg/core.js'

import {
  getRpgJid
} from '../lib/rpg/ui.js'

import {
  rpgCommand,
  sendRpgQuickPanel
} from '../lib/rpg/uxV2.js'

export default {
  name: 'class',
  aliases: [],
  category: 'RPG',
  description: 'Memilih class karakter RPG',
  usage: '.class warrior/ranger/mage',

  async run({
    sock,
    msg,
    jid,
    args,
    isOwner,
    config
  }) {
    const choice =
      String(
        args?.[0] || ''
      ).trim()

    if (!choice) {
      const body =
        `⚔️ *Warrior*\n❤️ HP tinggi • 🛡 DEF tinggi\n\n` +
        `🏹 *Ranger*\n⚔️ ATK bagus • status seimbang\n\n` +
        `🔮 *Mage*\n🔷 Mana tinggi • ⚔️ ATK tinggi\n\n` +
        `Class hanya bisa dipilih sekali. Owner dapat override.`

      return sendRpgQuickPanel({
        sock,
        msg,
        jid,
        title:
          '🧬 NEXA • CLASS SELECT',
        body,
        actions: [
          {
            text: '⚔️ Warrior',
            id: rpgCommand(config, 'class', 'warrior')
          },
          {
            text: '🏹 Ranger',
            id: rpgCommand(config, 'class', 'ranger')
          },
          {
            text: '🔮 Mage',
            id: rpgCommand(config, 'class', 'mage')
          },
          {
            text: '⚔️ RPG Hub',
            id: rpgCommand(config, 'menu', 'rpg')
          }
        ]
      })
    }

    const userJid =
      await getRpgJid({
        sock,
        msg,
        jid
      })

    const result =
      chooseRpgClass(
        userJid,
        choice,
        {
          force:
            Boolean(
              isOwner
            )
        }
      )

    if (
      result.reason ===
      'INVALID_CLASS'
    ) {
      return sendRpgQuickPanel({
        sock,
        msg,
        jid,
        title:
          '🧬 CLASS TIDAK DIKENAL',
        body:
          'Pilih *Warrior*, *Ranger*, atau *Mage*.',
        actions: [
          {
            text: '⚔️ Warrior',
            id: rpgCommand(config, 'class', 'warrior')
          },
          {
            text: '🏹 Ranger',
            id: rpgCommand(config, 'class', 'ranger')
          },
          {
            text: '🔮 Mage',
            id: rpgCommand(config, 'class', 'mage')
          }
        ]
      })
    }

    if (
      result.reason ===
      'CLASS_LOCKED'
    ) {
      const current =
        RPG_CLASSES[
          result.profile.class
        ]

      return sendRpgQuickPanel({
        sock,
        msg,
        jid,
        title:
          '🔒 CLASS TERKUNCI',
        body:
          `Class aktif: ${current?.icon || '🧬'} *${current?.name || result.profile.class}*`,
        actions: [
          {
            text: '👤 Profile',
            id: rpgCommand(config, 'rpg')
          },
          {
            text: '⚔️ RPG Hub',
            id: rpgCommand(config, 'menu', 'rpg')
          }
        ]
      })
    }

    const p =
      result.profile

    const c =
      result.classInfo

    const body =
      `${c.icon} *${c.name}*\n\n` +
      `❤️ HP *${p.maxHp}*\n` +
      `🔷 Mana *${p.maxMana}*\n` +
      `⚔️ ATK *${p.attack}*\n` +
      `🛡 DEF *${p.defense}*` +
      (
        result.firstClass
          ? `\n\n🎁 Starter gear + *2 Small Potion* diterima.`
          : `\n\n😇 Owner class override.`
      )

    return sendRpgQuickPanel({
      sock,
      msg,
      jid,
      title:
        '✅ CLASS SELECTED',
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
          text: '⚔️ RPG Hub',
          id: rpgCommand(config, 'menu', 'rpg')
        }
      ]
    })
  }
}
