import {
  updateUser
} from '../lib/userdb.js'

import {
  getProfileJid
} from '../lib/profile.js'

export default {
  name: 'setage',

  aliases: [
    'setumur'
  ],

  category: 'PROFILE',

  description:
    'Mengatur umur profil',

  usage:
    '.setage <umur>',

  async run({
    sock,
    msg,
    jid,
    args,
    config
  }) {
    const age =
      Number(
        args[0]
      )

    if (
      !Number.isInteger(age) ||
      age < 1 ||
      age > 120
    ) {
      await sock.sendMessage(
        jid,
        {
          text:
            `Masukkan umur yang valid.\n\n` +
            `Contoh:\n` +
            `${config.prefix}setage 16`
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
        age
      }
    )

    await sock.sendMessage(
      jid,
      {
        text:
          `✅ Umur profil disimpan: *${age}*.`
      },
      {
        quoted: msg
      }
    )
  }
}
