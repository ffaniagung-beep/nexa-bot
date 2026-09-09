import {
  ensureBotManagerStarted,
  getManagedBots,
  isManagerHost
} from '../lib/botManager.js'

ensureBotManagerStarted()

function icon(
  status
) {
  const value =
    String(
      status || ''
    ).toLowerCase()

  if (
    value === 'online'
  ) {
    return '🟢'
  }

  if (
    value === 'pairing' ||
    value === 'starting' ||
    value === 'restarting'
  ) {
    return '🟡'
  }

  if (
    value === 'logged-out'
  ) {
    return '🔐'
  }

  return '🔴'
}

export default {
  name:
    'listbot',

  aliases: [
    'bots',
    'botlist'
  ],

  category:
    'OWNER',

  ownerOnly:
    true,

  description:
    'Melihat bot NEXA yang terdaftar',

  usage:
    '.listbot',

  async run({
    sock,
    msg,
    jid
  }) {
    if (
      !isManagerHost()
    ) {
      await sock.sendMessage(
        jid,
        {
          text:
            '⚠️ Jalankan Bot Manager dari *NEXA Main*.'
        },
        {
          quoted:
            msg
        }
      )

      return
    }

    const bots =
      getManagedBots()

    const lines = [
      '✦ *NEXA • BOT MANAGER*',
      '',
      '🟢 *MAIN*',
      `   JID: \`${sock.user?.id || 'unknown'}\``,
      `   PID: \`${process.pid}\``,
      ''
    ]

    if (!bots.length) {
      lines.push(
        'Belum ada bot tambahan.',
        '',
        'Tambah dengan:',
        '`.addbot 628xxxxxxxxxx`'
      )
    } else {
      bots.forEach(
        (
          bot,
          index
        ) => {
          lines.push(
            `${icon(bot.runtimeStatus)} *${index + 1}. ${bot.id}*`,
            `   Nomor: \`${bot.numberMasked || bot.number || '-'}\``,
            `   Status: *${bot.runtimeStatus || 'offline'}*`,
            `   Session: \`${bot.paired ? 'paired' : 'belum paired'}\``,
            `   PID: \`${bot.pid || '-'}\``,
            ''
          )
        }
      )

      lines.push(
        `Total: *${1 + bots.length} bot* termasuk Main.`
      )
    }

    await sock.sendMessage(
      jid,
      {
        text:
          lines.join(
            '\n'
          )
      },
      {
        quoted:
          msg
      }
    )
  }
}
