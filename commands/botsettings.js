import {
  getBotDB
} from '../lib/botdb.js'

export default {
  name: 'botsettings',
  aliases: [
    'botmenu',
    'bot'
  ],

  category: 'BOT',
  description:
    'Menampilkan pengaturan global NEXA-BOT',
  usage:
    '.botsettings',

  ownerOnly: true,

  async run({
    sock,
    msg,
    jid,
    config
  }) {
    const db =
      getBotDB()

    const text = `
╭─ ◈ *NEXA BOT SETTINGS*
│
│ Anti-Spam : ${db.antiSpam ? 'ON' : 'OFF'}
│ RejectCall: ${db.rejectCall ? 'ON' : 'OFF'}
│ Call Mode : ${db.callMode}
│
╰────────────

◈ ${config.prefix}antispam on/off
◈ ${config.prefix}rejectcall on/off
◈ ${config.prefix}callmode warn/block
◈ ${config.prefix}ban @user
◈ ${config.prefix}unban @user
◈ ${config.prefix}banlist
`.trim()

    await sock.sendMessage(
      jid,
      { text },
      { quoted: msg }
    )
  }
}
