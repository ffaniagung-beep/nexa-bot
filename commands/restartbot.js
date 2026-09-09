import {
  ensureBotManagerStarted,
  restartManagedBot,
  isManagerHost
} from '../lib/botManager.js'

ensureBotManagerStarted()

export default {
  name:
    'restartbot',

  aliases: [
    'rebot'
  ],

  category:
    'OWNER',

  ownerOnly:
    true,

  description:
    'Restart satu bot tambahan',

  usage:
    '.restartbot bot_xxxx_xxxx',

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
            'Gunakan:\n`.restartbot <id>`\n\nLihat ID dengan `.listbot`.'
        },
        {
          quoted:
            msg
        }
      )

      return
    }

    try {
      await restartManagedBot(
        id
      )

      await sock.sendMessage(
        jid,
        {
          text:
            '✦ *NEXA • BOT MANAGER*\n\n' +
            `🔄 \`${id}\` sedang direstart.\n\n` +
            'Cek status beberapa detik lagi dengan `.listbot`.'
        },
        {
          quoted:
            msg
        }
      )
    } catch (
      error
    ) {
      await sock.sendMessage(
        jid,
        {
          text:
            `❌ Restart gagal: ${error?.message || error}`
        },
        {
          quoted:
            msg
        }
      )
    }
  }
}
