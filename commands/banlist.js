import {
  getBannedUsers
} from '../lib/userdb.js'

export default {
  name: 'banlist',

  category: 'BOT',
  description:
    'Daftar user yang diban',
  usage:
    '.banlist',

  ownerOnly: true,

  async run({
    sock,
    msg,
    jid
  }) {
    const users =
      getBannedUsers()

    if (!users.length) {
      await sock.sendMessage(
        jid,
        {
          text:
            '✅ Belum ada user yang diban.'
        },
        {
          quoted: msg
        }
      )

      return
    }

    const text =
      `╭─ *NEXA BANLIST*\n` +
      users
        .map(
          (user, i) =>
            `│ ${i + 1}. ${user}`
        )
        .join('\n') +
      `\n╰────────────`

    await sock.sendMessage(
      jid,
      { text },
      { quoted: msg }
    )
  }
}
