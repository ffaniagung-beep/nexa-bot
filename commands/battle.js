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
  name: 'battle',
  aliases: ['fight'],
  category: 'RPG',
  description: 'Memunculkan ulang Battle Board',
  usage: '.battle',

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

    const sent =
      await sendBattleBoard({
        sock,
        msg,
        jid,
        userJid,

        status:
          '🔄 Battle Board diperbarui.'
      })

    if (!sent) {
      return sendRpgQuickPanel({
        sock,
        msg,
        jid,
        title:
          '🌲 TIDAK ADA BATTLE',
        body:
          'Mulai encounter baru lewat Adventure.',
        actions: [
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
}
