import {
  getOwnerTarget,
  findNumber,
  formatNumber,
  setCoin
} from '../lib/ownerTools.js'

export default {
  name: 'setcoin',
  aliases: [],
  category: 'OWNER',
  ownerOnly: true,

  description:
    'Mengatur coin user',

  usage:
    '.setcoin @user <jumlah>',

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
      amount < 0
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            'Contoh:\n*.setcoin @user 50000*'
        },
        {
          quoted: msg
        }
      )
    }

    const user =
      setCoin(
        target,
        amount
      )

    await sock.sendMessage(
      jid,
      {
        text:
          `✅ Coin diset ke *${formatNumber(user.coin)}*.`
      },
      {
        quoted: msg
      }
    )
  }
}
