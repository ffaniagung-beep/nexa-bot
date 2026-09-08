import config from '../config.js'

function cleanNumber(
  value
) {
  return String(
    value || ''
  )
    .split('@')[0]
    .replace(
      /\D/g,
      ''
    )
}

export default {
  name: 'owner',

  aliases: [
    'creator',
    'developer'
  ],

  category: 'GENERAL',

  description:
    'Menampilkan kontak Owner NEXA-BOT',

  usage:
    '.owner',

  async run({
    sock,
    msg,
    jid
  }) {
    const ownerNumber =
      Array.isArray(
        config.owner
      )
        ? cleanNumber(
            config.owner[0]
          )
        : cleanNumber(
            config.owner
          )

    if (!ownerNumber) {
      return sock.sendMessage(
        jid,
        {
          text:
            '⚠️ Kontak Owner belum dikonfigurasi.'
        },
        {
          quoted: msg
        }
      )
    }

    const ownerJid =
      `${ownerNumber}@s.whatsapp.net`

    await sock.sendMessage(
      jid,
      {
        text:
          `👑 *OWNER NEXA-BOT*\n\n` +
          `Mau request fitur, melaporkan bug, atau ada keperluan dengan NEXA-BOT?\n\n` +
          `Silakan hubungi Owner 👇\n` +
          `wa.me/${ownerNumber}`,

        mentions: [
          ownerJid
        ]
      },
      {
        quoted: msg
      }
    )
  }
}
