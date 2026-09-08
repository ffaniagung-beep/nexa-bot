import {
  getGroupConfig,
  updateGroupConfig
} from '../lib/groupdb.js'

export default {
  name: 'setgoodbye',

  category: 'GROUP',
  description:
    'Mengatur pesan goodbye grup',
  usage:
    '.setgoodbye <pesan>',

  groupOnly: true,
  adminOnly: true,

  async run({
    sock,
    msg,
    jid,
    args,
    config
  }) {
    const text =
      args.join(' ').trim()

    if (!text) {
      await sock.sendMessage(
        jid,
        {
          text:
            `Contoh:\n` +
            `${config.prefix}setgoodbye Sampai jumpa @user 👋\n\n` +
            `Variable:\n` +
            `@user = member\n` +
            `@group = nama grup\n` +
            `@count = jumlah member`
        },
        {
          quoted: msg
        }
      )

      return
    }

    updateGroupConfig(
      jid,
      {
        goodbyeText: text
      }
    )

    const data =
      getGroupConfig(jid)

    let response =
      '✅ Pesan goodbye berhasil disimpan.'

    if (data.welcome) {
      response +=
        '\n🟢 Welcome/Goodbye system: ON'
    } else {
      response +=
        `\n🔴 Welcome/Goodbye system: OFF\n` +
        `Gunakan *${config.prefix}welcome on* untuk mengaktifkan.`
    }

    await sock.sendMessage(
      jid,
      {
        text: response
      },
      {
        quoted: msg
      }
    )
  }
}
