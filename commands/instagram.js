import {
  downloadSocial,
  sizeMB,
  cleanupSocial
} from '../lib/socialdl.js'

export default {
  name: 'instagram',

  aliases: [
    'ig',
    'igdl'
  ],

  category:
    'DOWNLOADER',

  description:
    'Download media Instagram',

  usage:
    '.instagram <url>',

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
      !/instagram\.com/i
        .test(url)
    ) {
      await sock.sendMessage(
        jid,
        {
          text:
            `📸 Kirim link Instagram.\n\n` +
            `${config.prefix}instagram https://www.instagram.com/reel/...`
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
            '⏳ Mengambil media Instagram...'
        },
        {
          quoted: msg
        }
      )

      const result =
        await downloadSocial(
          url,
          'instagram'
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
              `❌ File terlalu besar.\n` +
              `Ukuran: ${size.toFixed(1)} MB\n` +
              `Limit NEXA: 50 MB`
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
            `📸 *NEXA Instagram Downloader*` +
            (
              result.author
                ? `\n👤 ${result.author}`
                : ''
            )
        },
        {
          quoted: msg
        }
      )
    } catch (err) {
      let text =
        '⚠️ Gagal mengambil media Instagram.'

      if (
        err.message ===
        'PRIVATE_OR_LOGIN_REQUIRED'
      ) {
        text =
          '🔒 Media ini private atau membutuhkan login.'
      }

      await sock.sendMessage(
        jid,
        { text },
        {
          quoted: msg
        }
      )
    } finally {
      cleanupSocial(file)
    }
  }
}
