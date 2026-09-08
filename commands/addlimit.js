import {
  addLimit
} from '../lib/userdb.js'

import {
  getOwnerTarget,
  findNumber,
  formatNumber
} from '../lib/ownerTools.js'

export default {
  name: 'addlimit',
  aliases: [],
  category: 'OWNER',
  ownerOnly: true,

  description:
    'Menambah limit user',

  usage:
    '.addlimit @user <jumlah>',

  async run({
    sock,
    msg,
    jid
  }) {
    const target =
      getOwnerTarget(msg)

    const amount =
      findNumber(msg)

    if (!target) {
      return sock.sendMessage(
        jid,
        {
          text:
            '👑 Reply / mention user yang mau ditambah limit.'
        },
        {
          quoted: msg
        }
      )
    }

    if (
      !Number.isInteger(amount) ||
      amount <= 0
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            'Contoh:\n*.addlimit @user 20*'
        },
        {
          quoted: msg
        }
      )
    }

    const user =
      addLimit(
        target,
        amount
      )

    await sock.sendMessage(
      jid,
      {
        text:
          `✅ *LIMIT DITAMBAHKAN*\n\n` +
          `🎟 +${formatNumber(amount)} Limit\n` +
          `📦 Total: *${formatNumber(user.limit)}*`
      },
      {
        quoted: msg
      }
    )
  }
}
