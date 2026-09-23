import {
  startAdventure
} from '../lib/rpg/combat.js'

import {
  sendBattleBoard
} from '../lib/rpg/battleBoard.js'

import {
  resolveProfileJid
} from '../lib/profile.js'

import {
  rpgCommand,
  sendRpgQuickPanel
} from '../lib/rpg/uxV2.js'

export default {
  name: 'adventure',
  aliases: ['adv'],
  category: 'RPG',
  description: 'Memulai adventure RPG',
  usage: '.adventure',

  async run({
    sock,
    msg,
    jid,
    config
  }) {
    const userJid =
      await resolveProfileJid(
        sock,
        msg,
        jid
      )

    const result =
      startAdventure(
        userJid
      )

    if (
      result.reason ===
      'ACTIVE_BATTLE'
    ) {
      return sendRpgQuickPanel({
        sock,
        msg,
        jid,
        title:
          '⚔️ BATTLE MASIH AKTIF',
        body:
          'Lanjutkan battle yang sedang berjalan.',
        actions: [
          {
            text: '⚔️ Battle Board',
            id: rpgCommand(config, 'battle')
          },
          {
            text: '⚔️ RPG Hub',
            id: rpgCommand(config, 'menu', 'rpg')
          }
        ]
      })
    }

    if (!result.success) {
      const errors = {
        NO_CLASS:
          '🧬 Pilih Class dulu.',
        NO_HP:
          '❤️ HP kamu habis. Pulihkan dulu.',
        NO_RPG:
          '⚔️ Buka profil RPG dulu.'
      }

      const actions = [
        {
          text: '⚔️ RPG Hub',
          id: rpgCommand(config, 'menu', 'rpg')
        }
      ]

      if (result.reason === 'NO_CLASS') {
        actions.unshift({
          text: '🧬 Pilih Class',
          id: rpgCommand(config, 'class')
        })
      }

      if (result.reason === 'NO_HP') {
        actions.unshift(
          {
            text: '🛏️ Rest',
            id: rpgCommand(config, 'rest')
          },
          {
            text: '🧪 Potion',
            id: rpgCommand(config, 'potion')
          }
        )
      }

      return sendRpgQuickPanel({
        sock,
        msg,
        jid,
        title:
          '🌲 ADVENTURE BELUM DIMULAI',
        body:
          errors[result.reason] ||
          '❌ Adventure gagal dimulai.',
        actions
      })
    }

    await sendBattleBoard({
      sock,
      msg,
      jid,
      userJid,

      status:
        `${result.battle.monster_icon} ` +
        `${result.battle.monster_name} muncul!`
    })
  }
}
