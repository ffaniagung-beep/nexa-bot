import {
  getGroupMembers,
  dailyMember,
  mentionText
} from '../lib/funGroup.js'

export default {
  name:
    'siapakah',

  aliases: [
    'siapa'
  ],

  category:
    'FUN',

  groupOnly:
    true,

  description:
    'Memilih member grup untuk pertanyaan random',

  usage:
    '.siapakah <pertanyaan>',

  async run({
    sock,
    msg,
    jid,
    args,
    config
  }) {
    const question =
      args
        .join(' ')
        .trim()

    const prefix =
      config?.prefix ||
      '.'

    if (!question) {
      return sock.sendMessage(
        jid,
        {
          text:
            `👀 *SIAPAKAH?*\n\n` +
            `Contoh:\n` +
            `*${prefix}siapakah paling sering ngilang?*\n` +
            `*${prefix}siapakah paling chaos di grup?*`
        },
        {
          quoted: msg
        }
      )
    }

    const {
      members
    } =
      await getGroupMembers({
        sock,
        msg,
        jid
      })

    if (!members.length) {
      return sock.sendMessage(
        jid,
        {
          text:
            '😭 Gak nemu member buat dipilih.'
        },
        {
          quoted: msg
        }
      )
    }

    const normalized =
      question
        .toLowerCase()
        .replace(
          /\s+/g,
          ' '
        )

    const target =
      dailyMember({
        members,

        seed:
          `siapakah|${jid}|${normalized}`
      })

    await sock.sendMessage(
      jid,
      {
        text:
          `╭──「 👀 *SIAPAKAH?* 」\n` +
          `│\n` +
          `│ ❓ ${question}\n` +
          `│\n` +
          `│ 🎯 Jawaban NEXA:\n` +
          `│ *${mentionText(target)}* 😭\n` +
          `│\n` +
          `╰──────────────`,

        mentions: [
          target
        ]
      },
      {
        quoted: msg
      }
    )
  }
}
