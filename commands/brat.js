import {
  createBratSticker
} from '../lib/brat.js'

export default {
  name:
    'brat',

  aliases: [
    'bratsticker'
  ],

  category:
    'MAKER',

  description:
    'Membuat sticker teks bergaya BRAT',

  usage:
    '.brat <teks>',

  async run({
    sock,
    msg,
    jid,
    args,
    config
  }) {
    const text =
      args
        .join(' ')
        .trim()

    if (!text) {
      return sock.sendMessage(
        jid,
        {
          text:
            `🟢 *BRAT STICKER*\n\n` +
            `Gunakan:\n` +
            `*${config.prefix}brat <teks>*\n\n` +
            `Contoh:\n` +
            `*${config.prefix}brat nexa paling gacor*`
        },
        {
          quoted:
            msg
        }
      )
    }

    if (
      text.length >
      120
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            `⚠️ Teks BRAT maksimal *120 karakter*.`
        },
        {
          quoted:
            msg
        }
      )
    }

    await sock.sendMessage(
      jid,
      {
        react: {
          text:
            '⏳',

          key:
            msg.key
        }
      }
    )

    let result

    try {
      result =
        await createBratSticker(
          text
        )

      await sock.sendMessage(
        jid,
        {
          sticker:
            result.buffer
        },
        {
          quoted:
            msg
        }
      )

      await sock.sendMessage(
        jid,
        {
          react: {
            text:
              '✅',

          key:
              msg.key
          }
        }
      )
    } catch (err) {
      console.error(
        '🟢 Brat error:',
        err
      )

      await sock.sendMessage(
        jid,
        {
          react: {
            text:
              '❌',

          key:
              msg.key
          }
        }
      )

      await sock.sendMessage(
        jid,
        {
          text:
            `⚠️ Gagal membuat BRAT sticker.\n\n` +
            `Kalau error menyebut *drawtext*, berarti FFmpeg Termux belum punya filter teks.`
        },
        {
          quoted:
            msg
        }
      )
    } finally {
      try {
        result
          ?.cleanup()
      } catch {}
    }
  }
}
