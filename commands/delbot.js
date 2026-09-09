import {
  ensureBotManagerStarted,
  removeManagedBot,
  isManagerHost
} from '../lib/botManager.js'

ensureBotManagerStarted()

export default {
  name:
    'delbot',

  aliases: [
    'removebot',
    'hapusbot'
  ],

  category:
    'OWNER',

  ownerOnly:
    true,

  description:
    'Menghapus bot tambahan beserta session-nya',

  usage:
    '.delbot bot_xxxx_xxxx confirm',

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

    const confirm =
      String(
        args?.[1] || ''
      ).toLowerCase()

    if (
      !id ||
      confirm !== 'confirm'
    ) {
      await sock.sendMessage(
        jid,
        {
          text:
            '⚠️ *Penghapusan session permanen*\n\n' +
            'Gunakan:\n' +
            '`.delbot <id> confirm`\n\n' +
            'ID dapat dilihat lewat `.listbot`.'
        },
        {
          quoted:
            msg
        }
      )

      return
    }

    try {
      const removed =
        await removeManagedBot(
          id
        )

      await sock.sendMessage(
        jid,
        {
          text:
            '✦ *NEXA • BOT MANAGER*\n\n' +
            `✅ \`${removed.id}\` dihapus.\n` +
            'Session bot tambahan tersebut juga sudah dihapus.'
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
            `❌ Hapus bot gagal: ${error?.message || error}`
        },
        {
          quoted:
            msg
        }
      )
    }
  }
}
