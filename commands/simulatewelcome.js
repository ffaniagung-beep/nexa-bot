import {
  getGroupConfig
} from '../lib/groupdb.js'

export default {
  name: 'simulatewelcome',
  aliases: ['simwelcome'],

  category: 'GROUP',
  description:
    'Preview pesan welcome',
  usage:
    '.simulatewelcome',

  groupOnly: true,
  adminOnly: true,

  async run({
    sock,
    msg,
    jid
  }) {
    const metadata =
      await sock.groupMetadata(jid)

    const data =
      getGroupConfig(jid)

    const user =
      msg.key.participant ||
      msg.key.participantAlt ||
      sock.user?.id

    const mention =
      `@${String(user)
        .split('@')[0]}`

    let text =
      data.welcomeText ||
      'Selamat datang @user di @group 👋\nKamu member ke-@count.'

    text =
      text
        .replaceAll(
          '@user',
          mention
        )
        .replaceAll(
          '@group',
          metadata.subject
        )
        .replaceAll(
          '@count',
          String(
            metadata.participants.length
          )
        )

    await sock.sendMessage(
      jid,
      {
        text,
        mentions: [user]
      },
      { quoted: msg }
    )
  }
}
