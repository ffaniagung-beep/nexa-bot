import {
  getOwnerTarget,
  findNumber,
  formatNumber,
  setLimit
} from '../lib/ownerTools.js'

export default {
  name: 'setlimit',
  aliases: [],
  category: 'OWNER',
  ownerOnly: true,

  description:
    'Mengatur limit user',

  usage:
    '.setlimit @user <jumlah>',

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
            'Contoh:\n*.setlimit @user 100*'
        },
        {
          quoted: msg
        }
      )
    }

    const user =
      setLimit(
        target,
        amount
      )

    await sock.sendMessage(
      jid,
      {
        text:
          `✅ Limit diset ke *${formatNumber(user.limit)}*.`
      },
      {
        quoted: msg
      }
    )
  }
}
