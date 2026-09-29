import { disconnectTikTok } from '../lib/tiktokPublisher.js'

export default {
  name: 'tiktoklogout',
  aliases: ['ttlogout'],
  category: 'OWNER',
  ownerOnly: true,
  description: 'Hapus token TikTok yang tersimpan di NEXA',
  usage: '.tiktoklogout SETUJU',

  async run({ sock, msg, jid, args }) {
    if (String(args?.[0] || '').toUpperCase() !== 'SETUJU') {
      await sock.sendMessage(jid, {
        text: 'Untuk menghapus token lokal TikTok, gunakan `.tiktoklogout SETUJU`.'
      }, { quoted: msg })
      return
    }

    try {
      await disconnectTikTok()
      await sock.sendMessage(jid, {
        text: '✅ Token TikTok lokal sudah dihapus. Untuk memakai publisher lagi, jalankan `.tiktokauth`.'
      }, { quoted: msg })
    } catch (error) {
      await sock.sendMessage(jid, {
        text: `❌ Gagal menghapus token TikTok:\n${error?.message || error}`
      }, { quoted: msg })
    }
  }
}
