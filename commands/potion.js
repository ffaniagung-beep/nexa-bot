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
    isOwner
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

    const errors = {
      FULL_HP:
        '❤️ HP kamu sudah penuh.',

      NO_POTION:
        '🧪 Small Potion kamu habis 😭',

      NO_RPG:
        '❌ RPG profile belum ada.'
    }

    if (!result.success) {
      return sock.sendMessage(
        jid,
        {
          text:
            errors[result.reason] ||
            '❌ Potion gagal digunakan.'
        },
        {
          quoted: msg
        }
      )
    }

    return sock.sendMessage(
      jid,
      {
        text:
          `🧪 *SMALL POTION*\n\n` +
          `❤️ +${result.healed} HP\n` +
          `❤️ ${result.nextHp}/${result.maxHp}`
      },
      {
        quoted: msg
      }
    )
  }
}
