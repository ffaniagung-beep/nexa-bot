import {
  getDisabledGroupCommands,
  getDisabledGroupCommandMeta
} from '../lib/groupCommandControl.js'

function formatTime(
  timestamp
) {
  const value =
    Number(
      timestamp
    )

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return null
  }

  try {
    return new Intl.DateTimeFormat(
      'id-ID',
      {
        dateStyle:
          'medium',
        timeStyle:
          'short',
        timeZone:
          'Asia/Jakarta'
      }
    ).format(
      new Date(value)
    )
  } catch {
    return null
  }
}

export default {
  name: 'offcmdlist',

  aliases: [
    'listoffcmd',
    'disabledcmd'
  ],

  category: 'GROUP',

  description:
    'Melihat command yang dimatikan di grup',

  usage:
    '.offcmdlist',

  groupOnly: true,
  adminOnly: true,

  async run({
    sock,
    msg,
    jid
  }) {
    const disabled =
      getDisabledGroupCommands(
        jid
      )

    if (!disabled.length) {
      await sock.sendMessage(
        jid,
        {
          text:
            `✦ *NEXA • COMMAND CONTROL*\n\n` +
            `🟢 Tidak ada command yang dinonaktifkan di grup ini.`
        },
        {
          quoted: msg
        }
      )

      return
    }

    const meta =
      getDisabledGroupCommandMeta(
        jid
      )

    const rows =
      disabled.map(
        (name, index) => {
          const when =
            formatTime(
              meta?.[name]?.at
            )

          return (
            `${String(index + 1).padStart(2, '0')}. \`${name}\`` +
            (
              when
                ? `\n    ↳ ${when} WIB`
                : ''
            )
          )
        }
      )

    await sock.sendMessage(
      jid,
      {
        text:
          `✦ *NEXA • DISABLED COMMANDS*\n\n` +
          `${rows.join('\n')}\n\n` +
          `Total: *${disabled.length}* command dinonaktifkan.\n` +
          `👑 Owner tetap bypass semuanya.`
      },
      {
        quoted: msg
      }
    )
  }
}
