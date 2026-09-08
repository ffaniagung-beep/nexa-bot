import {
  getOwnerTarget,
  findNumber,
  setLevel
} from '../lib/ownerTools.js'

export default {
  name: 'setlevel',
  aliases: [],
  category: 'OWNER',
  ownerOnly: true,

  description:
    'Mengatur level user',

  usage:
    '.setlevel @user <level>',

  async run({
    sock,
    msg,
    jid
  }) {
    const target =
      getOwnerTarget(msg)

    const level =
      findNumber(msg)

    if (
      !target ||
      !Number.isInteger(level) ||
      level < 0
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            'Contoh:\n*.setlevel @user 10*'
        },
        {
          quoted: msg
        }
      )
    }

    const user =
      setLevel(
        target,
        level
      )

    await sock.sendMessage(
      jid,
      {
        text:
          `✅ Level user diset ke *${user.level}*.\n` +
          `✨ EXP direset ke *0*.`
      },
      {
        quoted: msg
      }
    )
  }
}
