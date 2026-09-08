import {
  downloadTikTok,
  getTikTokSizeMB,
  cleanupTikTok
} from '../lib/tiktok.js'

export default {
  name: 'tiktok',

  aliases: [
    'tt',
    'ttdl'
  ],

  category:
    'DOWNLOADER',

  description:
    'Download video TikTok',

  usage:
    '.tiktok <url>',

  async run({
    sock,
    msg,
    jid,
    args,
    config
  }) {
    const url =
      args[0]

    if (!url) {
      await sock.sendMessage(
        jid,
        {
          text:
            `Contoh:\n` +
            `${config.prefix}tiktok https://vm.tiktok.com/...`
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
            '⏳ Mengambil video TikTok...'
        },
        {
          quoted: msg
        }
      )

      const result =
        await downloadTikTok(
          url
        )

      file =
        result.file

      const size =
        getTikTokSizeMB(
          file
        )

      if (size > 50) {
        await sock.sendMessage(
          jid,
          {
            text:
              `❌ File terlalu besar.\n` +
              `Ukuran: ${size.toFixed(1)} MB\n` +
              `Batas NEXA: 50 MB`
          },
          {
            quoted: msg
          }
        )

        return
      }

      let caption =
        '🎵 *NEXA TikTok Downloader*'

      if (
        result.author
      ) {
        caption +=
          `\n👤 @${result.author}`
      }

      if (
        result.title &&
        result.title !==
          'TikTok'
      ) {
        caption +=
          `\n📝 ${result.title}`
      }

      await sock.sendMessage(
        jid,
        {
          video: {
            url: file
          },

          caption
        },
        {
          quoted: msg
        }
      )

      console.log(
        `✅ TikTok via ${result.provider}`
      )
    } catch (err) {
      console.error(
        'TikTok command:',
        err
      )

      let text

      if (
        err.message ===
        'INVALID_TIKTOK_URL'
      ) {
        text =
          '❌ Link TikTok tidak valid.'
      } else {
        text =
          '⚠️ TikTok downloader sedang tidak tersedia.\n' +
          'Coba lagi beberapa saat nanti.'
      }

      await sock.sendMessage(
        jid,
        { text },
        {
          quoted: msg
        }
      )
    } finally {
      cleanupTikTok(
        file
      )
    }
  }
}
