import {
  getGroupConfig,
  updateGroupConfig
} from '../lib/groupdb.js'

export default {
  name: 'welcome',

  category: 'GROUP',
  description:
    'Mengaktifkan atau mematikan welcome/goodbye',
  usage: '.welcome on/off',

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

    if (!action) {
      const data =
        getGroupConfig(jid)

      await sock.sendMessage(
        jid,
        {
          text:
            `╭─ *Welcome System*\n` +
            `│ Status: ${
              data.welcome
                ? 'ON ✅'
                : 'OFF ❌'
            }\n` +
            `╰────────────\n\n` +
            `${config.prefix}welcome on\n` +
            `${config.prefix}welcome off`
        },
        { quoted: msg }
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
            `${config.prefix}welcome on\n` +
            `${config.prefix}welcome off`
        },
        { quoted: msg }
      )

      return
    }

    const enabled =
      action === 'on'

    updateGroupConfig(
      jid,
      {
        welcome: enabled
      }
    )

    await sock.sendMessage(
      jid,
      {
        text:
          enabled
            ? '✅ Welcome & goodbye diaktifkan.'
            : '❌ Welcome & goodbye dimatikan.'
      },
      { quoted: msg }
    )
  }
}
