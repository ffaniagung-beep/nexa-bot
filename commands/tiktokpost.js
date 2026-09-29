import { getMediaSource } from '../lib/maker-media.js'
import {
  stageVideo,
  formatPrivacyOptions,
  bytesToHuman
} from '../lib/tiktokPublisher.js'

export default {
  name: 'tiktokpost',
  aliases: ['ttup', 'tiktokup'],
  category: 'OWNER',
  ownerOnly: true,
  description: 'Stage video untuk Direct Post TikTok',
  usage: '.tiktokpost <caption> (kirim/reply video)',

  async run({ sock, msg, jid, args }) {
    const source = getMediaSource(msg, sock)
    if (!source || source.type !== 'video') {
      await sock.sendMessage(jid, {
        text:
          '❌ Kirim video dengan caption command, atau reply sebuah video.\n\n' +
          'Contoh:\n`.tiktokpost akhirnya jadi juga 🗿 #coding`'
      }, { quoted: msg })
      return
    }

    const caption = args.join(' ').trim()

    try {
      await sock.sendMessage(jid, {
        text: '⏳ Mengambil creator info TikTok dan menyiapkan video...'
      }, { quoted: msg })

      const { job, creator } = await stageVideo({ source, sock, caption })

      await sock.sendMessage(jid, {
        text:
          '✦ *NEXA • TIKTOK STAGED*\n\n' +
          '🆔 Job: `' + job.id + '`\n' +
          `👤 @${creator.creator_username || '-'}\n` +
          `📦 ${bytesToHuman(job.size)}\n` +
          (job.durationSec ? `⏱️ ${job.durationSec}s / max ${creator.max_video_post_duration_sec || '?'}s\n` : '') +
          `📝 ${job.caption || '(tanpa caption)'}\n\n` +
          '*Pilih privacy secara manual:*\n' +
          `${formatPrivacyOptions(creator.privacy_level_options)}\n\n` +
          '*Interaksi saat ini:*\n' +
          `• comments: ${creator.comment_disabled ? 'harus off' : 'on/off'}\n` +
          `• duet: ${creator.duet_disabled ? 'harus off' : 'on/off'}\n` +
          `• stitch: ${creator.stitch_disabled ? 'harus off' : 'on/off'}\n` +
          '• commercial: none / own / paid / both\n' +
          '• aigc: on kalau video AI-generated, selain itu off\n\n' +
          'Dengan konfirmasi, kamu menyatakan sudah meninjau video/caption dan menyetujui Music Usage Confirmation TikTok; branded content juga tunduk pada Branded Content Policy.\n\n' +
          '*Belum diposting.* Untuk benar-benar kirim ke TikTok, gunakan:\n' +
          '`.tiktokconfirm ' + job.id + ' <PRIVACY> <comments:on/off> <duet:on/off> <stitch:on/off> <commercial:none/own/paid/both> <aigc:on/off> SETUJU`\n\n' +
          'Contoh (hanya contoh format, pilih sesuai opsi akunmu):\n' +
          '`.tiktokconfirm ' + job.id + ' SELF_ONLY off off off none off SETUJU`\n\n' +
          'Batalkan: `.tiktokcancel ' + job.id + '`\n' +
          '⏱️ Staging berlaku 1 jam.'
      }, { quoted: msg })
    } catch (error) {
      await sock.sendMessage(jid, {
        text: `❌ Gagal menyiapkan TikTok post:\n${error?.message || error}`
      }, { quoted: msg })
    }
  }
}
