import {
  updateGroupConfig
} from '../lib/groupdb.js'
import {
  getGroupInfo
} from '../lib/group.js'

export default {
  name: 'setrules',
  category: 'GROUP',
  description: 'Mengubah rules grup',
  usage: '.setrules <teks>',

  groupOnly: true,
  adminOnly: true,

  async run({
    sock,
    msg,
    jid,
    args,
    config
  }) {
    const info =
      await getGroupInfo(
        sock,
        jid,
        msg
      )

    if (!info.isGroup) {
      await sock.sendMessage(
        jid,
        {
          text:
            '❌ Command ini cuma buat grup.'
        },
        { quoted: msg }
      )

      return
    }

    if (!info.isAdmin) {
      await sock.sendMessage(
        jid,
        {
          text:
            '⛔ Hanya admin yang bisa mengubah rules.'
        },
        { quoted: msg }
      )

      return
    }

    const rules =
      args.join(' ').trim()

    if (!rules) {
      await sock.sendMessage(
        jid,
        {
          text:
            'Contoh:\n' +
            `${config.prefix}setrules Dilarang spam, saling menghormati.`
        },
        { quoted: msg }
      )

      return
    }

    updateGroupConfig(
      jid,
      { rules }
    )

    await sock.sendMessage(
      jid,
      {
        text:
          '✅ Rules grup berhasil disimpan.'
      },
      { quoted: msg }
    )
  }
}
