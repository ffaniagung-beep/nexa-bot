import {
  getPremiumUsers,
  formatDate
} from '../lib/ownerTools.js'

export default {
  name: 'premlist',

  aliases: [
    'premiumlist'
  ],

  category: 'OWNER',
  ownerOnly: true,

  description:
    'Melihat premium aktif',

  usage:
    '.premlist',

  async run({
    sock,
    msg,
    jid
  }) {
    const users =
      getPremiumUsers()

    if (!users.length) {
      return sock.sendMessage(
        jid,
        {
          text:
            '⭐ Belum ada user Premium aktif.'
        },
        {
          quoted: msg
        }
      )
    }

    const mentions = []

    let text =
      `⭐ *PREMIUM LIST*\n\n`

    users.forEach(
      (user, index) => {
        mentions.push(
          user.jid
        )

        text +=
          `${index + 1}. @${user.jid.split('@')[0]}\n` +
          `   ↳ ${formatDate(user.premiumUntil)}\n\n`
      }
    )

    text +=
      `Total: *${users.length} user*`

    await sock.sendMessage(
      jid,
      {
        text:
          text.trim(),

        mentions
      },
      {
        quoted: msg
      }
    )
  }
}
