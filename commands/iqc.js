import {
  createIqc
} from '../lib/iqc.js'

export default {
  name:
    'iqc',

  aliases: [
    'iphoneqc'
  ],

  category:
    'MAKER',

  description:
    'Membuat iPhone-style quote mockup',

  usage:
    '.iqc <teks>',

  async run({
    sock,
    msg,
    jid,
    args,
    config
  }) {
    const text =
      args
        .join(' ')
        .trim()

    if (!text) {
      return sock.sendMessage(
        jid,
        {
          text:
            `📱 *IPHONE QUOTE*\n\n` +
            `Gunakan:\n` +
            `*${config.prefix}iqc <teks>*\n\n` +
            `Contoh:\n` +
            `*${config.prefix}iqc besok NEXA publik njir 😭*`
        },
        {
          quoted:
            msg
        }
      )
    }

    if (
      text.length >
      700
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            `⚠️ Teks IQC maksimal *700 karakter*.`
        },
        {
          quoted:
            msg
        }
      )
    }

    await sock.sendMessage(
      jid,
      {
        react: {
          text:
            '⏳',

          key:
            msg.key
        }
      }
    )

    let result

    try {
      result =
        await createIqc({
          text,

          name:
            msg.pushName ||
            'NEXA User'
        })

      await sock.sendMessage(
        jid,
        {
          image:
            result.buffer,

          caption:
            `📱 IQC • NEXA Maker`
        },
        {
          quoted:
            msg
        }
      )

      await sock.sendMessage(
        jid,
        {
          react: {
            text:
              '✅',

          key:
            msg.key
          }
        }
      )
    } catch (err) {
      console.error(
        '📱 IQC error:',
        err
      )

      await sock.sendMessage(
        jid,
        {
          react: {
            text:
              '❌',

          key:
            msg.key
          }
        }
      )

      let errorText =
        '⚠️ Gagal membuat IQC.'

      if (
        err?.message ===
        'CHROMIUM_NOT_FOUND'
      ) {
        errorText =
          `⚠️ Chromium tidak ditemukan di Termux.`
      }

      await sock.sendMessage(
        jid,
        {
          text:
            errorText
        },
        {
          quoted:
            msg
        }
      )
    } finally {
      try {
        result
          ?.cleanup()
      } catch {}
    }
  }
}
