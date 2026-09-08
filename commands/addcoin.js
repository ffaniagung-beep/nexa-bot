import {
  addCoin
} from '../lib/userdb.js'

import {
  getOwnerTarget,
  findNumber,
  formatNumber
} from '../lib/ownerTools.js'

export default {
  name: 'addcoin',
  aliases: [],
  category: 'OWNER',
  ownerOnly: true,

  description:
    'Menambah coin user',

  usage:
    '.addcoin @user <jumlah>',

  async run({
    sock,
    msg,
    jid
  }) {
    const target =
      getOwnerTarget(msg)

    const amount =
      findNumber(msg)

    if (
      !target ||
      !Number.isInteger(amount) ||
      amount <= 0
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            'Contoh:\n*.addcoin @user 5000*'
        },
        {
          quoted: msg
        }
      )
    }

    const user =
      addCoin(
        target,
        amount
      )

    await sock.sendMessage(
      jid,
      {
        text:
          `🪙 +${formatNumber(amount)} Coin\n` +
          `Saldo: *${formatNumber(user.coin)} Coin*`
      },
      {
        quoted: msg
      }
    )
  }
}
