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
    return '😇 Musuhan cuma 3 detik.'
  }

  if (value <= 40) {
    return '🗿 Ada sedikit rivalitas.'
  }

  if (value <= 60) {
    return '😭 Mulai saling mencurigai.'
  }

  if (value <= 80) {
    return '🔥 Rival arc resmi dimulai.'
  }

  return '💀 FINAL BOSS SATU SAMA LAIN.'
}

export default {
  name:
    'musuhku',

  aliases: [
    'rival',
    'rivalku'
  ],

  category:
    'FUN',

  groupOnly:
    true,

  description:
    'Mencari rival random',

  usage:
    '.musuhku',

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
            '😭 Gak ada calon rival di grup.'
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
          `musuhku|${jid}|${sender}`
      })

    const score =
      dailyPercent(
        `musuh-score|${jid}|${[
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
          `╭──「 ⚔️ *RIVAL RANDOM* 」\n` +
          `│\n` +
          `│ ${mentionText(sender)}\n` +
          `│         VS\n` +
          `│ ${mentionText(target)}\n` +
          `│\n` +
          `│ ${makeBar(score)}\n` +
          `│ 🔥 Rivalitas: *${score}%*\n` +
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
