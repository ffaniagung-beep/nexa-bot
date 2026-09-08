import { handleAlightCommand } from '../lib/alightGenerator.js'

export default {
  name: 'alight',
  aliases: ['alightmotion', 'am'],
  category: 'TOOLS',
  description: 'Generate Alight Motion Premium',
  usage: '.alight <email>',

  async run({ sock, msg, jid, args, config, isOwner }) {
    const email = args?.[0]

    if (!email) {
      return sock.sendMessage(jid, {
        text: `🎬 *ALIGHT MOTION GENERATOR*\n\nGunakan:\n${config.prefix}alight <email>\n\nContoh:\n${config.prefix}alight user@gmail.com`
      }, { quoted: msg })
    }

    if (!email.includes('@')) {
      return sock.sendMessage(jid, {
        text: '❌ Format email tidak valid.'
      }, { quoted: msg })
    }

    const result = await handleAlightCommand({ sock, msg, jid, email, config, isOwner })

    if (result?.reply) {
      await sock.sendMessage(jid, {
        text: result.reply,
        mentions: result.mentions || []
      }, { quoted: msg })
    }
  }
}
