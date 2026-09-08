import {
  downloadSocial,
  sizeMB,
  cleanupSocial
} from '../lib/socialdl.js'

export default {
  name: 'facebook',

  aliases: [
    'fb',
    'fbdl'
  ],

  category:
    'DOWNLOADER',

  description:
    'Download video Facebook',

  usage:
    '.facebook <url>',

  async run({
    sock,
    msg,
    jid,
    args,
    config
  }) {
    const url =
      args[0]

    if (
      !url ||
      !/(facebook\.com|fb\.watch)/i
        .test(url)
    ) {
      await sock.sendMessage(
        jid,
        {
          text:
            `🔵 Kirim link Facebook.\n\n` +
            `${config.prefix}facebook https://www.facebook.com/...`
        },
        {
          quoted: msg
        }
      )

      return
    }

    let file

    try {
      await sock.sendMessage(
        jid,
        {
          text:
            '⏳ Mengambil video Facebook...'
        },
        {
          quoted: msg
        }
      )

      const result =
        await downloadSocial(
          url,
          'facebook'
        )

      file =
        result.file

      const size =
        sizeMB(file)

      if (size > 50) {
        await sock.sendMessage(
          jid,
          {
            text:
              `❌ File terlalu besar: ${size.toFixed(1)} MB`
          },
          {
            quoted: msg
          }
        )

        return
      }

      await sock.sendMessage(
        jid,
        {
          video: {
            url: file
          },

          caption:
            '🔵 *NEXA Facebook Downloader*'
        },
        {
          quoted: msg
        }
      )
    } catch {
      await sock.sendMessage(
        jid,
        {
          text:
            '⚠️ Video Facebook gagal didownload.'
        },
        {
          quoted: msg
        }
      )
    } finally {
      cleanupSocial(file)
    }
  }
}
