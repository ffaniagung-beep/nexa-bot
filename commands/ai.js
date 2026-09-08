import {
  resolveProfileJid
} from '../lib/profile.js'

import {
  runNexaAi,
  NEXA_AI_COST
} from '../lib/ai/nexa.js'

export default {
  name: 'ai',

  aliases: [
    'ask',
    'chat',
    'nexaai'
  ],

  category: 'AI',

  description:
    'Ngobrol dengan NEXA-AI',

  usage:
    '.ai <pertanyaan>',

  async run({
    sock,
    msg,
    jid,
    args,
    isOwner = false
  }) {
    const text =
      Array.isArray(args)
        ? args.join(' ').trim()
        : ''

    if (!text) {
      return sock.sendMessage(
        jid,
        {
          text:
            `╭━━〔 🤖 *NEXA-AI* 〕━━╮\n` +
            `│\n` +
            `│ Mau nanya tapi pertanyaannya\n` +
            `│ ketinggalan di rumah kah 😭\n` +
            `│\n` +
            `│ *.ai kenapa langit biru?*\n` +
            `│ *.ask bantu jelasin ini*\n` +
            `│\n` +
            `│ 🎟️ Cost: ${NEXA_AI_COST} Limit\n` +
            `│ 👑 Premium/Owner: Unlimited\n` +
            `│\n` +
            `╰━━━━━━━━━━━━━━━━━━╯`
        },
        {
          quoted:
            msg
        }
      )
    }

    const userJid =
      await resolveProfileJid(
        sock,
        msg,
        jid
      )

    if (!userJid) {
      return
    }

    return runNexaAi({
      sock,
      msg,
      jid,
      userJid,
      text,
      isOwner
    })
  }
}
