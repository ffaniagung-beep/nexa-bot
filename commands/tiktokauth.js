import {
  createAuthorizationUrl,
  ensureOAuthCallbackServer,
  getAuthStatus
} from '../lib/tiktokPublisher.js'

export default {
  name: 'tiktokauth',
  aliases: ['ttauth'],
  category: 'OWNER',
  ownerOnly: true,
  description: 'Hubungkan akun TikTok untuk Content Posting API',
  usage: '.tiktokauth',

  async run({ sock, msg, jid }) {
    try {
      const current = await getAuthStatus()
      await ensureOAuthCallbackServer()
      const url = await createAuthorizationUrl()

      await sock.sendMessage(jid, {
        text:
          '✦ *NEXA • TIKTOK AUTH*\n\n' +
          (current.connected ? 'ℹ️ Akun sebelumnya sudah terhubung. Link ini akan melakukan otorisasi ulang.\n\n' : '') +
          '1. Buka link di bawah.\n' +
          '2. Login ke TikTok dan setujui izin yang tampil.\n' +
          '3. Setelah halaman callback menampilkan sukses, kembali ke WhatsApp.\n' +
          '4. Jalankan `.tiktokaccount`.\n\n' +
          `🔗 ${url}\n\n` +
          '⚠️ Jangan kirim client secret, access token, atau refresh token lewat chat.'
      }, { quoted: msg })
    } catch (error) {
      await sock.sendMessage(jid, {
        text: `❌ TikTok auth belum bisa dimulai:\n${error?.message || error}`
      }, { quoted: msg })
    }
  }
}
