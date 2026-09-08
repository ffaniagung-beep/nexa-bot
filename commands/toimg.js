import { acquireMaker, react, stage, failureText } from '../lib/maker-runtime.js'
import { getMediaSource, downloadMedia, stickerToImage } from '../lib/maker-media.js'
export default {
  name: 'toimg', aliases: ['toimage', 'sticker2img'], category: 'MAKER',
  description: 'Ubah stiker menjadi gambar (frame pertama untuk animasi)', usage: '.toimg',
  async run({ sock, msg, jid, config }) {
    const source = getMediaSource(msg, sock)
    if (source?.type !== 'sticker') return sock.sendMessage(jid, {
      text: `🖼️ Reply stiker dengan ${config?.prefix || '.'}toimg.`
    }, { quoted: msg })
    const release = acquireMaker()
    if (!release) return sock.sendMessage(jid, { text: '⏳ Dua proses gambar sedang berjalan. Coba lagi setelah selesai.' }, { quoted: msg })
    let result
    react(sock, jid, msg, '⏳')
    try {
      const buffer = await stage('toimg/download', () => downloadMedia(source, sock))
      result = await stage('toimg/convert', () => stickerToImage(buffer))
      await stage('toimg/send', () => sock.sendMessage(jid, {
        image: result.buffer, mimetype: 'image/png',
        caption: result.animated ? '🖼️ Frame pertama stiker animasi • NEXA' : '🖼️ Converted by NEXA'
      }, { quoted: msg, mediaUploadTimeoutMs: 30000 }))
      react(sock, jid, msg, '✅')
    } catch (err) {
      react(sock, jid, msg, '❌')
      await sock.sendMessage(jid, { text: `⚠️ ToImg gagal (${err.makerStage || 'toimg'}).\n${failureText(err)}` }, { quoted: msg })
    } finally {
      try { await result?.cleanup() } catch {}
      release()
    }
  }
}
