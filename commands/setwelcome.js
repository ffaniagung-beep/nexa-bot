import {
  getGroupConfig,
  updateGroupConfig
} from '../lib/groupdb.js'

export default {
  name: 'setwelcome',

  category: 'GROUP',
  description:
    'Mengatur pesan welcome grup',
  usage:
    '.setwelcome <pesan>',

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
            `${config.prefix}setwelcome Selamat datang @user di @group 👋\n\n` +
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
        welcomeText: text
      }
    )

    const data =
      getGroupConfig(jid)

    let response =
      '✅ Pesan welcome berhasil disimpan.'

    if (data.welcome) {
      response +=
        '\n🟢 Welcome system: ON'
    } else {
      response +=
        `\n🔴 Welcome system: OFF\n` +
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
