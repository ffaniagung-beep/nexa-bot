import {
  getTarget
} from '../lib/group.js'

import {
  updateUser
} from '../lib/userdb.js'

export default {
  name: 'unban',

  category: 'BOT',
  description:
    'Membuka ban NEXA-BOT',
  usage:
    '.unban @user',

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
            `Mention/reply user.\n${config.prefix}unban @user`
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
        banned: false
      }
    )

    await sock.sendMessage(
      jid,
      {
        text:
          '✅ User berhasil di-unban.',
        mentions: [target]
      },
      {
        quoted: msg
      }
    )
  }
}
