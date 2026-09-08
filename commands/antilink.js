import {
  getGroupConfig,
  updateGroupConfig
} from '../lib/groupdb.js'

export default {
  name: 'antilink',

  category: 'GROUP',
  description:
    'Memblokir link invite grup WhatsApp',
  usage:
    '.antilink on/off',

  groupOnly: true,
  adminOnly: true,

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
      getGroupConfig(jid)

    if (!action) {
      await sock.sendMessage(
        jid,
        {
          text:
            `╭─ *Anti-Link*\n` +
            `│ Status: ${
              data.antiLink
                ? 'ON ✅'
                : 'OFF ❌'
            }\n` +
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

    updateGroupConfig(
      jid,
      {
        antiLink: enabled
      }
    )

    await sock.sendMessage(
      jid,
      {
        text:
          enabled
            ? '🛡️ Anti-link diaktifkan.\nLink invite grup dari member akan dihapus.'
            : '🔓 Anti-link dimatikan.'
      },
      {
        quoted: msg
      }
    )
  }
}
