import {
  updateUser
} from '../lib/userdb.js'

import {
  getProfileJid
} from '../lib/profile.js'

export default {
  name: 'setname',

  aliases: [
    'setnama'
  ],

  category: 'PROFILE',

  description:
    'Mengatur nama profil NEXA',

  usage:
    '.setname <nama>',

  async run({
    sock,
    msg,
    jid,
    args,
    config
  }) {
    const name =
      args
        .join(' ')
        .trim()

    if (!name) {
      await sock.sendMessage(
        jid,
        {
          text:
            `Contoh:\n` +
            `${config.prefix}setname NEXA User`
        },
        {
          quoted: msg
        }
      )

      return
    }

    if (name.length > 30) {
      await sock.sendMessage(
        jid,
        {
          text:
            '❌ Nama maksimal 30 karakter.'
        },
        {
          quoted: msg
        }
      )

      return
    }

    const userJid =
      getProfileJid(
        msg,
        jid
      )

    updateUser(
      userJid,
      {
        name
      }
    )

    await sock.sendMessage(
      jid,
      {
        text:
          `✅ Nama profil diubah menjadi *${name}*.`
      },
      {
        quoted: msg
      }
    )
  }
}
