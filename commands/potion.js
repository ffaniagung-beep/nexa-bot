import {
  getBattle,
  usePotion
} from '../lib/rpg/combat.js'

import {
  runBattleAction
} from '../lib/rpg/battleBoard.js'

import {
  resolveProfileJid
} from '../lib/profile.js'

import {
  rpgCommand,
  sendRpgQuickPanel
} from '../lib/rpg/uxV2.js'

export default {
  name: 'potion',
  aliases: ['heal'],
  category: 'RPG',
  description: 'Menggunakan Small Potion',
  usage: '.potion',

  async run({
    sock,
    msg,
    jid,
    isOwner,
    config
  }) {
    const userJid =
      await resolveProfileJid(
        sock,
        msg,
        jid
      )

    const active =
      getBattle(
        userJid
      )

    if (active?.battle) {
      await runBattleAction({
        sock,
        msg,
        jid,
        userJid,
        action:
          'potion',

        isOwner:
          Boolean(isOwner)
      })

      return
    }

    const result =
      usePotion(
        userJid,
        {
          isOwner:
            Boolean(isOwner)
        }
      )

    if (!result.success) {
      const errors = {
        FULL_HP:
          '❤️ HP kamu sudah penuh.',
        NO_POTION:
          '🧪 Small Potion kamu habis.',
        NO_RPG:
          '❌ RPG profile belum ada.'
      }

      return sendRpgQuickPanel({
        sock,
        msg,
        jid,
        title:
          '🧪 POTION',
        body:
          errors[result.reason] ||
          '❌ Potion gagal digunakan.',
        actions: [
          {
            text: '🎒 Inventory',
            id: rpgCommand(config, 'inventory')
          },
          {
            text: '🛒 Store',
            id: rpgCommand(config, 'rpgshop')
          },
          {
            text: '⚔️ RPG Hub',
            id: rpgCommand(config, 'menu', 'rpg')
          }
        ]
      })
    }

    return sendRpgQuickPanel({
      sock,
      msg,
      jid,
      title:
        '🧪 SMALL POTION',
      body:
        `❤️ +${result.healed} HP\n` +
        `❤️ ${result.nextHp}/${result.maxHp}`,
      actions: [
        {
          text: '🌲 Adventure',
          id: rpgCommand(config, 'adventure')
        },
        {
          text: '🎒 Inventory',
          id: rpgCommand(config, 'inventory')
        },
        {
          text: '⚔️ RPG Hub',
          id: rpgCommand(config, 'menu', 'rpg')
        }
      ]
    })
  }
}
