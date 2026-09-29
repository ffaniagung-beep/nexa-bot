import { cancelJob } from '../lib/tiktokPublisher.js'

export default {
  name: 'tiktokcancel',
  aliases: ['ttcancel'],
  category: 'OWNER',
  ownerOnly: true,
  description: 'Batalkan staged/pending TikTok job',
  usage: '.tiktokcancel <job>',

  async run({ sock, msg, jid, args }) {
    const id = String(args?.[0] || '').trim().toLowerCase()
    if (!id) {
      await sock.sendMessage(jid, { text: 'Gunakan: `.tiktokcancel <job>`' }, { quoted: msg })
      return
    }

    try {
      const ok = await cancelJob(id)
      await sock.sendMessage(jid, {
        text: ok ? '✅ Job TikTok `' + id + '` dibatalkan.' : '❌ Job TikTok tidak ditemukan.'
      }, { quoted: msg })
    } catch (error) {
      await sock.sendMessage(jid, {
        text: `❌ Gagal membatalkan job:\n${error?.message || error}`
      }, { quoted: msg })
    }
  }
}
