export default {
  name: 'admin',
  aliases: ['adminmenu'],
  category: 'GROUP',
  description: 'Menampilkan menu admin grup',
  usage: '.admin',
  groupOnly: true,

  async run({
    sock,
    msg,
    jid,
    config
  }) {
    if (!jid.endsWith('@g.us')) {
      await sock.sendMessage(
        jid,
        {
          text:
            '❌ Menu admin cuma tersedia di grup.'
        },
        { quoted: msg }
      )

      return
    }

    const text = `
╭━━「 🛡️ NEXA ADMIN 」
┃
┃ ${config.prefix}kick @user
┃ ${config.prefix}promote @user
┃ ${config.prefix}demote @user
┃ ${config.prefix}group open
┃ ${config.prefix}group close
┃ ${config.prefix}tagall [pesan]
┃ ${config.prefix}hidetag [pesan]
┃ ${config.prefix}rules
┃ ${config.prefix}setrules <teks>
┃
╰━━━━━━━━━━━━━━━━━━

⚡ ${config.botName}
`.trim()

    await sock.sendMessage(
      jid,
      { text },
      { quoted: msg }
    )
  }
}
