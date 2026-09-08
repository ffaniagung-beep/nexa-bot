import {
  getGroupMembers,
  dailyMember,
  dailyPercent,
  makeBar,
  mentionText
} from '../lib/funGroup.js'

function status(
  value
) {
  if (value <= 20) {
    return '😭 Plot-nya masih jauh.'
  }

  if (value <= 40) {
    return '🗿 Masih ada sinyal tipis.'
  }

  if (value <= 60) {
    return '✨ Lumayan nyambung.'
  }

  if (value <= 80) {
    return '💞 Chemistry mulai kuat.'
  }

  return '💘 BUSYET, script hari ini kuat banget 😭'
}

export default {
  name:
    'jodohku',

  aliases: [
    'jodohhariini'
  ],

  category:
    'FUN',

  groupOnly:
    true,

  description:
    'Memilih pasangan random dari member grup',

  usage:
    '.jodohku',

  async run({
    sock,
    msg,
    jid
  }) {
    const {
      sender,
      members
    } =
      await getGroupMembers({
        sock,
        msg,
        jid,

        excludeSender:
          true
      })

    if (
      !sender ||
      !members.length
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            '😭 Member grupnya kurang buat ramalan ini.'
        },
        {
          quoted: msg
        }
      )
    }

    const target =
      dailyMember({
        members,

        seed:
          `jodohku|${jid}|${sender}`
      })

    const pair =
      [
        sender,
        target
      ].sort()

    const score =
      dailyPercent(
        `jodohku-score|${jid}|${pair.join('|')}`,
        1,
        100
      )

    await sock.sendMessage(
      jid,
      {
        text:
          `╭──「 💞 *JODOH RANDOM* 」\n` +
          `│\n` +
          `│ ${mentionText(sender)}\n` +
          `│          ×\n` +
          `│ ${mentionText(target)}\n` +
          `│\n` +
          `│ ${makeBar(score)}\n` +
          `│ 💘 Chemistry: *${score}%*\n` +
          `│\n` +
          `│ ${status(score)}\n` +
          `│\n` +
          `╰──────────────`,

        mentions: [
          sender,
          target
        ]
      },
      {
        quoted: msg
      }
    )
  }
}
