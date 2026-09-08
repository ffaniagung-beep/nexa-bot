import {
  getTarget
} from '../lib/group.js'

import {
  updateUser
} from '../lib/userdb.js'

export default {
  name: 'ban',

  category: 'BOT',
  description:
    'Melarang user menggunakan NEXA-BOT',
  usage:
    '.ban @user',

  ownerOnly: true,

  async run({
    sock,
    msg,
    jid,
    config
  }) {
    const target =
      getTarget(msg)

    if (!target) {
      await sock.sendMessage(
        jid,
        {
          text:
            `Mention/reply user.\n${config.prefix}ban @user`
        },
        {
          quoted: msg
        }
      )

      return
    }

    updateUser(
      target,
      {
        banned: true
      }
    )

    await sock.sendMessage(
      jid,
      {
        text:
          `🚫 User berhasil diban dari NEXA-BOT.`,
        mentions: [target]
      },
      {
        quoted: msg
      }
    )
  }
}
