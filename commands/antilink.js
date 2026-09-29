import {
  getBotDB,
  updateBotDB
} from '../lib/botdb.js'

export default {
  name: 'antilink',

  category: 'BOT',
  description:
    'Mengatur proteksi link grup untuk bot ini',
  usage:
    '.antilink on/off',

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

    const data =
      getBotDB()

    if (!action) {
      await sock.sendMessage(
        jid,
        {
          text:
            `╭─ *Anti-Link Bot*\n` +
            `│ Status: ${
              data.antiLink
                ? 'ON ✅'
                : 'OFF ❌'
            }\n` +
            `│ Berlaku: semua grup yang dilayani bot ini\n` +
            `│ Max Warn: 3\n` +
            `╰────────────\n\n` +
            `${config.prefix}antilink on\n` +
            `${config.prefix}antilink off`
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
      await sock.sendMessage(
        jid,
        {
          text:
            `Gunakan:\n` +
            `${config.prefix}antilink on\n` +
            `${config.prefix}antilink off`
        },
        {
          quoted: msg
        }
      )

      return
    }

    const enabled =
      action === 'on'

    updateBotDB({
      antiLink: enabled
    })

    await sock.sendMessage(
      jid,
      {
        text:
          enabled
            ? '🛡️ Anti-link bot aktif. Berlaku di semua grup yang dilayani bot ini.'
            : '🔓 Anti-link bot dimatikan.'
      },
      {
        quoted: msg
      }
    )
  }
}
