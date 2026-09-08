import config from '../config.js'

import {
  setPrefix
} from '../lib/prefix.js'

function getText(msg) {
  const m =
    msg?.message || {}

  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    ''
  )
}

export default {
  name:
    'setprefix',

  aliases: [
    'prefix'
  ],

  category:
    'BOT',

  ownerOnly:
    true,

  description:
    'Mengganti prefix NEXA-BOT',

  usage:
    '.setprefix <prefix>',

  async run({
    sock,
    msg,
    jid
  }) {
    const fullText =
      getText(msg)
        .trim()

    const args =
      fullText
        .split(/\s+/)
        .slice(1)

    const newPrefix =
      String(
        args[0] || ''
      ).trim()

    if (!newPrefix) {
      return sock.sendMessage(
        jid,
        {
          text:
            `◈ *SET PREFIX*\n\n` +
            `Prefix saat ini: *${config.prefix}*\n\n` +
            `Contoh:\n` +
            `*${config.prefix}setprefix !*`
        },
        {
          quoted: msg
        }
      )
    }

    if (
      newPrefix.length >
      3
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            'Prefix maksimal *3 karakter*.'
        },
        {
          quoted: msg
        }
      )
    }

    if (
      /\s/.test(
        newPrefix
      )
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            'Prefix tidak boleh mengandung spasi.'
        },
        {
          quoted: msg
        }
      )
    }

    const oldPrefix =
      config.prefix

    if (
      newPrefix ===
      oldPrefix
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            `😭 Prefix NEXA memang sudah *${oldPrefix}* njir.`
        },
        {
          quoted: msg
        }
      )
    }

    try {
      setPrefix(
        newPrefix
      )

      await sock.sendMessage(
        jid,
        {
          text:
            `✓ *PREFIX UPDATED*\n\n` +
            `Prefix lama  : *${oldPrefix}*\n` +
            `Prefix baru  : *${newPrefix}*\n\n` +
            `Mulai sekarang gunakan *${newPrefix}menu*.`
        },
        {
          quoted: msg
        }
      )
    } catch (err) {
      console.error(
        '◈ setprefix:',
        err
      )

      await sock.sendMessage(
        jid,
        {
          text:
            '⚠️ Gagal mengganti prefix.'
        },
        {
          quoted: msg
        }
      )
    }
  }
}
