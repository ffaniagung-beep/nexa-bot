import {
  getTarget
} from '../lib/group.js'

import {
  resetWarning
} from '../lib/groupdb.js'

export default {
  name: 'resetwarn',

  category: 'GROUP',
  description:
    'Menghapus warning member',
  usage:
    '.resetwarn @user',

  groupOnly: true,
  adminOnly: true,

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
            `Mention atau reply member.\n\n` +
            `${config.prefix}resetwarn @user`
        },
        {
          quoted: msg
        }
      )

      return
    }

    resetWarning(
      jid,
      target
    )

    const mention =
      `@${String(target)
        .split('@')[0]}`

    await sock.sendMessage(
      jid,
      {
        text:
          `✅ Warning ${mention} sudah di-reset.`,
        mentions: [target]
      },
      {
        quoted: msg
      }
    )
  }
}
