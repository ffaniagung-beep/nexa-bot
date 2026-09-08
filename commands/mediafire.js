import {
  downloadMediaFire,
  cleanupMediaFire
} from '../lib/mediafire.js'

export default {
  name: 'mediafire',

  aliases: [
    'mf',
    'mfdl'
  ],

  category:
    'DOWNLOADER',

  description:
    'Download file MediaFire',

  usage:
    '.mediafire <url>',

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
      !/mediafire\.com/i
        .test(url)
    ) {
      await sock.sendMessage(
        jid,
        {
          text:
            `${config.prefix}mediafire <link MediaFire>`
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
            '🔥 Mengambil file MediaFire...'
        },
        {
          quoted: msg
        }
      )

      const result =
        await downloadMediaFire(
          url,
          50
        )

      file =
        result.file

      await sock.sendMessage(
        jid,
        {
          document: {
            url: file
          },

          fileName:
            result.filename,

          mimetype:
            'application/octet-stream',

          caption:
            `🔥 *NEXA MediaFire*\n` +
            `📁 ${result.filename}\n` +
            `📦 ${(result.size / 1024 / 1024).toFixed(2)} MB`
        },
        {
          quoted: msg
        }
      )
    } catch (err) {
      let text =
        '❌ MediaFire gagal didownload.'

      if (
        err.message ===
        'FILE_TOO_LARGE'
      ) {
        text =
          '❌ File melebihi limit NEXA 50 MB.'
      }

      await sock.sendMessage(
        jid,
        { text },
        {
          quoted: msg
        }
      )
    } finally {
      cleanupMediaFire(file)
    }
  }
}
