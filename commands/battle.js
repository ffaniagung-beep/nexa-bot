import {
  sendBattleBoard
} from '../lib/rpg/battleBoard.js'

import {
  resolveProfileJid
} from '../lib/profile.js'

export default {
  name: 'battle',
  aliases: ['fight'],
  category: 'RPG',
  description: 'Memunculkan ulang Battle Board',
  usage: '.battle',

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
      return sock.sendMessage(
        jid,
        {
          text:
            `🌲 Tidak ada battle aktif.\n\n` +
            `Gunakan *.adventure*.`
        },
        {
          quoted: msg
        }
      )
    }
  }
}
