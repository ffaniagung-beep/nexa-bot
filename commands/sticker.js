import {
  getMediaSource,
  downloadMedia,
  imageToSticker,
  videoToSticker
} from '../lib/maker.js'

export default {
  name:
    'sticker',

  aliases: [
    's',
    'stiker'
  ],

  category:
    'MAKER',

  description:
    'Mengubah foto/video menjadi sticker',

  usage:
    '.sticker',

  async run({
    sock,
    msg,
    jid
  }) {
    const source =
      getMediaSource(
        msg
      )

    if (
      !source ||
      ![
        'image',
        'video'
      ].includes(
        source.type
      )
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            `🖼️ *STICKER MAKER*\n\n` +
            `Reply foto atau video dengan:\n` +
            `*.sticker*\n\n` +
            `Alias:\n` +
            `*.s*\n\n` +
            `Video maksimal diproses sekitar *6 detik*.`
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
      const buffer =
        await downloadMedia(
          source
        )

      if (
        source.type ===
        'image'
      ) {
        result =
          await imageToSticker(
            buffer
          )
      } else {
        result =
          await videoToSticker(
            buffer
          )
      }

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
        '🖼️ Sticker error:',
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
            `⚠️ Gagal membuat sticker.\n\n` +
            `Pastikan medianya foto atau video yang valid.`
        },
        {
          quoted:
            msg
        }
      )
    } finally {
      try {
        result?.cleanup()
      } catch {}
    }
  }
}
