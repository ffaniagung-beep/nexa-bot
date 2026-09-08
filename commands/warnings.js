import {
  getTarget
} from '../lib/group.js'

import {
  getWarning
} from '../lib/groupdb.js'

export default {
  name: 'warnings',
  aliases: ['cekwarn'],

  category: 'GROUP',
  description:
    'Mengecek warning member',
  usage:
    '.warnings @user',

  groupOnly: true,

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
            `${config.prefix}warnings @user`
        },
        {
          quoted: msg
        }
      )

      return
    }

    const count =
      getWarning(
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
          `╭─ *Warning Status*\n` +
          `│ 👤 ${mention}\n` +
          `│ ⚠️ ${count}/3\n` +
          `╰────────────`,
        mentions: [target]
      },
      {
        quoted: msg
      }
    )
  }
}
