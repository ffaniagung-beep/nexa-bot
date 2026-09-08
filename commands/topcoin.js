import {
  getLeaderboard,
  getOwnerEntry
} from '../lib/leaderboard.js'

export default {
  name:
    'topcoin',

  aliases: [
    'coinnboard',
    'rich'
  ],

  category:
    'GAME',

  description:
    'Melihat leaderboard coin NEXA',

  usage:
    '.topcoin',

  async run({
    sock,
    msg,
    jid
  }) {
    const list =
      getLeaderboard(
        'coin',
        10
      )

    const owner =
      getOwnerEntry()

    const mentions = []

    let text =
      `🪙 *NEXA COIN LEADERBOARD*\n\n`

    if (owner) {
      mentions.push(
        owner.jid
      )

      text +=
        `👑 *OWNER*\n` +
        `@${owner.jid.split('@')[0]}\n` +
        `Level *∞* • EXP *∞*\n\n`
    }

    if (!list.length) {
      text +=
        `Belum ada member di leaderboard.`
    } else {
      text +=
        `💰 *TOP COIN*\n\n`

      list.forEach(
        (user, index) => {
          mentions.push(
            user.jid
          )

          let medal

          if (
            index === 0
          ) {
            medal = '🥇'
          } else if (
            index === 1
          ) {
            medal = '🥈'
          } else if (
            index === 2
          ) {
            medal = '🥉'
          } else {
            medal =
              `${index + 1}.`
          }

          text +=
            `${medal} @${user.jid.split('@')[0]}\n` +
            `   🪙 *${Number(user.coin).toLocaleString('id-ID')} Coin*\n\n`
        }
      )
    }

    await sock.sendMessage(
      jid,
      {
        text:
          text.trim(),

        mentions:
          [...new Set(mentions)]
      },
      {
        quoted:
          msg
      }
    )
  }
}
