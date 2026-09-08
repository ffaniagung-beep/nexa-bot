export default {
  name: 'tagall',
  category: 'GROUP',
  description: 'Mention semua member grup',
  usage: '!tagall [pesan]',
  groupOnly: true,

  async run({ sock, msg, jid, args }) {
    if (!jid.endsWith('@g.us')) {
      await sock.sendMessage(
        jid,
        { text: '❌ Command ini cuma buat grup.' },
        { quoted: msg }
      )
      return
    }

    const metadata =
      await sock.groupMetadata(jid)

    const mentions =
      metadata.participants.map(p => p.id)

    const custom =
      args.join(' ') || '📢 Tag All!'

    const members =
      mentions
        .map(
          (id, i) =>
            `${i + 1}. @${id.split('@')[0]}`
        )
        .join('\n')

    await sock.sendMessage(
      jid,
      {
        text:
          `📢 *${custom}*\n\n${members}`,
        mentions
      },
      { quoted: msg }
    )
  }
}
