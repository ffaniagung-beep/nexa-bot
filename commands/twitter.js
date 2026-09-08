import {
  downloadSocial,
  sizeMB,
  cleanupSocial
} from '../lib/socialdl.js'

export default {
  name: 'twitter',

  aliases: [
    'x',
    'twitterdl',
    'xdl'
  ],

  category:
    'DOWNLOADER',

  description:
    'Download video Twitter/X',

  usage:
    '.twitter <url>',

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
      !/(twitter\.com|x\.com)/i
        .test(url)
    ) {
      await sock.sendMessage(
        jid,
        {
          text:
            `🐦 Kirim link Twitter/X.\n\n` +
            `${config.prefix}twitter https://x.com/.../status/...`
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
            '⏳ Mengambil video Twitter/X...'
        },
        {
          quoted: msg
        }
      )

      const result =
        await downloadSocial(
          url,
          'twitter'
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
            `🐦 *NEXA X Downloader*`
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
            '⚠️ Video Twitter/X gagal didownload.'
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
