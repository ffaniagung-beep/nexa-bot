import * as cheerio from 'cheerio'

const SSSTIK_HOME =
  'https://ssstik.io/id'

const SSSTIK_DOWNLOAD =
  'https://ssstik.io/abc?url=dl'

const MAX_VIDEO_BYTES =
  50 * 1024 * 1024

function isTikTokUrl(value) {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()

    return (
      host === 'tiktok.com' ||
      host.endsWith('.tiktok.com')
    )
  } catch {
    return false
  }
}

function walk(value, visit, path = []) {
  if (
    value === null ||
    value === undefined
  ) {
    return
  }

  if (Array.isArray(value)) {
    for (
      let i = 0;
      i < value.length;
      i += 1
    ) {
      walk(
        value[i],
        visit,
        [...path, String(i)]
      )
    }

    return
  }

  if (
    typeof value === 'object'
  ) {
    for (
      const [key, child]
      of Object.entries(value)
    ) {
      visit(
        key,
        child,
        [...path, key]
      )

      walk(
        child,
        visit,
        [...path, key]
      )
    }
  }
}

function findByKeys(
  root,
  keys,
  accept = () => true
) {
  const wanted =
    new Set(
      keys.map(key =>
        key.toLowerCase()
      )
    )

  let found

  walk(
    root,
    (key, value) => {
      if (found !== undefined) {
        return
      }

      if (
        wanted.has(
          String(key).toLowerCase()
        ) &&
        accept(value)
      ) {
        found = value
      }
    }
  )

  return found
}

function httpUrl(value) {
  return (
    typeof value === 'string' &&
    /^https?:\/\//i.test(value)
  )
}

function findVideoUrl(data) {
  // AlwaysCodex TikTok response:
  // result.downloads.nowm = [url1, url2, ...]
  const nowm =
    data?.result?.downloads?.nowm

  if (Array.isArray(nowm)) {
    const first =
      nowm.find(httpUrl)

    if (first) {
      return first
    }
  }

  if (httpUrl(nowm)) {
    return nowm
  }

  const direct =
    findByKeys(
      data,
      [
        'no_watermark',
        'nowatermark',
        'noWatermark',
        'play',
        'play_url',
        'playUrl',
        'download_url',
        'downloadUrl',
        'video_url',
        'videoUrl',
        'hdplay',
        'hd_play'
      ],
      httpUrl
    )

  if (direct) {
    return direct
  }

  let fallback

  walk(
    data,
    (key, value, path) => {
      if (fallback) {
        return
      }

      if (Array.isArray(value)) {
        const candidate =
          value.find(httpUrl)

        const context =
          `${path.join('.')} ${key}`
            .toLowerCase()

        if (
          candidate &&
          (
            context.includes('nowm') ||
            context.includes('video') ||
            context.includes('play') ||
            context.includes('download')
          )
        ) {
          fallback = candidate
        }

        return
      }

      if (!httpUrl(value)) {
        return
      }

      const context =
        `${path.join('.')} ${key}`
          .toLowerCase()

      if (
        context.includes('video') ||
        context.includes('play') ||
        context.includes('download')
      ) {
        fallback = value
      }
    }
  )

  return fallback
}

function findAuthor(data) {
  const authorObject =
    findByKeys(
      data,
      [
        'author',
        'creator',
        'user'
      ],
      value =>
        value &&
        typeof value === 'object' &&
        !Array.isArray(value)
    )

  if (authorObject) {
    const fromObject =
      findByKeys(
        authorObject,
        [
          'unique_id',
          'uniqueId',
          'username',
          'user_name',
          'nickname',
          'name'
        ],
        value =>
          typeof value === 'string' &&
          value.trim()
      )

    if (fromObject) {
      return fromObject
    }
  }

  return findByKeys(
    data,
    [
      'unique_id',
      'uniqueId',
      'username',
      'author_name',
      'authorName',
      'nickname'
    ],
    value =>
      typeof value === 'string' &&
      value.trim()
  )
}

