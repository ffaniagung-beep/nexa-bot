import {
  getGroupInfo
} from '../lib/group.js'

export default {
  name: 'checkadmin',
  aliases: ['ca'],
  category: 'GROUP',
  description: 'Mengecek status admin user dan bot',
  usage: '!checkadmin',
  groupOnly: true,

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
            '❌ Cuma bisa dicek di grup.'
        },
        { quoted: msg }
      )

      return
    }

    await sock.sendMessage(
      jid,
      {
        text:
          `🛡️ ADMIN DEBUG\n\n` +
          `You admin: ${info.isAdmin ? '✅' : '❌'}\n` +
          `NEXA admin: ${info.isBotAdmin ? '✅' : '❌'}\n` +
          `Bot detected: ${info.botParticipant ? '✅' : '❌'}`
      },
      { quoted: msg }
    )
  }
}
