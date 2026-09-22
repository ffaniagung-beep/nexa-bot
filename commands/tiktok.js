import * as cheerio from 'cheerio'

const MDOWN_ORIGIN =
  'https://musicaldown.com'

const MDOWN_HOME_CANDIDATES = [
  'https://musicaldown.com/id',
  'https://musicaldown.com/en',
  'https://musicaldown.com/'
]

const MDOWN_DOWNLOAD =
  'https://musicaldown.com/download'

const MAX_VIDEO_BYTES =
  50 * 1024 * 1024

const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'

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

function httpUrl(value) {
  return (
    typeof value === 'string' &&
    /^https?:\/\//i.test(value)
  )
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

function cookiesFromResponse(response) {
  const values = []

  if (
    typeof response?.headers?.getSetCookie ===
    'function'
  ) {
    values.push(
      ...response.headers.getSetCookie()
    )
  } else {
    const raw =
      response?.headers?.get?.(
        'set-cookie'
      )

    if (raw) {
      values.push(raw)
    }
  }

  return values
    .map(value =>
      String(value).split(';')[0]
    )
    .filter(Boolean)
    .join('; ')
}

function mergeCookies(...headers) {
  const jar = new Map()

  for (const header of headers) {
    for (
      const part
      of String(header || '').split(';')
    ) {
      const trimmed = part.trim()
      const index = trimmed.indexOf('=')

      if (index <= 0) {
        continue
      }

      const name =
        trimmed.slice(0, index).trim()

      const value =
        trimmed.slice(index + 1).trim()

      if (name) {
        jar.set(name, value)
      }
    }
  }

  return [...jar.entries()]
    .map(([name, value]) =>
      `${name}=${value}`
    )
    .join('; ')
}

function browserHeaders({
  referer,
  cookie,
  form = false
} = {}) {
  return {
    'User-Agent': USER_AGENT,
    Accept:
      form
        ? 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language':
      'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site':
      referer
        ? 'same-origin'
        : 'none',
    ...(referer
      ? { Referer: referer }
      : {}),
    ...(cookie
      ? { Cookie: cookie }
      : {}),
    ...(form
      ? {
          Origin: MDOWN_ORIGIN,
          'Content-Type':
            'application/x-www-form-urlencoded;charset=UTF-8'
        }
      : {})
  }
}

function buildMdownForm(html, tiktokUrl) {
  const $ = cheerio.load(
    String(html || '')
  )

  const data = new URLSearchParams()
  let linkField = null

  $('input[name]').each((_, element) => {
    const input = $(element)
    const name = cleanText(
      input.attr('name'),
      200
    )

    if (!name) {
      return
    }

    const type =
      cleanText(
        input.attr('type') || 'text',
        30
      ).toLowerCase()

    const id =
      cleanText(
        input.attr('id'),
        100
      ).toLowerCase()

    const placeholder =
      cleanText(
        input.attr('placeholder'),
        160
      ).toLowerCase()

    if (
      id === 'link_url' ||
      name.toLowerCase().includes('url') ||
      (
        type === 'text' &&
        (
          placeholder.includes('tiktok') ||
          placeholder.includes('tautan') ||
          placeholder.includes('link')
        )
      )
    ) {
      linkField = name
      data.set(name, tiktokUrl)
      return
    }

    if (
      type === 'submit' ||
      type === 'button' ||
      type === 'reset' ||
      input.is('[disabled]')
    ) {
      return
    }

    data.set(
      name,
      input.attr('value') || ''
    )
  })

  if (!linkField) {
    const textInput =
      $('input[type="text"][name], input:not([type])[name]')
        .first()

    const name =
      cleanText(
        textInput.attr('name'),
        200
      )

    if (name) {
      linkField = name
      data.set(name, tiktokUrl)
    }
  }

  if (!linkField) {
    throw new Error(
      'MDOWN_FORM_CHANGED'
    )
  }

  return data
}

function normalizeHref(value, base) {
  if (!value) {
    return null
  }

  try {
    const url =
      new URL(value, base)

    if (
      !['http:', 'https:']
        .includes(url.protocol)
    ) {
      return null
    }

    return url.href
  } catch {
    return null
  }
}

function parseMdownResult(html, baseUrl) {
  const $ = cheerio.load(
    String(html || '')
  )

  const links = []

  $('a[href]').each((_, element) => {
    const anchor = $(element)
    const url =
      normalizeHref(
        anchor.attr('href'),
        baseUrl
      )

    if (!url) {
      return
    }

    const text =
      cleanText(
        anchor.text(),
        220
      ).toLowerCase()

    const target =
      cleanText(
        anchor.attr('target'),
        30
      ).toLowerCase()

    const style =
      cleanText(
        anchor.attr('style'),
        200
      ).toLowerCase()

    const className =
      cleanText(
        anchor.attr('class'),
        200
      ).toLowerCase()

    let score = 0

    if (target === '_blank') {
      score += 5
    }

    if (style.includes('margin-top')) {
      score += 4
    }

    if (
      className.includes('download') ||
      className.includes('btn')
    ) {
      score += 3
    }

    if (/\bhd\b|high quality|high-quality/.test(text)) {
      score += 12
    }

    if (
      /without watermark|no watermark|tanpa watermark/.test(
        text
      )
    ) {
      score += 10
    }

    if (/mp4|video/.test(text)) {
      score += 8
    }

    if (/download|unduh/.test(text)) {
      score += 4
    }

    if (/mp3|audio|music|sound/.test(text)) {
      score -= 100
    }

    if (
      /watermark/.test(text) &&
      !/without watermark|no watermark|tanpa watermark/.test(
        text
      )
    ) {
      score -= 20
    }

    try {
      const host =
        new URL(url).hostname
          .toLowerCase()

      if (
        host !== 'musicaldown.com' &&
        !host.endsWith('.musicaldown.com')
      ) {
        score += 3
      }
    } catch {}

    links.push({
      url,
      text,
      score
    })
  })

  const candidates =
    links
      .filter(item =>
        item.score > -50
      )
      .sort((a, b) =>
        b.score - a.score
      )

  const preferred =
    candidates.find(item =>
      item.score >= 8
    ) ||
    candidates.find(item => {
      try {
        const parsed = new URL(item.url)
        return (
          parsed.hostname !== 'musicaldown.com' &&
          !parsed.hostname.endsWith('.musicaldown.com')
        )
      } catch {
        return false
      }
    }) ||
    null

  let title = ''

  const titleSelectors = [
    '.video-desc',
    '.video-info h2',
    '.video-info h3',
    '.caption',
    '.description'
  ]

  for (const selector of titleSelectors) {
    const value =
      cleanText(
        $(selector).first().text()
      )

    if (value) {
      title = value
      break
    }
  }

  let author = ''

  const bodyText =
    cleanText(
      $('body').text(),
      6000
    )

  const authorMatch =
    bodyText.match(
      /@([A-Za-z0-9._]{2,40})/
    )

  if (authorMatch?.[1]) {
    author =
      cleanUser(authorMatch[1])
  }

  let thumbnail = null

  $('img[src]').each((_, element) => {
    if (thumbnail) {
      return
    }

    const image = $(element)
    const src =
      normalizeHref(
        image.attr('src'),
        baseUrl
      )

    if (!src) {
      return
    }

    const context =
      `${image.attr('alt') || ''} ${image.attr('class') || ''}`
        .toLowerCase()

    if (
      !context.includes('logo') &&
      !src.toLowerCase().includes('logo')
    ) {
      thumbnail = src
    }
  })

  return {
    videoUrl:
      preferred?.url || null,
    title,
    author,
    thumbnail,
    links
  }
}

async function tryConvertPage({
  html,
  cookie,
  referer,
  signal
}) {
  if (
    !/Convert Video Now/i.test(html)
  ) {
    return null
  }

  const dataMatch =
    String(html).match(
      /data\s*:\s*['"]([^'"]+)['"]/i
    )

  const urlMatch =
    String(html).match(
      /url\s*:\s*['"]([^'"]+)['"]/i
    )

  if (
    !dataMatch?.[1] ||
    !urlMatch?.[1]
  ) {
    return null
  }

  const endpoint =
    normalizeHref(
      urlMatch[1],
      MDOWN_ORIGIN
    )

  if (!endpoint) {
    return null
  }

  const body =
    new URLSearchParams({
      data: dataMatch[1]
    })

  const response =
    await fetch(
      endpoint,
      {
        method: 'POST',
        redirect: 'follow',
        headers: {
          ...browserHeaders({
            referer,
            cookie,
            form: true
          }),
          Accept:
            'application/json,text/plain,*/*'
        },
        body: body.toString(),
        signal
      }
    )

  if (!response.ok) {
    return null
  }

  const text =
    await response.text()

  try {
    const json = JSON.parse(text)

    if (
      json?.success === true &&
      httpUrl(json?.url)
    ) {
      return json.url
    }
  } catch {
    // response bukan JSON valid
  }

  return null
}

async function fetchTikTok(url) {
  const controller =
    new AbortController()

  const timeout =
    setTimeout(
      () => controller.abort(),
      35_000
    )

  try {
    let homeResponse = null
    let homeHtml = ''
    let homeUrl = ''
    let lastStatus = null

    for (
      const candidateUrl
      of MDOWN_HOME_CANDIDATES
    ) {
      const response =
        await fetch(
          candidateUrl,
          {
            redirect: 'follow',
            headers:
              browserHeaders(),
            signal:
              controller.signal
          }
        )

      lastStatus =
        response.status

      if (!response.ok) {
        continue
      }

      const html =
        await response.text()

      try {
        buildMdownForm(
          html,
          url
        )
      } catch {
        continue
      }

      homeResponse = response
      homeHtml = html
      homeUrl = response.url || candidateUrl
      break
    }

    if (!homeResponse) {
      throw new Error(
        `MDOWN_HOME_HTTP_${lastStatus || 'FAILED'}`
      )
    }

    let cookie =
      cookiesFromResponse(
        homeResponse
      )

    const form =
      buildMdownForm(
        homeHtml,
        url
      )

    const response =
      await fetch(
        MDOWN_DOWNLOAD,
        {
          method: 'POST',
          redirect: 'follow',
          headers:
            browserHeaders({
              referer: homeUrl,
              cookie,
              form: true
            }),
          body: form.toString(),
          signal:
            controller.signal
        }
      )

    cookie =
      mergeCookies(
        cookie,
        cookiesFromResponse(
          response
        )
      )

    if (!response.ok) {
      throw new Error(
        `MDOWN_HTTP_${response.status}`
      )
    }

    const finalUrl =
      response.url ||
      MDOWN_DOWNLOAD

    if (/\/err(?:\/|\?|$)/i.test(finalUrl)) {
      throw new Error(
        'MDOWN_REJECTED'
      )
    }

    const html =
      await response.text()

    const converted =
      await tryConvertPage({
        html,
        cookie,
        referer: finalUrl,
        signal:
          controller.signal
      })

    if (converted) {
      return {
        raw: html,
        videoUrl: converted,
        author: '',
        description: '',
        thumbnail: null,
        views: null,
        likes: null
      }
    }

    const parsed =
      parseMdownResult(
        html,
        finalUrl
      )

    if (!parsed.videoUrl) {
      console.error(
        '[TIKTOK] MusicalDown tidak menemukan link video. finalUrl=',
        finalUrl,
        ' html=',
        html.slice(0, 5000)
      )

      throw new Error(
        'MDOWN_NO_VIDEO'
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
        'MDOWN_TIMEOUT'
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
            'User-Agent': USER_AGENT,
            Referer:
              'https://musicaldown.com/'
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

    const type =
      String(
        response.headers.get(
          'content-type'
        ) || ''
      ).toLowerCase()

    if (
      type.includes('text/html') ||
      type.includes('application/json')
    ) {
      throw new Error(
        'MEDIA_NOT_VIDEO'
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
        '✅ TikTok via MusicalDown:',
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
          'MDOWN_TIMEOUT' ||
        error?.message ===
          'MEDIA_TIMEOUT'
      ) {
        text =
          '⚠️ *NEXA • TIKTOK*\n\n' +
          'MusicalDown terlalu lama merespons. Coba lagi sebentar.'
      } else if (
        /^MDOWN_HOME_HTTP_/.test(
          error?.message || ''
        )
      ) {
        text =
          '⚠️ *NEXA • TIKTOK*\n\n' +
          'MusicalDown menolak koneksi dari server NEXA saat ini.'
      } else if (
        error?.message ===
          'MDOWN_FORM_CHANGED' ||
        error?.message ===
          'MDOWN_NO_VIDEO'
      ) {
        text =
          '⚠️ *NEXA • TIKTOK*\n\n' +
          'Format halaman MusicalDown sedang berubah. Coba lagi nanti.'
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
