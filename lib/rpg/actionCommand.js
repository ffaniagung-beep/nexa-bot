import {
  resolveProfileJid
} from '../profile.js'

import {
  runBattleAction
} from './battleBoard.js'

export function makeBattleActionCommand({
  name,
  aliases = [],
  action,
  description
}) {
  return {
    name,
    aliases,
    category: 'RPG',
    menuHidden: true,
    description,
    usage:
      `.${name}`,

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

      const result =
        await runBattleAction({
          sock,
          msg,
          jid,
          userJid,
          action,
          isOwner:
            Boolean(isOwner)
        })

      if (!result.handled) {
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
}
