import {
  downloadVideo,
  getFileSizeMB,
  cleanup
} from '../lib/downloader.js'

export default {
  name: 'ytmp4',

  category: 'DOWNLOADER',
  description:
    'Download video YouTube',
  usage:
    '.ytmp4 <url>',

  async run({
    sock,
    msg,
    jid,
    args
  }) {
    const url =
      args[0]

    if (!url) {
      await sock.sendMessage(
        jid,
        {
          text:
            'Contoh:\n.ytmp4 https://youtube.com/watch?v=...'
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
            '⏳ Mengunduh video...'
        },
        {
          quoted: msg
        }
      )

      const result =
        await downloadVideo(
          url
        )

      file =
        result.file

      const size =
        getFileSizeMB(file)

      if (size > 50) {
        await sock.sendMessage(
          jid,
          {
            text:
              `❌ File terlalu besar: ${size.toFixed(1)} MB\n` +
              `Batas NEXA-BOT: 50 MB`
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
            `🎬 ${result.title}`
        },
        {
          quoted: msg
        }
      )
    } catch (err) {
      console.error(
        'YTMP4:',
        err
      )

      await sock.sendMessage(
        jid,
        {
          text:
            `❌ Gagal download video.\n${err?.message || 'Unknown error'}`
        },
        {
          quoted: msg
        }
      )
    } finally {
      cleanup(file)
    }
  }
}
