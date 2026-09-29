import {
  getBotDB,
  updateBotDB
} from '../lib/botdb.js'

export default {
  name: 'antispam',

  category: 'BOT',
  description:
    'Mengatur anti-spam untuk bot ini',
  usage:
    '.antispam on/off',

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
            `Anti-Spam: *${db.antiSpam ? 'ON ✅' : 'OFF ❌'}*\n\n` +
            `${config.prefix}antispam on\n` +
            `${config.prefix}antispam off`
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
      antiSpam: enabled
    })

    await sock.sendMessage(
      jid,
      {
        text:
          enabled
            ? '🛡️ Anti-spam bot ini aktif.'
            : '🔓 Anti-spam bot ini dimatikan.'
      },
      {
        quoted: msg
      }
    )
  }
}
