import {
  ensureBotManagerStarted,
  getManagedBotInfo,
  isManagerHost
} from '../lib/botManager.js'

ensureBotManagerStarted()

function dateText(
  value
) {
  if (!value) {
    return '-'
  }

  try {
    return new Date(
      value
    ).toLocaleString(
      'id-ID'
    )
  } catch {
    return '-'
  }
}

export default {
  name:
    'botinfo',

  aliases: [
    'infobot'
  ],

  category:
    'OWNER',

  ownerOnly:
    true,

  description:
    'Melihat detail satu bot tambahan',

  usage:
    '.botinfo bot_xxxx_xxxx',

  async run({
    sock,
    msg,
    jid,
    args
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

    const id =
      String(
        args?.[0] || ''
      ).trim()

    if (!id) {
      await sock.sendMessage(
        jid,
        {
          text:
            'Gunakan:\n`.botinfo <id>`\n\nLihat ID dengan `.listbot`.'
        },
        {
          quoted:
            msg
        }
      )

      return
    }

    const bot =
      getManagedBotInfo(
        id
      )

    if (!bot) {
      await sock.sendMessage(
        jid,
        {
          text:
            `❌ Bot \`${id}\` tidak ditemukan.`
        },
        {
          quoted:
            msg
        }
      )

      return
    }

    const lines = [
      '✦ *NEXA • BOT INFO*',
      '',
      `🤖 ID: \`${bot.id}\``,
      `📱 Nomor: \`${bot.numberMasked || bot.number || '-'}\``,
      `📡 Status: *${bot.runtimeStatus || 'offline'}*`,
      `🔐 Paired: *${bot.paired ? 'Ya' : 'Belum'}*`,
      `🧩 PID: \`${bot.pid || '-'}\``,
      `👤 WA JID: \`${bot.userJid || '-'}\``,
      `🕒 Ditambahkan: ${dateText(bot.addedAt)}`,
      `🟢 Terakhir online: ${dateText(bot.lastOnlineAt)}`,
      '',
      `📂 Session: \`${bot.sessionPath}\``
    ]

    if (
      bot.pairingCode &&
      !String(
        jid || ''
      ).endsWith(
        '@g.us'
      )
    ) {
      lines.push(
        '',
        '🔑 *Pairing code aktif:*',
        `\`${bot.pairingCode}\``
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
