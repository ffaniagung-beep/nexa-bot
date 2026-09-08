import {
  searchPinterest
} from '../lib/pinterest.js'

export default {
  name: 'pin',

  aliases: [
    'pinterest',
    'pinsearch'
  ],

  category:
    'DOWNLOADER',

  description:
    'Cari 3 gambar Pinterest',

  usage:
    '.pin <query>',

  async run({
    sock,
    msg,
    jid,
    args,
    config
  }) {
    const query =
      args
        .join(' ')
        .trim()

    if (!query) {
      await sock.sendMessage(
        jid,
        {
          text:
            `📌 *Pinterest Search*\n\n` +
            `Contoh:\n` +
            `${config.prefix}pin elaina`
        },
        {
          quoted: msg
        }
      )

      return
    }

    try {
      await sock.sendMessage(
        jid,
        {
          text:
            `🔎 Mencari Pinterest...\n` +
            `📌 Query: *${query}*\n` +
            `🖼️ Hasil: 3 gambar`
        },
        {
          quoted: msg
        }
      )

      const images =
        await searchPinterest(
          query
        )

      // FIXED 3 GAMBAR
      for (
        let i = 0;
        i < 3;
        i++
      ) {
        await sock.sendMessage(
          jid,
          {
            image: {
              url:
                images[i]
            },

            caption:
              `📌 *Pinterest Search*\n` +
              `🔎 ${query}\n` +
              `🖼️ ${i + 1}/3`
          },
          {
            quoted:
              i === 0
                ? msg
                : undefined
          }
        )
      }
    } catch (err) {
      console.error(
        'PIN COMMAND:',
        err?.message || err
      )

      let text =
        '⚠️ Pinterest search sedang bermasalah.'

      if (
        err.message ===
        'PIN_BUSY'
      ) {
        text =
          '⏳ Pinterest sedang dipakai user lain. Coba beberapa detik lagi.'
      }

      if (
        err.message ===
        'CHROMIUM_NOT_FOUND'
      ) {
        text =
          '⚠️ Chromium belum tersedia di server NEXA.'
      }

      if (
        err.message ===
        'NOT_ENOUGH_RESULTS'
      ) {
        text =
          `❌ Pinterest belum mendapatkan 3 gambar untuk *${query}*.`
      }

      if (
        /timeout/i.test(
          err.message
        )
      ) {
        text =
          '⏳ Pinterest terlalu lama merespons.'
      }

      await sock.sendMessage(
        jid,
        { text },
        {
          quoted: msg
        }
      )
    }
  }
}
