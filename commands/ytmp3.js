import {
  downloadAudio,
  getFileSizeMB,
  cleanup
} from '../lib/downloader.js'

export default {
  name: 'ytmp3',

  category: 'DOWNLOADER',
  description:
    'Download audio YouTube ke MP3',
  usage:
    '.ytmp3 <url>',

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
            'Contoh:\n.ytmp3 https://youtube.com/watch?v=...'
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
            '⏳ Mengunduh audio...'
        },
        {
          quoted: msg
        }
      )

      const result =
        await downloadAudio(
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
          audio: {
            url: file
          },

          mimetype:
            'audio/mpeg',

          fileName:
            `${result.title}.mp3`
        },
        {
          quoted: msg
        }
      )
    } catch (err) {
      console.error(
        'YTMP3:',
        err
      )

      await sock.sendMessage(
        jid,
        {
          text:
            `❌ Gagal download audio.\n${err?.message || 'Unknown error'}`
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
