import {
  getBotDB,
  updateBotDB
} from '../lib/botdb.js'

export default {
  name: 'callmode',

  category: 'BOT',
  description:
    'Mengatur tindakan saat bot ditelepon',
  usage:
    '.callmode warn/block',

  ownerOnly: true,

  async run({
    sock,
    msg,
    jid,
    args,
    config
  }) {
    const mode =
      args[0]?.toLowerCase()

    if (!mode) {
      const db =
        getBotDB()

      await sock.sendMessage(
        jid,
        {
          text:
            `Call mode: *${db.callMode}*\n\n` +
            `${config.prefix}callmode warn\n` +
            `${config.prefix}callmode block`
        },
        {
          quoted: msg
        }
      )

      return
    }

    if (
      mode !== 'warn' &&
      mode !== 'block'
    ) {
      return
    }

    updateBotDB({
      callMode: mode
    })

    await sock.sendMessage(
      jid,
      {
        text:
          `✅ Call mode → *${mode}*`
      },
      {
        quoted: msg
      }
    )
  }
}