function findText(data) {
  return findByKeys(
    data,
    [
      'description',
      'desc',
      'title',
      'caption'
    ],
    value =>
      typeof value === 'string' &&
      value.trim()
  )
}

function findNumber(data, keys) {
  const value =
    findByKeys(
      data,
      keys,
      candidate => {
        const number =
          Number(candidate)

        return Number.isFinite(number)
      }
    )

  if (
    value === undefined
  ) {
    return null
  }

  return Number(value)
}

function cleanText(value, max = 650) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function cleanUser(value) {
  return cleanText(value, 80)
    .replace(/^@+/, '')
}

function compactNumber(value) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return '-'
  }

  return new Intl.NumberFormat(
    'id-ID',
    {
      notation: 'compact',
      maximumFractionDigits: 1
    }
  ).format(
    Number(value)
  )
}

function extractSsstikToken(html) {
  const patterns = [
    /tt\s*:\s*['"]([\w\d]+)['"]/i,
    /s_tt\s*=\s*['"]([^'"]+)['"]/i,
    /\btt\s*=\s*['"]([^'"]+)['"]/i
  ]

  for (const pattern of patterns) {
    const match =
      String(html || '').match(pattern)

    if (match?.[1]) {
      return match[1]
    }
  }

  return null
}

function cookieHeader(response) {
  if (
    typeof response?.headers?.getSetCookie ===
    'function'
  ) {
    return response.headers
      .getSetCookie()
      .map(value =>
        value.split(';')[0]
      )
      .join('; ')
  }

  const raw =
    response?.headers?.get?.(
      'set-cookie'
    )

  return raw
    ? raw.split(',')
      .map(value =>
        value.split(';')[0]
      )
      .join('; ')
    : ''
}

function decodeSsstikUrl(value) {
  if (!httpUrl(value)) {
    return null
  }

  try {
    const parsed = new URL(value)

    if (
      !parsed.hostname
        .toLowerCase()
        .includes('ssscdn.io')
    ) {
      return value
    }

    const parts =
      parsed.pathname
        .split('/')
        .filter(Boolean)

    // Beberapa link SSSTik membungkus URL asli
    // sebagai base64 di bagian akhir path.
    for (
      let index = 0;
      index < parts.length;
      index += 1
    ) {
      const encoded =
        parts.slice(index).join('/')

      try {
        const decoded =
          Buffer.from(
            encoded,
            'base64'
          ).toString('utf8')

        if (httpUrl(decoded)) {
          return decoded
        }
      } catch {
        // coba potongan path berikutnya
      }
    }
  } catch {
    return value
  }

  return value
}

function parseSsstikResult(html) {
  const $ = cheerio.load(
    String(html || '')
  )

  const warning =
    cleanText(
      $('.is-icon.b-box.warning')
        .text() ||
      $('.warning').first().text()
    )

  if (warning) {
    throw new Error(
      `SSSTIK_REJECTED:${warning}`
    )
  }

  const title =
    cleanText(
      $('.maintext').first().text()
    )

  const author =
    cleanUser(
      $('.result_author')
        .first()
        .text()
        .match(/@([\w.]+)/)?.[1] ||
      $('.author')
        .first()
        .text()
        .match(/@([\w.]+)/)?.[1] ||
      ''
    )

  const thumbnail =
    $('.result_author img')
      .first()
      .attr('src') ||
    $('.result_overlay img')
      .first()
      .attr('src') ||
    null

  const links = []

  $('.result_overlay_buttons a[href], a.download_link[href]')
    .each((_, element) => {
      const raw =
        $(element).attr('href')

      const url =
        decodeSsstikUrl(raw)

      if (!url) {
        return
      }

      links.push({
        url,
        text:
          cleanText(
            $(element).text(),
            180
          ).toLowerCase()
      })
    })

  // Fallback kalau class SSSTik berubah tetapi href media
  // masih dikembalikan di HTML hasil.
  if (!links.length) {
    $('a[href]').each((_, element) => {
      const raw =
        $(element).attr('href')

      const url =
        decodeSsstikUrl(raw)

      if (!url) {
        return
      }

      const text =
        cleanText(
          $(element).text(),
          180
        ).toLowerCase()

      if (
        text.includes('download') ||
        text.includes('unduh') ||
        text.includes('mp4') ||
        text.includes('mp3') ||
        text.includes('watermark') ||
        text.includes('hd')
      ) {
        links.push({
          url,
          text
        })
      }
    })
  }

  const videos =
    links.filter(item =>
      !/mp3|music|audio|sound/.test(
        item.text
      )
    )

  const preferred =
    videos.find(item =>
      /without watermark|no watermark|tanpa watermark|hd/.test(
        item.text
      )
    ) ||
    videos[0] ||
    null

  const slides = []

  $('.slide[href]').each(
    (_, element) => {
      const url =
        decodeSsstikUrl(
          $(element).attr('href')
        )

      if (url) {
        slides.push(url)
      }
    }
  )

  return {
    videoUrl:
      preferred?.url || null,
    title,
    author,
    thumbnail,
    slides
  }
}

async function fetchTikTok(url) {
  const controller =
    new AbortController()

  const timeout =
    setTimeout(
      () => controller.abort(),
      30_000
    )

  const userAgent =
    'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'

  try {
    const home =
      await fetch(
        SSSTIK_HOME,
        {
          redirect: 'follow',
          headers: {
            'User-Agent': userAgent,
            Accept:
              'text/html,application/xhtml+xml'
          },
          signal:
            controller.signal
        }
      )

    if (!home.ok) {
      throw new Error(
        `SSSTIK_HOME_HTTP_${home.status}`
      )
    }

    const homeHtml =
      await home.text()

    const token =
      extractSsstikToken(
        homeHtml
      )

    if (!token) {
      throw new Error(
        'SSSTIK_TOKEN_NOT_FOUND'
      )
    }

    const cookies =
      cookieHeader(home)

    const form =
      new URLSearchParams({
        id: url,
        locale: 'id',
        tt: token
      })

    const response =
      await fetch(
        SSSTIK_DOWNLOAD,
        {
          method: 'POST',
          redirect: 'follow',
          headers: {
            'User-Agent': userAgent,
            Accept: 'text/html,*/*',
            'Content-Type':
              'application/x-www-form-urlencoded;charset=UTF-8',
            'HX-Current-URL':
              SSSTIK_HOME,
            'HX-Request': 'true',
            'HX-Target': 'target',
            'HX-Trigger':
              '_gcaptcha_pt',
            Origin:
              'https://ssstik.io',
            Referer:
              SSSTIK_HOME,
            ...(cookies
              ? { Cookie: cookies }
              : {})
          },
          body:
            form.toString(),
          signal:
            controller.signal
        }
      )

    if (!response.ok) {
      throw new Error(
        `SSSTIK_HTTP_${response.status}`
      )
    }

    const html =
      await response.text()

    const parsed =
      parseSsstikResult(html)

    if (!parsed.videoUrl) {
      console.error(
        '[TIKTOK] SSSTik HTML tidak berisi video:',
        html.slice(0, 5000)
      )

      throw new Error(
        parsed.slides.length
          ? 'TIKTOK_SLIDESHOW'
          : 'VIDEO_URL_NOT_FOUND'
      )
    }

    return {
      raw: html,
      videoUrl:
        parsed.videoUrl,
      author:
        parsed.author,
      description:
        parsed.title,
      thumbnail:
        parsed.thumbnail,
      views: null,
      likes: null
    }
  } catch (error) {
    if (
      error?.name ===
      'AbortError'
    ) {
      throw new Error(
        'SSSTIK_TIMEOUT'
      )
    }

    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function downloadVideo(url) {
  const controller =
    new AbortController()

  const timeout =
    setTimeout(
      () => controller.abort(),
      60_000
    )

  try {
    const response =
      await fetch(
        url,
        {
          redirect: 'follow',

          headers: {
            'User-Agent':
              'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'
          },

          signal:
            controller.signal
        }
      )

    if (!response.ok) {
      throw new Error(
        `MEDIA_HTTP_${response.status}`
      )
    }

    const declared =
      Number(
        response.headers.get(
          'content-length'
        )
      )

    if (
      Number.isFinite(declared) &&
      declared >
        MAX_VIDEO_BYTES
    ) {
      throw new Error(
        'VIDEO_TOO_LARGE'
      )
    }

    const buffer =
      Buffer.from(
        await response.arrayBuffer()
      )

    if (!buffer.length) {
      throw new Error(
        'EMPTY_VIDEO'
      )
    }

    if (
      buffer.length >
      MAX_VIDEO_BYTES
    ) {
      throw new Error(
        'VIDEO_TOO_LARGE'
      )
    }

    return buffer
  } catch (error) {
    if (
      error?.name ===
      'AbortError'
    ) {
      throw new Error(
        'MEDIA_TIMEOUT'
      )
    }

    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function makeCaption(result) {
  const lines = [
    '✦ *NEXA • TIKTOK*'
  ]

  if (result.author) {
    lines.push(
      `👤 @${result.author}`
    )
  }

  const stats = []

  if (
    result.views !== null
  ) {
    stats.push(
      `👁 ${compactNumber(result.views)}`
    )
  }

  if (
    result.likes !== null
  ) {
    stats.push(
      `♥ ${compactNumber(result.likes)}`
    )
  }

  if (stats.length) {
    lines.push(
      stats.join('   ·   ')
    )
  }

  if (result.description) {
    lines.push(
      '',
      `📝 ${result.description}`
    )
  }

  return lines.join('\n')
}

export default {
  name:
    'tiktok',

  aliases: [
    'tt',
    'ttdl'
  ],

  category:
    'DOWNLOADER',

  description:
    'Download video TikTok',

  usage:
    '.tiktok <url>',

  async run({
    sock,
    msg,
    jid,
    args,
    config
  }) {
    const url =
      args[0]

    if (
      !url ||
      !isTikTokUrl(url)
    ) {
      await sock.sendMessage(
        jid,
        {
          text:
            `✦ *NEXA • TIKTOK*\n\n` +
            `Kirim link TikTok yang valid.\n` +
            `Contoh:\n` +
            `${config.prefix}tiktok https://vt.tiktok.com/...`
        },
        {
          quoted: msg
        }
      )

      return
    }

    try {
      await sock.sendMessage(
        jid,
        {
          text:
            '✦ *NEXA • TIKTOK*\n\n' +
            '⏳ Video sedang disiapkan...\n' +
            'NEXA sedang mengunduh video TikTok. Mohon tunggu sebentar.'
        },
        {
          quoted: msg
        }
      )

      const result =
        await fetchTikTok(
          url
        )

      const video =
        await downloadVideo(
          result.videoUrl
        )

      await sock.sendMessage(
        jid,
        {
          video,

          mimetype:
            'video/mp4',

          caption:
            makeCaption(
              result
            )
        },
        {
          quoted: msg,

          mediaUploadTimeoutMs:
            60_000
        }
      )

      console.log(
        '✅ TikTok via SSSTik:',
        result.author ||
        'unknown'
      )
    } catch (error) {
      console.error(
        '[TIKTOK]',
        error
      )

      let text =
        '⚠️ *NEXA • TIKTOK*\n\n' +
        'Video belum berhasil diunduh. Coba lagi beberapa saat nanti.'

      if (
        error?.message ===
        'VIDEO_TOO_LARGE'
      ) {
        text =
          '⚠️ *NEXA • TIKTOK*\n\n' +
          'Video terlalu besar untuk dikirim oleh NEXA.'
      } else if (
        error?.message ===
        'SSSTIK_TIMEOUT' ||
        error?.message ===
        'MEDIA_TIMEOUT'
      ) {
        text =
          '⚠️ *NEXA • TIKTOK*\n\n' +
          'SSSTik terlalu lama merespons. Coba lagi sebentar.'
      }

      await sock.sendMessage(
        jid,
        {
          text
        },
        {
          quoted: msg
        }
      )
    }
  }
}
