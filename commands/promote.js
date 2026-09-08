import {
  getGroupInfo,
  getTarget
} from '../lib/group.js'

export default {
  name: 'promote',
  category: 'GROUP',
  description: 'Menjadikan member sebagai admin',
  usage: '!promote @user',

  groupOnly: true,
  adminOnly: true,
  botAdmin: true,

  async run({
    sock,
    msg,
    jid
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
            '⛔ Khusus admin grup.'
        },
        { quoted: msg }
      )

      return
    }

    if (!info.isBotAdmin) {
      await sock.sendMessage(
        jid,
        {
          text:
            '⚠️ NEXA-BOT harus menjadi admin.'
        },
        { quoted: msg }
      )

      return
    }

    const target =
      getTarget(msg)

    if (!target) {
      await sock.sendMessage(
        jid,
        {
          text:
            'Mention atau reply user.\n\n' +
            'Contoh: !promote @user'
        },
        { quoted: msg }
      )

      return
    }

    await sock.groupParticipantsUpdate(
      jid,
      [target],
      'promote'
    )

    await sock.sendMessage(
      jid,
      {
        text:
          '🛡️ User berhasil dijadikan admin.'
      }
    )
  }
}
