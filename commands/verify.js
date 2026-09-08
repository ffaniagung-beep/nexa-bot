import { handleVerifyCommand } from '../lib/alightGenerator.js'

export default {
  name: 'verify',
  aliases: ['verif'],
  category: 'TOOLS',
  description: 'Verifikasi Magic Link Alight Motion',
  usage: '.verify <link>',

  async run({ sock, msg, jid, args, config, isOwner }) {
    const magicLink = args?.join(' ')

    if (!magicLink) {
      return sock.sendMessage(jid, {
        text: `🔐 *VERIFY MAGIC LINK*\n\nGunakan:\n${config.prefix}verify <link>\n\nContoh:\n${config.prefix}verify https://alight-creative.firebaseapp.com/...`
      }, { quoted: msg })
    }

    if (!magicLink.startsWith('http')) {
      return sock.sendMessage(jid, {
        text: '❌ Format link tidak valid. Pastikan link dimulai dengan http:// atau https://'
      }, { quoted: msg })
    }

    const result = await handleVerifyCommand({ sock, msg, jid, magicLink, config, isOwner })

    if (result?.reply) {
      await sock.sendMessage(jid, {
        text: result.reply,
        mentions: result.mentions || []
      }, { quoted: msg })
    }
  }
}
