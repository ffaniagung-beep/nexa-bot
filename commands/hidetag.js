export default {
  name: 'hidetag',
  aliases: ['ht'],
  category: 'GROUP',
  description: 'Mention semua member tanpa daftar tag',
  usage: '!hidetag [pesan]',
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

    const text =
      args.join(' ') || '📢 Pengumuman'

    await sock.sendMessage(
      jid,
      {
        text,
        mentions
      }
    )
  }
}
