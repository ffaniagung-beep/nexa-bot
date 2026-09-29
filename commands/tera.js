// NEXA • TERABOX DOWNLOADER • ZYVOR
const API_URL = 'https://api.zyvor.my.id/api/downloader/terabox'
const API_TIMEOUT = 45_000
const MAX_SEND_BYTES = 50 * 1024 * 1024

function clean(value, max = 500) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max)
}

function httpUrl(value) {
  try {
    const u = new URL(String(value || ''))
    return ['http:', 'https:'].includes(u.protocol) ? u.href : ''
  } catch {
    return ''
  }
}

function isTeraBoxUrl(value) {
  const url = httpUrl(value)
  if (!url) return false
  const host = new URL(url).hostname.toLowerCase()
  return ['terabox', '1024tera', 'nephobox', 'freeterabox'].some(x => host.includes(x))
}

function formatBytes(value) {
  let n = Number(value || 0)
  if (!Number.isFinite(n) || n <= 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1 }
  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`
}

function formatDuration(value) {
  const sec = Math.max(0, Math.floor(Number(value || 0)))
  if (!sec) return '-'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

function ext(name) {
  return clean(name, 240).toLowerCase().match(/\.([a-z0-9]{1,10})$/)?.[1] || ''
}

function isVideo(name) {
  return ['mp4', 'mkv', 'webm', 'mov', 'm4v', '3gp'].includes(ext(name))
}

function mime(name) {
  return ({
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
    mp3: 'audio/mpeg', m4a: 'audio/mp4', pdf: 'application/pdf',
    zip: 'application/zip', rar: 'application/vnd.rar',
    '7z': 'application/x-7z-compressed', jpg: 'image/jpeg',
    jpeg: 'image/jpeg', png: 'image/png'
  })[ext(name)] || 'application/octet-stream'
}

function firstUrl(...values) {
  for (const value of values) {
    const url = httpUrl(value)
    if (url) return url
  }
  return ''
}

function directUrl(item, data) {
  const url = firstUrl(
    item?.download_url, item?.downloadUrl, item?.direct_url, item?.directUrl,
    item?.dlink, item?.file_url, item?.fileUrl,
    data?.download_url, data?.downloadUrl, data?.direct_url, data?.directUrl,
    data?.dlink, data?.result?.download_url, data?.result?.downloadUrl,
    data?.result?.direct_url, data?.result?.directUrl, data?.result?.dlink
  )
  if (url) return url

  const generic = firstUrl(item?.url)
  return generic && !/thumbnail/i.test(generic) ? generic : ''
}

function thumbUrl(item) {
  return firstUrl(
    item?.thumbnails?.large,
    item?.thumbnails?.medium,
    item?.thumbnails?.small,
    item?.thumbnail,
    item?.thumb
  )
}

async function getInfo(input) {
  const endpoint = new URL(API_URL)
  endpoint.searchParams.set('url', input)

  const response = await fetch(endpoint, {
    headers: { Accept: 'application/json', 'User-Agent': 'NEXA-BOT/1.0' },
    signal: AbortSignal.timeout(API_TIMEOUT)
  })

  const raw = await response.text()
  let data
  try { data = JSON.parse(raw) } catch { throw new Error(`TERA_BAD_JSON_${response.status}`) }

  if (!response.ok || data?.status !== true) {
    throw new Error(clean(data?.message || data?.error || `TERA_HTTP_${response.status}`, 180))
  }

  const list = Array.isArray(data?.list) ? data.list : []
  if (!list.length) throw new Error('TERA_EMPTY_LIST')
  return { data, list }
}

function detail(item, index, total) {
  const name = clean(item?.name || `File ${index + 1}`, 180)
  const size = clean(item?.size_formatted, 50) || formatBytes(item?.size)
  const res = Number(item?.width) > 0 && Number(item?.height) > 0
    ? `${item.width}×${item.height}` : '-'

  return (
    `📦 *NEXA • TERABOX*\n\n` +
    `📄 *${name}*\n` +
    `📊 File: ${index + 1}/${total}\n` +
    `💾 Ukuran: ${size}\n` +
    `🎞 Resolusi: ${res}\n` +
    `⏱ Durasi: ${formatDuration(item?.duration)}`
  )
}

function listText(items, prefix, input) {
  const rows = items.slice(0, 12).map((item, i) => {
    const name = clean(item?.name || `File ${i + 1}`, 80)
    const size = clean(item?.size_formatted, 30) || formatBytes(item?.size)
    return `${i + 1}. ${name} (${size})`
  })

  return (
    `📦 *NEXA • TERABOX*\n\n` +
    `Link ini berisi *${items.length} file*.\n\n${rows.join('\n')}` +
    (items.length > 12 ? `\n…dan ${items.length - 12} file lain` : '') +
    `\n\nPilih file:\n*${prefix}tera ${input} <nomor>*`
  )
}

async function sendMetadata({ sock, msg, jid, item, index, total, input }) {
  const caption =
    detail(item, index, total) +
    `\n\n⚠️ API Zyvor belum memberikan direct download URL untuk file ini.` +
    `\n🔗 ${input}`

  const thumb = thumbUrl(item)
  if (thumb) {
    try {
      await sock.sendMessage(jid, { image: { url: thumb }, caption }, {
        quoted: msg,
        mediaUploadTimeoutMs: 60_000
      })
      return
    } catch {}
  }

  await sock.sendMessage(jid, { text: caption }, { quoted: msg })
}

async function sendFile({ sock, msg, jid, item, url, index, total }) {
  const name = clean(item?.name || `terabox-${Date.now()}`, 180)
  const size = Number(item?.size || 0)
  const caption = detail(item, index, total)

  if (size > MAX_SEND_BYTES) {
    await sock.sendMessage(jid, {
      text: `${caption}\n\n⚠️ File lebih besar dari limit NEXA 50 MB.\n🔗 Direct link:\n${url}`
    }, { quoted: msg })
    return
  }

  if (isVideo(name)) {
    await sock.sendMessage(jid, { video: { url }, caption }, {
      quoted: msg,
      mediaUploadTimeoutMs: 120_000
    })
    return
  }

  await sock.sendMessage(jid, {
    document: { url }, fileName: name, mimetype: mime(name), caption
  }, {
    quoted: msg,
    mediaUploadTimeoutMs: 120_000
  })
}

export default {
  name: 'tera',
  aliases: ['terabox', 'teradl'],
  category: 'DOWNLOADER',
  description: 'Download atau resolve file dari link TeraBox',
  usage: '.tera <url> [nomor file]',

  async run({ sock, msg, jid, args, config }) {
    const input = clean(args?.[0], 1500)
    const prefix = config?.prefix || '.'

    if (!input || !isTeraBoxUrl(input)) {
      await sock.sendMessage(jid, {
        text:
          `📦 *NEXA • TERABOX*\n\nKirim link TeraBox.\n\n` +
          `Contoh:\n*${prefix}tera https://terabox.app/s/xxxxx*`
      }, { quoted: msg })
      return
    }

    try {
      await sock.sendMessage(jid, { text: '⏳ Mengambil data TeraBox...' }, { quoted: msg })

      const { data, list } = await getInfo(input)

      if (list.length > 1 && args?.[1] == null) {
        await sock.sendMessage(jid, { text: listText(list, prefix, input) }, { quoted: msg })
        return
      }

      let index = Number(args?.[1]) - 1
      if (!Number.isInteger(index) || index < 0) index = 0

      if (!list[index]) {
        await sock.sendMessage(jid, {
          text: `❌ Nomor file tidak valid. Pilih 1 sampai ${list.length}.`
        }, { quoted: msg })
        return
      }

      const item = list[index]
      const url = directUrl(item, data)

      if (!url) {
        await sendMetadata({ sock, msg, jid, item, index, total: list.length, input })
        return
      }

      await sendFile({ sock, msg, jid, item, url, index, total: list.length })
    } catch (error) {
      console.error('[TERABOX]', error?.message || error)
      const code = String(error?.message || '')
      let text = 'Gagal mengambil data TeraBox. Coba lagi sebentar.'
      if (/TimeoutError|timeout|abort/i.test(code)) text = 'API TeraBox terlalu lama merespons.'
      if (code === 'TERA_EMPTY_LIST') text = 'Tidak ada file yang ditemukan dari link tersebut.'

      await sock.sendMessage(jid, {
        text: `⚠️ *TERABOX ERROR*\n\n${text}`
      }, { quoted: msg })
    }
  }
}
