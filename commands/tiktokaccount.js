import {
  getAuthStatus,
  queryCreatorInfo,
  formatPrivacyOptions
} from '../lib/tiktokPublisher.js'

function dateText(ms) {
  if (!ms) return '-'
  try { return new Date(ms).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) }
  catch { return new Date(ms).toISOString() }
}

export default {
  name: 'tiktokaccount',
  aliases: ['ttaccount', 'ttacc'],
  category: 'OWNER',
  ownerOnly: true,
  description: 'Cek akun TikTok yang terhubung',
  usage: '.tiktokaccount',

  async run({ sock, msg, jid }) {
    try {
      const auth = await getAuthStatus()
      if (!auth.connected) {
        await sock.sendMessage(jid, {
          text: '❌ TikTok belum terhubung. Jalankan `.tiktokauth`.'
        }, { quoted: msg })
        return
      }

      const creator = await queryCreatorInfo()
      await sock.sendMessage(jid, {
        text:
          '✦ *NEXA • TIKTOK ACCOUNT*\n\n' +
          `👤 ${creator.creator_nickname || '-'} (@${creator.creator_username || '-'})\n` +
          `🔐 Scope: ${auth.scope || '-'}\n` +
          `⏳ Access token expiry: ${dateText(auth.expiresAt)}\n\n` +
          '*Privacy tersedia:*\n' +
          `${formatPrivacyOptions(creator.privacy_level_options)}\n\n` +
          `💬 Comment: ${creator.comment_disabled ? 'disabled' : 'available'}\n` +
          `🎭 Duet: ${creator.duet_disabled ? 'disabled' : 'available'}\n` +
          `🧵 Stitch: ${creator.stitch_disabled ? 'disabled' : 'available'}\n` +
          (creator.max_video_post_duration_sec
            ? `⏱️ Max duration: ${creator.max_video_post_duration_sec}s\n`
            : '')
      }, { quoted: msg })
    } catch (error) {
      await sock.sendMessage(jid, {
        text: `❌ Gagal membaca akun TikTok:\n${error?.message || error}`
      }, { quoted: msg })
    }
  }
}
