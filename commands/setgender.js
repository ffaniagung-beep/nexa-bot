import {
  updateUser
} from '../lib/userdb.js'

import {
  getProfileJid
} from '../lib/profile.js'

export default {
  name: 'setgender',

  aliases: [
    'setkelamin'
  ],

  category: 'PROFILE',

  description:
    'Mengatur gender profil',

  usage:
    '.setgender male/female/other',

  async run({
    sock,
    msg,
    jid,
    args,
    config
  }) {
    const input =
      args[0]
        ?.toLowerCase()

    const map = {
      male: 'male',
      cowok: 'male',
      laki: 'male',
      lakilaki: 'male',

      female: 'female',
      cewek: 'female',
      perempuan: 'female',

      other: 'other',
      lainnya: 'other'
    }

    const gender =
      map[input]

    if (!gender) {
      await sock.sendMessage(
        jid,
        {
          text:
            `Pilih gender:\n\n` +
            `${config.prefix}setgender male\n` +
            `${config.prefix}setgender female\n` +
            `${config.prefix}setgender other`
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
        gender
      }
    )

    await sock.sendMessage(
      jid,
      {
        text:
          '✅ Gender profil berhasil disimpan.'
      },
      {
        quoted: msg
      }
    )
  }
}
