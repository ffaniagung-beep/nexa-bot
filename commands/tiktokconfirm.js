import {
  confirmAndPublish,
  refreshJobStatus
} from '../lib/tiktokPublisher.js'

export default {
  name: 'tiktokconfirm',
  aliases: ['ttconfirm'],
  category: 'OWNER',
  ownerOnly: true,
  description: 'Konfirmasi dan upload staged TikTok post',
  usage: '.tiktokconfirm <job> <privacy> <comment> <duet> <stitch> <commercial> <aigc> SETUJU',

  async run({ sock, msg, jid, args }) {
    if (args.length < 8) {
      await sock.sendMessage(jid, {
        text:
          'Format:\n' +
          '`.tiktokconfirm <job> <privacy> <comments:on/off> <duet:on/off> <stitch:on/off> <commercial:none/own/paid/both> <aigc:on/off> SETUJU`\n\n' +
          'Tidak ada privacy/interaksi default; pilih semuanya secara manual.'
      }, { quoted: msg })
      return
    }

    const [id, privacy, comments, duet, stitch, commercial, aigc, consent] = args

    try {
      await sock.sendMessage(jid, {
        text: '⏳ Menginisialisasi post dan mengupload video ke TikTok...'
      }, { quoted: msg })

      const job = await confirmAndPublish({
        id,
        privacy,
        comments,
        duet,
        stitch,
        commercial,
        aigc,
        consent
      })

      let remoteText = 'PROCESSING'
      try {
        const refreshed = await refreshJobStatus(job.id)
        remoteText = refreshed.status?.status || refreshed.job.state || remoteText
      } catch {}

      await sock.sendMessage(jid, {
        text:
          '✅ Video sudah dikirim ke TikTok.\n\n' +
          '🆔 Job: `' + job.id + '`\n' +
          `📡 Status awal: *${remoteText}*\n\n` +
          'Cek lagi dengan: `.tiktokstatus ' + job.id + '`\n\n' +
          'Catatan: moderation/pemrosesan TikTok bisa membuat status final belum langsung tersedia.'
      }, { quoted: msg })
    } catch (error) {
      await sock.sendMessage(jid, {
        text:
          `❌ TikTok publish gagal/ambigu:\n${error?.message || error}\n\n` +
          'Kalau init sempat berhasil, jangan langsung upload ulang. Cek: `.tiktokstatus ' + id + '`'
      }, { quoted: msg })
    }
  }
}
