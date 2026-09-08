import {
  getBotDB,
  updateBotDB
} from '../lib/botdb.js'

export default {
  name: 'antispam',

  category: 'BOT',
  description:
    'Mengatur anti-spam global',
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
            ? '🛡️ Anti-spam global aktif.'
            : '🔓 Anti-spam global dimatikan.'
      },
      {
        quoted: msg
      }
    )
  }
}
