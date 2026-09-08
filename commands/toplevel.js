import {
  getLeaderboard,
  getOwnerEntry
} from '../lib/leaderboard.js'

export default {
  name:
    'toplevel',

  aliases: [
    'leaderboard',
    'lb'
  ],

  category:
    'GAME',

  description:
    'Melihat leaderboard level NEXA',

  usage:
    '.toplevel',

  async run({
    sock,
    msg,
    jid
  }) {
    const list =
      getLeaderboard(
        'level',
        10
      )

    const owner =
      getOwnerEntry()

    const mentions = []

    let text =
      `🏆 *NEXA LEADERBOARD*\n\n`

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
        `🧬 *TOP LEVEL*\n\n`

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
            `   Level *${user.level}* • EXP *${user.exp}*\n\n`
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
