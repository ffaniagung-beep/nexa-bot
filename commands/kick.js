import {
  getGroupInfo,
  getTarget
} from '../lib/group.js'

export default {
  name: 'kick',
  aliases: ['remove'],

  category: 'GROUP',
  description: 'Mengeluarkan member dari grup',
  usage: '!kick @user',

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
            '⛔ Cuma admin grup yang bisa pakai command ini.'
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
            '⚠️ NEXA-BOT harus jadi admin dulu.'
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
            'Gunakan:\n' +
            '!kick @user\n\n' +
            'Atau reply pesan orang lalu ketik !kick'
        },
        { quoted: msg }
      )

      return
    }

    await sock.groupParticipantsUpdate(
      jid,
      [target],
      'remove'
    )

    await sock.sendMessage(
      jid,
      {
        text: '✅ Member dikeluarkan.'
      }
    )
  }
}
