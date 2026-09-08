import { acquireMaker, react, stage, failureText } from '../lib/maker-runtime.js'
import { getMediaSource, downloadMedia } from '../lib/maker-media.js'
import { enhancePhoto } from '../lib/hd.js'
import { canUseLimit, chargeLimit, sendLimitEmpty } from '../lib/limitGate.js'
import { addLimit } from '../lib/userdb.js'

const HD_COST = 5
export default {
  name: 'hd', aliases: ['enhance', 'upscale'], category: 'MAKER',
  description: 'Perjelas foto, upscale hingga 2x (maks. sisi 4096 px)', usage: '.hd',
  async run({ sock, msg, jid, config }) {
    const source = getMediaSource(msg, sock)
    if (source?.type !== 'image') return sock.sendMessage(jid, {
      text: `✨ Reply foto dengan ${(config?.prefix || '.')}hd.\nUpscale hingga 2x, maksimal sisi 4096 px. Biaya: 5 limit; premium/owner gratis.`
    }, { quoted: msg })
    const access = canUseLimit({ msg, jid, cost: HD_COST })
    if (!access.allowed) return sendLimitEmpty({ sock, msg, jid })
    const release = acquireMaker()
    if (!release) return sock.sendMessage(jid, { text: '⏳ Dua proses gambar sedang berjalan. Coba lagi setelah selesai.' }, { quoted: msg })
    let result, charged = false, delivered = false
    react(sock, jid, msg, '✨')
    try {
      const buffer = await stage('hd/download', () => downloadMedia(source, sock))
      result = await stage('hd/convert', () => enhancePhoto(buffer))
      if (!access.unlimited) {
        const payment = chargeLimit({ msg, jid, cost: HD_COST })
        if (!payment.success) return sendLimitEmpty({ sock, msg, jid })
        charged = true
      }
      await stage('hd/send', () => sock.sendMessage(jid, {
        document: result.buffer, mimetype: 'image/jpeg', fileName: `NEXA-HD-${Date.now()}.jpg`,
        caption: `✨ HD selesai\nDenoise + sharpen, upscale hingga 2x (maks. sisi 4096 px).\n🎟 Biaya: ${access.unlimited ? 'Gratis' : '5 limit'}`
      }, { quoted: msg, mediaUploadTimeoutMs: 30000 }))
      delivered = true
      react(sock, jid, msg, '✅')
    } catch (err) {
      let refund = ''
      if (charged && !delivered) {
        try { addLimit(access.userJid, HD_COST); refund = '\n5 limit dikembalikan.' }
        catch (refundError) { console.error('[MAKER] hd/refund failed:', refundError); refund = '\nPengembalian limit gagal; hubungi owner.' }
      }
      react(sock, jid, msg, '❌')
      await sock.sendMessage(jid, { text: `⚠️ HD gagal (${err.makerStage || 'hd'}).\n${failureText(err)}${refund}` }, { quoted: msg })
    } finally {
      try { await result?.cleanup() } catch {}
      release()
    }
  }
}
