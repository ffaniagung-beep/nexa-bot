import {
  downloadSocial,
  sizeMB,
  cleanupSocial
} from '../lib/socialdl.js'

export default {
  name: 'pindl',

  aliases: [
    'pinterestdl'
  ],

  category:
    'DOWNLOADER',

  description:
    'Download video Pinterest',

  usage:
    '.pindl <url>',

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
      !/(pinterest\.com|pin\.it)/i
        .test(url)
    ) {
      await sock.sendMessage(
        jid,
        {
          text:
            `📌 Kirim link Pinterest.\n\n` +
            `${config.prefix}pindl https://pin.it/...`
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
            '⏳ Mengambil Pinterest...'
        },
        {
          quoted: msg
        }
      )

      const result =
        await downloadSocial(
          url,
          'pinterest'
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
            '📌 *NEXA Pinterest Downloader*'
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
            '⚠️ Pinterest gagal didownload.'
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
