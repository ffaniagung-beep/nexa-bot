import {
  downloadGDrive,
  cleanupGDrive
} from '../lib/gdrive.js'

export default {
  name: 'gdrive',

  aliases: [
    'drive',
    'gddl'
  ],

  category:
    'DOWNLOADER',

  description:
    'Download file Google Drive publik',

  usage:
    '.gdrive <url>',

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
            `${config.prefix}gdrive <link Google Drive>`
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
            '☁️ Mengambil file Google Drive...'
        },
        {
          quoted: msg
        }
      )

      const result =
        await downloadGDrive(
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
            `☁️ *NEXA GDrive*\n` +
            `📁 ${result.filename}\n` +
            `📦 ${(result.size / 1024 / 1024).toFixed(2)} MB`
        },
        {
          quoted: msg
        }
      )
    } catch (err) {
      let text =
        '❌ Gagal download Google Drive.'

      if (
        err.message ===
        'GDRIVE_PERMISSION'
      ) {
        text =
          '🔒 File tidak bisa diakses lewat link ini. Pastikan izin berbagi link memang mengizinkan akses.'
      }

      if (
        err.message ===
        'FILE_TOO_LARGE'
      ) {
        text =
          '❌ File lebih besar dari limit NEXA 50 MB.'
      }

      await sock.sendMessage(
        jid,
        { text },
        {
          quoted: msg
        }
      )
    } finally {
      cleanupGDrive(file)
    }
  }
}
