import {
  getRest
} from '../lib/ownerTools.js'

export default {
  name: 'setbotname',

  aliases: [
    'setnamebot'
  ],

  category: 'OWNER',
  ownerOnly: true,

  description:
    'Mengganti nama profil bot',

  usage:
    '.setbotname <nama>',

  async run({
    sock,
    msg,
    jid
  }) {
    const name =
      getRest(msg)

    if (
      !name ||
      name.length > 25
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            'Contoh:\n*.setbotname NEXA-BOT*\n\nMaksimal 25 karakter.'
        },
        {
          quoted: msg
        }
      )
    }

    try {
      await sock.updateProfileName(
        name
      )

      await sock.sendMessage(
        jid,
        {
          text:
            `✅ Nama profil bot berhasil diganti menjadi:\n*${name}*`
        },
        {
          quoted: msg
        }
      )
    } catch (err) {
      console.error(
        '👑 setbotname:',
        err
      )

      await sock.sendMessage(
        jid,
        {
          text:
            '⚠️ Gagal mengganti nama profil bot.'
        },
        {
          quoted: msg
        }
      )
    }
  }
}
