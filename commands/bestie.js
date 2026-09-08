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
    return '😭 Bestie dari dimensi berbeda.'
  }

  if (value <= 40) {
    return '🗿 Masih tahap kenal.'
  }

  if (value <= 60) {
    return '😋 Lumayan kompak.'
  }

  if (value <= 80) {
    return '🔥 Duo yang cukup berbahaya.'
  }

  return '💀 Kalau berdua kemungkinan grup jadi chaos.'
}

export default {
  name:
    'bestie',

  aliases: [
    'bestieku'
  ],

  category:
    'FUN',

  groupOnly:
    true,

  description:
    'Mencari bestie random',

  usage:
    '.bestie',

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
            '😭 Gak cukup member buat nyari bestie.'
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
          `bestie|${jid}|${sender}`
      })

    const score =
      dailyPercent(
        `bestie-score|${jid}|${[
          sender,
          target
        ].sort().join('|')}`,
        1,
        100
      )

    await sock.sendMessage(
      jid,
      {
        text:
          `╭──「 🤝 *BESTIE RANDOM* 」\n` +
          `│\n` +
          `│ ${mentionText(sender)}\n` +
          `│ 🤝 ${mentionText(target)}\n` +
          `│\n` +
          `│ ${makeBar(score)}\n` +
          `│ ⚡ Kekompakan: *${score}%*\n` +
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
