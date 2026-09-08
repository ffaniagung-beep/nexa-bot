import {
  setAfk
} from '../lib/afk.js'

import {
  getProfileJid
} from '../lib/profile.js'

function getText(msg) {
  return (
    msg?.message?.conversation ||
    msg?.message
      ?.extendedTextMessage
      ?.text ||
    msg?.message
      ?.imageMessage
      ?.caption ||
    ''
  )
}

export default {
  name:
    'afk',

  aliases: [],

  category:
    'GENERAL',

  description:
    'Mengaktifkan status AFK',

  usage:
    '.afk <alasan>',

  async run({
    sock,
    msg,
    jid
  }) {
    const userJid =
      getProfileJid(
        msg,
        jid
      )

    const text =
      getText(msg)
        .trim()

    const reason =
      text
        .split(/\s+/)
        .slice(1)
        .join(' ')
        .trim() ||
      'Tidak ada alasan'

    const afk =
      setAfk(
        userJid,
        reason
      )

    const mention =
      `@${String(userJid)
        .split('@')[0]}`

    await sock.sendMessage(
      jid,
      {
        text:
          `🌙 *AFK AKTIF*\n\n` +
          `${mention} sekarang sedang AFK.\n` +
          `Alasan: *${afk.reason}*\n\n` +
          `NEXA akan memberi tahu jika ada yang mention kamu.`,

        mentions: [
          userJid
        ]
      },
      {
        quoted: msg
      }
    )
  }
}
