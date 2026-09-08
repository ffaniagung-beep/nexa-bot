import {
  startAdventure
} from '../lib/rpg/combat.js'

import {
  sendBattleBoard
} from '../lib/rpg/battleBoard.js'

import {
  resolveProfileJid
} from '../lib/profile.js'

export default {
  name: 'adventure',
  aliases: ['adv'],
  category: 'RPG',
  description: 'Memulai adventure RPG',
  usage: '.adventure',

  async run({
    sock,
    msg,
    jid
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

    const errors = {
      NO_CLASS:
        '🧬 Pilih Class dulu dengan *.class*.',

      NO_HP:
        '❤️ HP kamu habis.\nGunakan *.potion* atau nanti *.rest*.',

      NO_RPG:
        '⚔️ Buka profil RPG dulu dengan *.rpg*.'
    }

    if (
      result.reason ===
      'ACTIVE_BATTLE'
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            `⚔️ Battle masih aktif 😭\n\n` +
            `Gunakan *.battle* untuk memunculkan board baru.`
        },
        {
          quoted: msg
        }
      )
    }

    if (!result.success) {
      return sock.sendMessage(
        jid,
        {
          text:
            errors[result.reason] ||
            '❌ Adventure gagal dimulai.'
        },
        {
          quoted: msg
        }
      )
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
