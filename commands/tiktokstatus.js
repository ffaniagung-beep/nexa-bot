import {
  readJob,
  refreshJobStatus,
  bytesToHuman
} from '../lib/tiktokPublisher.js'

export default {
  name: 'tiktokstatus',
  aliases: ['ttstatus'],
  category: 'OWNER',
  ownerOnly: true,
  description: 'Cek status job TikTok publisher',
  usage: '.tiktokstatus <job>',

  async run({ sock, msg, jid, args }) {
    const id = String(args?.[0] || '').trim().toLowerCase()
    if (!id) {
      await sock.sendMessage(jid, { text: 'Gunakan: `.tiktokstatus <job>`' }, { quoted: msg })
      return
    }

    try {
      let job = await readJob(id)
      if (!job) throw new Error('Job TikTok tidak ditemukan.')

      let status = null
      if (job.publishId) {
        const refreshed = await refreshJobStatus(id)
        job = refreshed.job
        status = refreshed.status
      }

      const ids = Array.isArray(job.publicPostIds) ? job.publicPostIds : []
      await sock.sendMessage(jid, {
        text:
          '✦ *NEXA • TIKTOK STATUS*\n\n' +
          '🆔 Job: `' + job.id + '`\n' +
          `📦 Size: ${bytesToHuman(job.size)}\n` +
          `🧭 Local: *${job.state}*\n` +
          `📡 TikTok: *${status?.status || job.remoteStatus || '-'}*\n` +
          (job.publishId ? '🔖 Publish ID: `' + job.publishId + '`\n' : '') +
          (status?.fail_reason || job.remoteFailReason
            ? `❌ Reason: ${status?.fail_reason || job.remoteFailReason}\n`
            : '') +
          (ids.length ? `🎬 Post ID: ${ids.join(', ')}\n` : '') +
          (job.lastError ? `⚠️ Last local error: ${job.lastError}\n` : '')
      }, { quoted: msg })
    } catch (error) {
      await sock.sendMessage(jid, {
        text: `❌ Gagal cek TikTok status:\n${error?.message || error}`
      }, { quoted: msg })
    }
  }
}
