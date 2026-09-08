import {
  getOwnerTarget,
  getArgs,
  resetUser
} from '../lib/ownerTools.js'

export default {
  name: 'resetuser',
  aliases: [],
  category: 'OWNER',
  ownerOnly: true,

  description:
    'Reset data user',

  usage:
    '.resetuser @user confirm',

  async run({
    sock,
    msg,
    jid
  }) {
    const target =
      getOwnerTarget(msg)

    const args =
      getArgs(msg)
        .map(
          value =>
            value.toLowerCase()
        )

    if (!target) {
      return sock.sendMessage(
        jid,
        {
          text:
            '👑 Reply / mention user yang mau direset.'
        },
        {
          quoted: msg
        }
      )
    }

    if (
      !args.includes(
        'confirm'
      )
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            `⚠️ *RESET USER*\n\n` +
            `Ini akan mereset:\n` +
            `• Profile NEXA\n` +
            `• Level & EXP\n` +
            `• Coin\n` +
            `• Limit\n` +
            `• Premium\n` +
            `• Daily cooldown\n\n` +
            `Ban tidak dihapus.\n\n` +
            `Kalau yakin gunakan:\n` +
            `*.resetuser @user confirm*`
        },
        {
          quoted: msg
        }
      )
    }

    resetUser(
      target
    )

    await sock.sendMessage(
      jid,
      {
        text:
          `♻️ *USER RESET*\n\n` +
          `Data user berhasil dikembalikan ke default.`
      },
      {
        quoted: msg
      }
    )
  }
}
