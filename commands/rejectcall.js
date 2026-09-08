import {
  getBotDB,
  updateBotDB
} from '../lib/botdb.js'

export default {
  name: 'rejectcall',

  category: 'BOT',
  description:
    'Menolak panggilan masuk ke bot',
  usage:
    '.rejectcall on/off',

  ownerOnly: true,

  async run({
    sock,
    msg,
    jid,
    args,
    config
  }) {
    const action =
      args[0]?.toLowerCase()

    if (!action) {
      const db =
        getBotDB()

      await sock.sendMessage(
        jid,
        {
          text:
            `Reject Call: *${db.rejectCall ? 'ON ✅' : 'OFF ❌'}*`
        },
        {
          quoted: msg
        }
      )

      return
    }

    if (
      action !== 'on' &&
      action !== 'off'
    ) {
      return
    }

    const enabled =
      action === 'on'

    updateBotDB({
      rejectCall: enabled
    })

    await sock.sendMessage(
      jid,
      {
        text:
          enabled
            ? '📵 Call protection aktif.'
            : '📞 Call protection dimatikan.'
      },
      {
        quoted: msg
      }
    )
  }
}
