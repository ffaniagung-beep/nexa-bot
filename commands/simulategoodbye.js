import {
  getGroupConfig
} from '../lib/groupdb.js'

export default {
  name: 'simulategoodbye',
  aliases: ['simgoodbye'],

  category: 'GROUP',
  description:
    'Preview pesan goodbye',
  usage:
    '.simulategoodbye',

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
      data.goodbyeText ||
      'Sampai jumpa @user 👋'

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
