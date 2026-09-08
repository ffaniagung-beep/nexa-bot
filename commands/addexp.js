import {
  addExp,
  getRequiredExp
} from '../lib/userdb.js'

import {
  getOwnerTarget,
  findNumber,
  formatNumber
} from '../lib/ownerTools.js'

export default {
  name: 'addexp',
  aliases: [],
  category: 'OWNER',
  ownerOnly: true,

  description:
    'Menambah EXP user',

  usage:
    '.addexp @user <jumlah>',

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
      amount <= 0 ||
      amount > 1000000
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            'Contoh:\n*.addexp @user 500*'
        },
        {
          quoted: msg
        }
      )
    }

    const user =
      addExp(
        target,
        amount
      )

    let text =
      `✨ +${formatNumber(amount)} EXP\n\n` +
      `🧬 Level: *${user.level}*\n` +
      `✨ EXP: *${user.exp}/${getRequiredExp(user.level)}*`

    if (
      user.leveledUp
    ) {
      text +=
        `\n\n🎉 Level naik: *${user.oldLevel} → ${user.level}*`
    }

    await sock.sendMessage(
      jid,
      {
        text
      },
      {
        quoted: msg
      }
    )
  }
}
