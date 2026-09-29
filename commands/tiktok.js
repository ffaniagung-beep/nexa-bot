// NEXA_TIKTOK_SMART_V3
// Video: Button Video/HD/MP3 • Slide: native WhatsApp album
import {
  AIRich,
  Button
} from '@rexxhayanasi/elaina-baileys'

import {
  randomBytes
} from 'node:crypto'

import {
  getProfileJid
} from '../lib/profile.js'

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

const MAX_SLIDE_IMAGES =
  35

const SLIDE_BATCH_SIZE =
  10

const MAX_SLIDE_IMAGE_BYTES =
  15 * 1024 * 1024

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

function humanBytes(value) {
  const size =
    Number(value)

  if (
    !Number.isFinite(size) ||
    size < 0
  ) {
    return '-'
  }

  if (size < 1024) {
    return `${Math.round(size)} B`
  }

  const units = [
    'KB',
    'MB',
    'GB'
  ]

  let current = size
  let unit = 'B'

  for (const next of units) {
    current /= 1024
    unit = next

    if (
      current < 1024 ||
      next === units.at(-1)
    ) {
      break
    }
  }

  const digits =
    current >= 100
      ? 0
      : current >= 10
        ? 1
        : 2

  return `${current.toFixed(digits)} ${unit}`
}

function progressBar(percent) {
  const safe =
    Math.max(
      0,
      Math.min(
        100,
        Number(percent) || 0
      )
    )

  const filled =
    Math.round(
      safe / 10
    )

  return (
    '█'.repeat(filled) +
    '░'.repeat(10 - filled)
  )
}

async function startTikTokRichStatus({
  sock,
  msg,
  jid,
  label
}) {
  try {
    const rich =
      new AIRich(sock)
        .setTitle(
          '✦ NEXA • TIKTOK'
        )
        .setFooter(
          'NEXA Downloader • AIRich'
        )
        .addText(
          `⏳ Menyiapkan *${label}*...`,
          {
            id:
              'status'
          }
        )

    // Button replies are not always safe to reuse as AIRich quote context.
    // Send the rich status standalone so Elaina can own/edit the message.
    await rich.send(jid)

    return {
      mode: 'airich',
      rich
    }
  } catch (error) {
    console.warn(
      '[TIKTOK] AIRich start fallback:',
      error?.message ||
      error
    )

    try {
      const sent =
        await sock.sendMessage(
          jid,
          {
            text:
              `✦ *NEXA • TIKTOK*\n\n` +
              `⏳ Menyiapkan *${label}*...`
          },
          {
            quoted: msg
          }
        )

      if (sent?.key) {
        return {
          mode: 'native',
          sock,
          jid,
          key: sent.key
        }
      }
    } catch (fallbackError) {
      console.warn(
        '[TIKTOK] native progress start failed:',
        fallbackError?.message ||
        fallbackError
      )
    }

    return null
  }
}

async function updateTikTokRichStatus(
  status,
  text
) {
  if (!status) {
    return false
  }

  if (status.mode === 'native') {
    try {
      await status.sock.sendMessage(
        status.jid,
        {
          text:
            `✦ *NEXA • TIKTOK*\n\n${text}`,
          edit:
            status.key
        }
      )

      return true
    } catch (error) {
      console.warn(
        '[TIKTOK] native progress edit failed:',
        error?.message ||
        error
      )
      return false
    }
  }

  const rich =
    status.rich || status

  try {
    rich.addText(
      text,
      {
        replace:
          'status'
      }
    )

    await rich.sendEdit()
    return true
  } catch (error) {
    console.warn(
      '[TIKTOK] AIRich edit fallback:',
      error?.message ||
      error
    )

    return false
  }
}

function createTikTokProgressUpdater({
  rich,
  label
}) {
  let lastPercent = -5
  let lastAt = 0
  let active = Boolean(rich)
  let queue = Promise.resolve()

  const report = state => {
    if (!active) {
      return
    }

    const now = Date.now()
    const percent =
      Number.isFinite(
        Number(state?.percent)
      )
        ? Number(state.percent)
        : null

    let text = ''

    if (percent !== null) {
      const bucket =
        percent >= 100
          ? 100
          : Math.floor(
              percent / 5
            ) * 5

      if (
        bucket < 100 &&
        (
          (
            bucket <= lastPercent &&
            now - lastAt < 2000
          ) ||
          (
            bucket < lastPercent + 20 &&
            now - lastAt < 1000
          )
        )
      ) {
        return
      }

      lastPercent =
        Math.max(
          lastPercent,
          bucket
        )
      lastAt = now

      text =
        `⬇️ Mengunduh *${label}*...\n\n` +
        `${progressBar(bucket)} *${bucket}%*\n` +
        `${humanBytes(state.downloadedBytes)} / ${humanBytes(state.totalBytes)}`
    } else {
      if (
        now - lastAt < 2500
      ) {
        return
      }

      lastAt = now
      text =
        `⬇️ Mengunduh *${label}*...\n\n` +
        `📦 ${humanBytes(state.downloadedBytes)} terunduh`
    }

    queue =
      queue.then(
        async () => {
          const ok =
            await updateTikTokRichStatus(
              rich,
              text
            )

          if (!ok) {
            active = false
          }
        }
      )
  }

  report.flush =
    async () => {
      try {
        await queue
      } catch {}
    }

  return report
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

function tiktokPageHeaders() {
  return {
    'User-Agent':
      USER_AGENT,
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language':
      'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control':
      'no-cache',
    Pragma:
      'no-cache',
    'Upgrade-Insecure-Requests':
      '1'
  }
}

function findTikTokItemStruct(
  value,
  depth = 0
) {
  if (
    !value ||
    depth > 12
  ) {
    return null
  }

  if (
    typeof value !==
    'object'
  ) {
    return null
  }

  if (
    (
      value.imagePost ||
      value.video
    ) &&
    value.author &&
    value.stats
  ) {
    return value
  }

  const children =
    Array.isArray(value)
      ? value
      : Object.values(value)

  for (
    const child
    of children
  ) {
    const found =
      findTikTokItemStruct(
        child,
        depth + 1
      )

    if (found) {
      return found
    }
  }

  return null
}

function parseTikTokPageItem(
  html
) {
  const $ =
    cheerio.load(
      String(html || '')
    )

  const selectors = [
    'script#__UNIVERSAL_DATA_FOR_REHYDRATION__',
    'script#SIGI_STATE',
    'script#sigi-persisted-data'
  ]

  for (
    const selector
    of selectors
  ) {
    const raw =
      $(selector)
        .first()
        .html()

    if (!raw) {
      continue
    }

    try {
      const json =
        JSON.parse(raw)

      const direct =
        json
          ?.__DEFAULT_SCOPE__
          ?.[
            'webapp.video-detail'
          ]
          ?.itemInfo
          ?.itemStruct

      if (direct) {
        return direct
      }

      const found =
        findTikTokItemStruct(
          json
        )

      if (found) {
        return found
      }
    } catch {
      // lanjut selector berikutnya
    }
  }

  return null
}

function normalizeUrlList(
  value
) {
  const list =
    Array.isArray(value)
      ? value
      : []

  const unique =
    new Set()

  const result = []

  for (
    const item
    of list
  ) {
    if (!httpUrl(item)) {
      continue
    }

    const lower =
      String(item)
        .toLowerCase()

    if (
      lower.includes(
        '.heic'
      )
    ) {
      continue
    }

    if (
      unique.has(item)
    ) {
      continue
    }

    unique.add(item)
    result.push(item)
  }

  return result
}

function extractSlideImages(
  item
) {
  const raw =
    Array.isArray(
      item
        ?.imagePost
        ?.images
    )
      ? item.imagePost.images
      : []

  return raw
    .map(
      (
        image,
        index
      ) => {
        const candidates = [
          ...normalizeUrlList(
            image
              ?.imageURL
              ?.urlList
          ),
          ...normalizeUrlList(
            image
              ?.displayImage
              ?.urlList
          ),
          ...normalizeUrlList(
            image
              ?.ownerWatermarkImage
              ?.urlList
          )
        ]

        const urls =
          [
            ...new Set(
              candidates
            )
          ]

        return {
          index,
          urls
        }
      }
    )
    .filter(
      image =>
        image.urls.length
    )
    .slice(
      0,
      MAX_SLIDE_IMAGES
    )
}

async function fetchTikTokPageInfo(
  url
) {
  const controller =
    new AbortController()

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      20_000
    )

  try {
    const response =
      await fetch(
        url,
        {
          redirect:
            'follow',
          headers:
            tiktokPageHeaders(),
          signal:
            controller.signal
        }
      )

    const finalUrl =
      response.url ||
      url

    const isPhotoPath =
      /\/photo\//i.test(
        finalUrl
      )

    if (!response.ok) {
      return {
        type:
          isPhotoPath
            ? 'slide-unresolved'
            : 'unknown',
        finalUrl,
        isPhotoPath
      }
    }

    const html =
      await response.text()

    const item =
      parseTikTokPageItem(
        html
      )

    if (!item) {
      return {
        type:
          isPhotoPath
            ? 'slide-unresolved'
            : 'unknown',
        finalUrl,
        isPhotoPath
      }
    }

    const images =
      extractSlideImages(
        item
      )

    const author =
      cleanUser(
        item
          ?.author
          ?.uniqueId ||
        item
          ?.author
          ?.nickname ||
        ''
      )

    const description =
      cleanText(
        item?.desc ||
        item
          ?.imagePost
          ?.title ||
        '',
        650
      )

    const stats =
      item?.stats ||
      {}

    const common = {
      finalUrl,
      author,
      description,
      views:
        Number.isFinite(
          Number(
            stats.playCount
          )
        )
          ? Number(
              stats.playCount
            )
          : null,
      likes:
        Number.isFinite(
          Number(
            stats.diggCount
          )
        )
          ? Number(
              stats.diggCount
            )
          : null,
      comments:
        Number.isFinite(
          Number(
            stats.commentCount
          )
        )
          ? Number(
              stats.commentCount
            )
          : null
    }

    if (images.length) {
      return {
        type:
          'slide',
        ...common,
        images,
        musicUrl:
          httpUrl(
            item
              ?.music
              ?.playUrl
          )
            ? item.music.playUrl
            : null
      }
    }

    return {
      type:
        'video',
      ...common
    }
  } catch (
    error
  ) {
    if (
      error?.name ===
      'AbortError'
    ) {
      return {
        type:
          'unknown',
        finalUrl:
          url,
        isPhotoPath:
          /\/photo\//i.test(
            url
          ),
        timedOut:
          true
      }
    }

    console.warn(
      '[TIKTOK] Direct page metadata fallback:',
      error?.message ||
      error
    )

    return {
      type:
        'unknown',
      finalUrl:
        url,
      isPhotoPath:
        /\/photo\//i.test(
          url
        )
    }
  } finally {
    clearTimeout(
      timeout
    )
  }
}

async function downloadSlideImage(
  image
) {
  let lastError =
    null

  for (
    const url
    of image.urls
  ) {
    const controller =
      new AbortController()

    const timeout =
      setTimeout(
        () =>
          controller.abort(),
        35_000
      )

    try {
      const response =
        await fetch(
          url,
          {
            redirect:
              'follow',
            headers: {
              'User-Agent':
                USER_AGENT,
              Accept:
                'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
              Referer:
                'https://www.tiktok.com/'
            },
            signal:
              controller.signal
          }
        )

      if (!response.ok) {
        lastError =
          new Error(
            `SLIDE_IMAGE_HTTP_${response.status}`
          )
        continue
      }

      const type =
        String(
          response.headers.get(
            'content-type'
          ) ||
          ''
        )
          .toLowerCase()

      if (
        type &&
        !type.startsWith(
          'image/'
        ) &&
        !type.includes(
          'octet-stream'
        )
      ) {
        lastError =
          new Error(
            'SLIDE_IMAGE_BAD_TYPE'
          )
        continue
      }

      const declared =
        Number(
          response.headers.get(
            'content-length'
          )
        )

      if (
        Number.isFinite(
          declared
        ) &&
        declared >
          MAX_SLIDE_IMAGE_BYTES
      ) {
        lastError =
          new Error(
            'SLIDE_IMAGE_TOO_LARGE'
          )
        continue
      }

      const buffer =
        Buffer.from(
          await response.arrayBuffer()
        )

      if (
        !buffer.length
      ) {
        lastError =
          new Error(
            'SLIDE_IMAGE_EMPTY'
          )
        continue
      }

      if (
        buffer.length >
        MAX_SLIDE_IMAGE_BYTES
      ) {
        lastError =
          new Error(
            'SLIDE_IMAGE_TOO_LARGE'
          )
        continue
      }

      return {
        buffer,
        contentType:
          type ||
          'image/jpeg'
      }
    } catch (
      error
    ) {
      lastError =
        error
    } finally {
      clearTimeout(
        timeout
      )
    }
  }

  throw (
    lastError ||
    new Error(
      'SLIDE_IMAGE_FAILED'
    )
  )
}

function makeSlideCaption(
  info
) {
  const lines = [
    '✦ *NEXA • TIKTOK SLIDE*'
  ]

  if (info.author) {
    lines.push(
      `👤 @${info.author}`
    )
  }

  const stats = []

  if (
    info.likes !== null
  ) {
    stats.push(
      `♥ ${compactNumber(info.likes)}`
    )
  }

  if (
    info.comments !== null
  ) {
    stats.push(
      `💬 ${compactNumber(info.comments)}`
    )
  }

  if (stats.length) {
    lines.push(
      stats.join(
        '  •  '
      )
    )
  }

  if (
    info.description
  ) {
    lines.push(
      '',
      `📝 ${info.description}`
    )
  }

  return lines.join(
    '\n'
  )
}

async function sendTikTokSlide({
  sock,
  msg,
  jid,
  info
}) {
  await sock.sendMessage(
    jid,
    {
      text:
        `✦ *NEXA • TIKTOK DOWNLOADER*\n\n` +
        `🖼️ Terdeteksi: *Slide Foto*\n` +
        `📸 ${info.images.length} foto ditemukan.\n\n` +
        `⬇️ NEXA otomatis menyiapkan album WhatsApp...`
    },
    {
      quoted:
        msg
    }
  )

  const media = []
  let failed = 0

  for (
    const image
    of info.images
  ) {
    try {
      media.push(
        await downloadSlideImage(
          image
        )
      )
    } catch (
      error
    ) {
      failed += 1

      console.warn(
        '[TIKTOK] Slide image skipped:',
        image.index,
        error?.message ||
        error
      )
    }
  }

  if (!media.length) {
    throw new Error(
      'TIKTOK_SLIDE_DOWNLOAD_FAILED'
    )
  }

  const caption =
    makeSlideCaption(
      info
    )

  for (
    let start = 0;
    start < media.length;
    start +=
      SLIDE_BATCH_SIZE
  ) {
    const batch =
      media.slice(
        start,
        start +
          SLIDE_BATCH_SIZE
      )

    if (
      batch.length ===
      1
    ) {
      await sock.sendMessage(
        jid,
        {
          image:
            batch[0].buffer,
          caption:
            start === 0
              ? caption
              : undefined
        },
        {
          quoted:
            start === 0
              ? msg
              : undefined,
          mediaUploadTimeoutMs:
            120_000
        }
      )
      continue
    }

    // WHISKEY_ALBUM_FIX_V1
    // Socket utama NEXA memakai @whiskeysockets/baileys.
    // Buat parent album dulu, lalu kaitkan setiap foto
    // memakai albumParentKey supaya benar-benar tampil
    // sebagai native WhatsApp album/box.
    const albumParent =
      await sock.sendMessage(
        jid,
        {
          album: {
            expectedImageCount:
              batch.length,
            expectedVideoCount:
              0
          }
        },
        {
          quoted:
            start === 0
              ? msg
              : undefined
        }
      )

    if (
      !albumParent?.key
    ) {
      throw new Error(
        'TIKTOK_ALBUM_PARENT_FAILED'
      )
    }

    for (
      let index = 0;
      index < batch.length;
      index++
    ) {
      await sock.sendMessage(
        jid,
        {
          image:
            batch[index].buffer,
          albumParentKey:
            albumParent.key,
          ...(
            start === 0 &&
            index === 0
              ? {
                  caption
                }
              : {}
          )
        },
        {
          mediaUploadTimeoutMs:
            120_000
        }
      )
    }
  }

  if (failed) {
    await sock.sendMessage(
      jid,
      {
        text:
          `⚠️ ${failed} foto gagal diambil dari CDN TikTok, ` +
          `${media.length} foto lainnya berhasil dikirim.`
      },
      {
        quoted:
          msg
      }
    )
  }

  console.log(
    '✅ TikTok slide:',
    media.length,
    'foto',
    info.author ||
    'unknown'
  )
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

const TIKTOK_SESSION_TTL =
  10 * 60 * 1000

const tiktokSessions =
  new Map()

const tiktokDownloadLocks =
  new Set()

function tiktokOwnerKey(
  msg,
  jid
) {
  return String(
    getProfileJid(
      msg,
      jid
    ) ||
    msg?.key?.participantAlt ||
    msg?.key?.participant ||
    jid ||
    ''
  )
    .trim()
    .toLowerCase()
}

function cleanupTikTokSessions() {
  const now =
    Date.now()

  for (
    const [id, session]
    of tiktokSessions
  ) {
    if (
      now - session.createdAt >
        TIKTOK_SESSION_TTL
    ) {
      tiktokSessions.delete(id)
    }
  }
}

function makeTikTokSession({
  owner,
  result,
  prefix
}) {
  cleanupTikTokSessions()

  let id

  do {
    id =
      randomBytes(5)
        .toString('hex')
  } while (
    tiktokSessions.has(id)
  )

  const session = {
    id,
    owner,
    result,
    downloads:
      result.downloads,
    prefix,
    createdAt:
      Date.now()
  }

  tiktokSessions.set(
    id,
    session
  )

  return session
}

function getTikTokSession({
  id,
  owner
}) {
  cleanupTikTokSessions()

  const session =
    tiktokSessions.get(
      String(id || '')
    )

  if (
    !session ||
    session.owner !== owner
  ) {
    return null
  }

  return session
}

function looksAudio(
  item
) {
  const text =
    String(item?.text || '')
      .toLowerCase()

  const url =
    String(item?.url || '')
      .toLowerCase()

  return (
    /mp3|audio|music|sound/.test(
      text
    ) ||
    /\.mp3(?:$|[?#])/.test(
      url
    )
  )
}

function looksHd(
  item
) {
  const text =
    String(item?.text || '')
      .toLowerCase()

  return (
    /\bhd\b|hd\+|full[ -]?hd|high[ -]?quality|1080p|720p/.test(
      text
    )
  )
}

function looksVideo(
  item
) {
  const text =
    String(item?.text || '')
      .toLowerCase()

  const url =
    String(item?.url || '')
      .toLowerCase()

  return (
    /mp4|video|without watermark|no watermark|tanpa watermark/.test(
      text
    ) ||
    /\.(?:mp4|m4v|mov)(?:$|[?#])/.test(
      url
    )
  )
}

function uniqueLinks(
  links
) {
  const seen =
    new Set()

  return (
    Array.isArray(links)
      ? links
      : []
  ).filter(item => {
    if (
      !item?.url ||
      seen.has(item.url)
    ) {
      return false
    }

    seen.add(item.url)
    return true
  })
}

function bestLink(
  items
) {
  return [...items]
    .sort((a, b) =>
      Number(b?.score || 0) -
      Number(a?.score || 0)
    )[0] || null
}

function selectTikTokDownloads(
  links,
  fallbackVideoUrl = null
) {
  const items =
    uniqueLinks(links)
      .filter(item =>
        httpUrl(item?.url)
      )

  const audio =
    bestLink(
      items.filter(
        looksAudio
      )
    )

  const videoItems =
    items.filter(item =>
      !looksAudio(item)
    )

  const hd =
    bestLink(
      videoItems.filter(
        looksHd
      )
    )

  let normal =
    bestLink(
      videoItems.filter(item =>
        !looksHd(item) &&
        looksVideo(item)
      )
    )

  if (!normal) {
    normal =
      bestLink(
        videoItems.filter(item =>
          item?.url !== hd?.url &&
          Number(item?.score || 0) >= 8
        )
      )
  }

  if (
    !normal &&
    httpUrl(fallbackVideoUrl) &&
    fallbackVideoUrl !== hd?.url
  ) {
    normal = {
      url:
        fallbackVideoUrl,
      text:
        'video',
      score:
        1
    }
  }

  if (
    !hd &&
    !normal &&
    httpUrl(fallbackVideoUrl)
  ) {
    normal = {
      url:
        fallbackVideoUrl,
      text:
        'video',
      score:
        1
    }
  }

  // Keep both video actions usable even when the provider exposes
  // only one direct MP4 source. "Video" controls delivery inline,
  // while "HD" keeps the original file as a document. When a real
  // HD source exists, it is still preferred for the HD action.
  let normalFallback = false
  let hdFallback = false

  if (!normal && hd) {
    normal = hd
    normalFallback = true
  }

  if (!hd && normal) {
    hd = normal
    hdFallback = true
  }

  return {
    normal:
      normal
        ? {
            url:
              normal.url,
            label:
              normal.text ||
              'video',
            fallback:
              normalFallback
          }
        : null,

    hd:
      hd
        ? {
            url:
              hd.url,
            label:
              hd.text ||
              'hd',
            fallback:
              hdFallback
          }
        : null,

    audio:
      audio
        ? {
            url:
              audio.url,
            label:
              audio.text ||
              'mp3'
          }
        : null
  }
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
      homeUrl =
        response.url ||
        candidateUrl
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
          body:
            form.toString(),
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

    if (
      /\/err(?:\/|\?|$)/i.test(
        finalUrl
      )
    ) {
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

    const parsed =
      parseMdownResult(
        html,
        finalUrl
      )

    const downloads =
      selectTikTokDownloads(
        parsed.links,
        converted ||
        parsed.videoUrl
      )

    if (
      !downloads.normal &&
      !downloads.hd &&
      !downloads.audio
    ) {
      console.error(
        '[TIKTOK] MusicalDown tidak menemukan media. finalUrl=',
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
      author:
        parsed.author || '',
      description:
        parsed.title || '',
      thumbnail:
        parsed.thumbnail || null,
      views: null,
      likes: null,
      comments: null,
      downloads
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

async function downloadTikTokMedia(
  url,
  {
    onProgress = null
  } = {}
) {
  const controller =
    new AbortController()

  const timeout =
    setTimeout(
      () => controller.abort(),
      90_000
    )

  try {
    const response =
      await fetch(
        url,
        {
          redirect: 'follow',
          headers: {
            'User-Agent':
              USER_AGENT,
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

    const contentType =
      String(
        response.headers.get(
          'content-type'
        ) || ''
      ).toLowerCase()

    if (
      contentType.includes(
        'text/html'
      ) ||
      contentType.includes(
        'application/json'
      )
    ) {
      throw new Error(
        'MEDIA_NOT_FILE'
      )
    }

    const declared =
      Number(
        response.headers.get(
          'content-length'
        )
      )

    const totalBytes =
      Number.isFinite(declared) &&
      declared > 0
        ? declared
        : 0

    if (
      totalBytes >
      MAX_VIDEO_BYTES
    ) {
      throw new Error(
        'VIDEO_TOO_LARGE'
      )
    }

    const reader =
      response.body?.getReader?.()

    if (!reader) {
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

      try {
        onProgress?.({
          downloadedBytes:
            buffer.length,
          totalBytes:
            totalBytes || buffer.length,
          percent:
            100
        })
      } catch {}

      return {
        buffer,
        contentType,
        size:
          buffer.length
      }
    }

    const chunks = []
    let downloadedBytes = 0

    while (true) {
      const {
        done,
        value
      } =
        await reader.read()

      if (done) {
        break
      }

      if (!value?.byteLength) {
        continue
      }

      downloadedBytes +=
        value.byteLength

      if (
        downloadedBytes >
        MAX_VIDEO_BYTES
      ) {
        try {
          await reader.cancel()
        } catch {}

        throw new Error(
          'VIDEO_TOO_LARGE'
        )
      }

      chunks.push(
        Buffer.from(value)
      )

      const percent =
        totalBytes > 0
          ? Math.min(
              100,
              Math.floor(
                downloadedBytes /
                totalBytes *
                100
              )
            )
          : null

      try {
        onProgress?.({
          downloadedBytes,
          totalBytes,
          percent
        })
      } catch {}
    }

    if (!downloadedBytes) {
      throw new Error(
        'EMPTY_VIDEO'
      )
    }

    const buffer =
      Buffer.concat(
        chunks,
        downloadedBytes
      )

    try {
      onProgress?.({
        downloadedBytes,
        totalBytes:
          totalBytes || downloadedBytes,
        percent:
          100
      })
    } catch {}

    return {
      buffer,
      contentType,
      size:
        downloadedBytes
    }
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

  if (
    result.comments !== null
  ) {
    stats.push(
      `💬 ${compactNumber(result.comments)}`
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

function buttonActionId(
  prefix,
  sessionId,
  action
) {
  return (
    `${prefix}tiktok ` +
    `__download ` +
    `${sessionId} ` +
    `${action}`
  )
}

function makePanelBody(
  result
) {
  const lines = []

  if (result.author) {
    lines.push(
      `👤 @${result.author}`
    )
  } else {
    lines.push(
      '👤 Creator terdeteksi'
    )
  }

  const stats = []

  if (
    result.likes !== null
  ) {
    stats.push(
      `♥ ${compactNumber(result.likes)}`
    )
  }

  if (
    result.comments !== null
  ) {
    stats.push(
      `💬 ${compactNumber(result.comments)}`
    )
  }

  if (stats.length) {
    lines.push(
      stats.join('  •  ')
    )
  }

  lines.push('')

  const hasNormal =
    Boolean(
      result.downloads?.normal
    )

  const hasHd =
    Boolean(
      result.downloads?.hd
    )

  if (
    hasNormal &&
    hasHd &&
    result.downloads?.normal?.url ===
      result.downloads?.hd?.url
  ) {
    lines.push(
      '🎬 *Video tersedia.*',
      'Pilih *Video* untuk kirim inline atau *Video HD* untuk mempertahankan file sumber sebagai dokumen.'
    )
  } else if (
    hasNormal &&
    hasHd
  ) {
    lines.push(
      '✨ *Standard + HD tersedia.*',
      'Rekomendasi: pilih *Video HD* untuk kualitas tertinggi.'
    )
  } else if (hasHd) {
    lines.push(
      '✨ *Kualitas terdeteksi: HD.*',
      'Rekomendasi: pilih *Video HD*.'
    )
  } else if (hasNormal) {
    lines.push(
      '🎬 *Kualitas terdeteksi: Standard.*'
    )
  } else {
    lines.push(
      '🎵 Audio tersedia.'
    )
  }

  if (hasHd) {
    lines.push(
      '',
      '📄 Video HD dikirim sebagai dokumen MP4 agar file aslinya tidak dipaksa menjadi video inline WhatsApp.'
    )
  }

  lines.push(
    '',
    'Pilih format yang ingin diunduh:'
  )

  return lines.join('\n')
}

async function sendTikTokPanel({
  sock,
  msg,
  jid,
  session
}) {
  const result =
    session.result

  let panel =
    new Button(sock)
      .setTitle(
        'NEXA • TIKTOK DOWNLOADER'
      )
      .setBody(
        makePanelBody(
          result
        )
      )
      .setFooter(
        'Pilihan 10 menit • Progress real-time'
      )

  if (
    session.downloads?.normal
  ) {
    panel =
      panel.addReply(
        '🎬 Video',
        buttonActionId(
          session.prefix,
          session.id,
          'normal'
        )
      )
  }

  if (
    session.downloads?.hd
  ) {
    panel =
      panel.addReply(
        '✨ Video HD',
        buttonActionId(
          session.prefix,
          session.id,
          'hd'
        )
      )
  }

  if (
    session.downloads?.audio
  ) {
    panel =
      panel.addReply(
        '🎵 MP3',
        buttonActionId(
          session.prefix,
          session.id,
          'audio'
        )
      )
  }

  try {
    await panel.send(jid)
    return
  } catch (error) {
    console.warn(
      '[TIKTOK] Button fallback:',
      error?.message ||
      error
    )
  }

  const lines = [
    '✦ *NEXA • TIKTOK DOWNLOADER*',
    '',
    makePanelBody(result),
    '',
    'Button tidak tersedia di client ini. Jalankan salah satu command berikut:'
  ]

  if (
    session.downloads?.normal
  ) {
    lines.push(
      `• ${buttonActionId(session.prefix, session.id, 'normal')}`
    )
  }

  if (
    session.downloads?.hd
  ) {
    lines.push(
      `• ${buttonActionId(session.prefix, session.id, 'hd')}`
    )
  }

  if (
    session.downloads?.audio
  ) {
    lines.push(
      `• ${buttonActionId(session.prefix, session.id, 'audio')}`
    )
  }

  await sock.sendMessage(
    jid,
    {
      text:
        lines.join('\n')
    },
    {
      quoted: msg
    }
  )
}

function tiktokFileName(
  kind,
  session
) {
  const id =
    cleanText(
      session?.id,
      20
    ) ||
    'nexa'

  if (kind === 'audio') {
    return (
      `TikTok-Audio-${id}.mp3`
    )
  }

  if (kind === 'hd') {
    return (
      `TikTok-HD-${id}.mp4`
    )
  }

  return (
    `TikTok-${id}.mp4`
  )
}

function getTikTokDownloadCandidates(
  session,
  action
) {
  const ordered =
    action === 'normal'
      ? [
          session.downloads?.normal,
          session.downloads?.hd
        ]
      : action === 'hd'
        ? [
            session.downloads?.hd,
            session.downloads?.normal
          ]
        : [
            session.downloads?.audio
          ]

  const seen = new Set()
  const result = []

  for (const item of ordered) {
    const url =
      String(
        item?.url || ''
      ).trim()

    if (
      !url ||
      seen.has(url)
    ) {
      continue
    }

    seen.add(url)
    result.push({
      ...item,
      url,
      sourceRole:
        item === session.downloads?.hd
          ? 'hd'
          : item === session.downloads?.normal
            ? 'normal'
            : 'audio'
    })
  }

  return result
}

async function deliverTikTokChoice({
  sock,
  msg,
  jid,
  session,
  action
}) {
  const candidates =
    getTikTokDownloadCandidates(
      session,
      action
    )

  if (!candidates.length) {
    throw new Error(
      'TIKTOK_OPTION_UNAVAILABLE'
    )
  }

  const lockKey =
    `${session.owner}:${session.id}`

  if (
    tiktokDownloadLocks.has(
      lockKey
    )
  ) {
    await sock.sendMessage(
      jid,
      {
        text:
          '✦ *NEXA • TIKTOK*\n\n' +
          '⏳ File ini masih diproses. Tunggu sampai selesai.'
      },
      {
        quoted: msg
      }
    )

    return
  }

  tiktokDownloadLocks.add(
    lockKey
  )

  const label =
    action === 'hd'
      ? 'Video HD'
      : action === 'audio'
        ? 'MP3'
        : 'Video'

  let rich = null

  try {
    rich =
      await startTikTokRichStatus({
        sock,
        msg,
        jid,
        label
      })

    // Always show a real starting state before the first network chunk arrives.
    await updateTikTokRichStatus(
      rich,
      `⬇️ Mengunduh *${label}*...\n\n` +
      `${progressBar(0)} *0%*\n` +
      '📦 Menunggu ukuran file dari server...'
    )

    let downloaded = null
    let usedSource = null
    let lastDownloadError = null

    for (
      let index = 0;
      index < candidates.length;
      index += 1
    ) {
      const source =
        candidates[index]

      if (index > 0) {
        await updateTikTokRichStatus(
          rich,
          `↪️ Source ${label} utama gagal.\n` +
          'Mencoba source alternatif...'
        )
      }

      const progressUpdate =
        createTikTokProgressUpdater({
          rich,
          label
        })

      try {
        downloaded =
          await downloadTikTokMedia(
            source.url,
            {
              onProgress:
                progressUpdate
            }
          )

        await progressUpdate.flush()
        usedSource = source
        break
      } catch (error) {
        await progressUpdate.flush()
        lastDownloadError = error

        console.warn(
          '[TIKTOK] media source failed:',
          action,
          index + 1,
          error?.message || error
        )
      }
    }

    if (!downloaded) {
      throw (
        lastDownloadError ||
        new Error('TIKTOK_OPTION_UNAVAILABLE')
      )
    }

    await updateTikTokRichStatus(
      rich,
      `✅ Download selesai • *${humanBytes(downloaded.size)}*\n` +
      '📤 Mengirim ke WhatsApp...'
    )

    if (action === 'hd') {
      await sock.sendMessage(
        jid,
        {
          document:
            downloaded.buffer,
          mimetype:
            'video/mp4',
          fileName:
            tiktokFileName(
              action,
              session
            ),
          caption:
            `${makeCaption(session.result)}\n\n` +
            (
              usedSource?.sourceRole === 'normal'
                ? '📄 *Video original* • source HD utama gagal/tidak tersedia, source alternatif dikirim sebagai dokumen MP4.'
                : '✨ *Video HD* • dikirim sebagai dokumen MP4.'
            )
        },
        {
          quoted: msg,
          mediaUploadTimeoutMs:
            120_000
        }
      )
    } else if (
      action === 'audio'
    ) {
      await sock.sendMessage(
        jid,
        {
          audio:
            downloaded.buffer,
          mimetype:
            'audio/mpeg',
          ptt: false
        },
        {
          quoted: msg,
          mediaUploadTimeoutMs:
            120_000
        }
      )
    } else {
      try {
        await sock.sendMessage(
          jid,
          {
            video:
              downloaded.buffer,
            mimetype:
              'video/mp4',
            caption:
              makeCaption(
                session.result
              )
          },
          {
            quoted: msg,
            mediaUploadTimeoutMs:
              120_000
          }
        )
      } catch (inlineError) {
        console.warn(
          '[TIKTOK] inline video rejected, document fallback:',
          inlineError?.message || inlineError
        )

        await updateTikTokRichStatus(
          rich,
          '⚠️ WhatsApp menolak video inline.\n' +
          '📄 Mengirim file sebagai dokumen supaya tetap berhasil...'
        )

        await sock.sendMessage(
          jid,
          {
            document:
              downloaded.buffer,
            mimetype:
              'video/mp4',
            fileName:
              tiktokFileName(
                'normal',
                session
              ),
            caption:
              `${makeCaption(session.result)}\n\n` +
              '📄 Video dikirim sebagai dokumen karena format sumber ditolak untuk video inline WhatsApp.'
          },
          {
            quoted: msg,
            mediaUploadTimeoutMs:
              120_000
          }
        )
      }
    }

    await updateTikTokRichStatus(
      rich,
      `✅ *${label} berhasil dikirim*\n` +
      `📦 ${humanBytes(downloaded.size)}`
    )

    console.log(
      '✅ TikTok via MusicalDown:',
      action,
      session.result.author ||
      'unknown'
    )
  } catch (error) {
    await updateTikTokRichStatus(
      rich,
      `❌ *${label} gagal diproses*`
    )

    throw error
  } finally {
    tiktokDownloadLocks.delete(
      lockKey
    )
  }
}

function tiktokErrorText(
  error,
  prefix = '.'
) {
  const code =
    String(
      error?.message ||
      ''
    )

  if (
    code ===
    'TIKTOK_SESSION_EXPIRED'
  ) {
    return (
      'Pilihan download sudah kedaluwarsa.\n' +
      `Kirim ulang *${prefix}tiktok <url>*.`
    )
  }

  if (
    code ===
    'TIKTOK_SLIDE_UNAVAILABLE'
  ) {
    return (
      'Slide foto terdeteksi, tapi daftar fotonya belum berhasil dibaca langsung dari TikTok. Coba lagi beberapa saat.'
    )
  }

  if (
    code ===
    'TIKTOK_SLIDE_DOWNLOAD_FAILED'
  ) {
    return (
      'Slide terdeteksi, tapi foto gagal diambil dari CDN TikTok.'
    )
  }

  if (
    code ===
    'TIKTOK_ALBUM_PARENT_FAILED'
  ) {
    return (
      'Slide berhasil diambil, tapi WhatsApp gagal membuat album/box media.'
    )
  }

  if (
    code ===
    'TIKTOK_OPTION_UNAVAILABLE'
  ) {
    return (
      'Format itu tidak tersedia untuk video ini. Kirim ulang link lalu pilih tombol yang tersedia.'
    )
  }

  if (
    code ===
    'VIDEO_TOO_LARGE'
  ) {
    return (
      'File terlalu besar untuk dikirim oleh NEXA.'
    )
  }

  if (
    code ===
      'MDOWN_TIMEOUT' ||
    code ===
      'MEDIA_TIMEOUT'
  ) {
    return (
      'MusicalDown terlalu lama merespons. Coba lagi sebentar.'
    )
  }

  if (
    /^MDOWN_HOME_HTTP_/.test(
      code
    )
  ) {
    return (
      'MusicalDown menolak koneksi dari server NEXA saat ini.'
    )
  }

  if (
    code ===
      'MDOWN_FORM_CHANGED' ||
    code ===
      'MDOWN_NO_VIDEO'
  ) {
    return (
      'Format halaman MusicalDown sedang berubah atau media tidak ditemukan.'
    )
  }

  return (
    'Media belum berhasil diproses. Coba lagi beberapa saat nanti.'
  )
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
    'Download TikTok video / HD / MP3 dan slide foto otomatis',

  usage:
    '.tiktok <url>',

  async run({
    sock,
    msg,
    jid,
    args,
    config
  }) {
    const prefix =
      config?.prefix ||
      '.'

    const owner =
      tiktokOwnerKey(
        msg,
        jid
      )

    const first =
      String(
        args?.[0] ||
        ''
      )
        .trim()
        .toLowerCase()

    try {
      if (
        first ===
        '__download'
      ) {
        const session =
          getTikTokSession({
            id:
              args?.[1],
            owner
          })

        if (!session) {
          throw new Error(
            'TIKTOK_SESSION_EXPIRED'
          )
        }

        const action =
          String(
            args?.[2] ||
            ''
          )
            .trim()
            .toLowerCase()

        if (
          ![
            'normal',
            'hd',
            'audio'
          ].includes(action)
        ) {
          throw new Error(
            'TIKTOK_OPTION_UNAVAILABLE'
          )
        }

        await deliverTikTokChoice({
          sock,
          msg,
          jid,
          session,
          action
        })

        return
      }

      const url =
        args?.[0]

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
              `${prefix}tiktok https://vt.tiktok.com/...`
          },
          {
            quoted: msg
          }
        )

        return
      }

      if (!owner) {
        return
      }

      cleanupTikTokSessions()

      await sock.sendMessage(
        jid,
        {
          text:
            '✦ *NEXA • TIKTOK*\n\n' +
            '⏳ Menganalisis postingan TikTok...'
        },
        {
          quoted: msg
        }
      )

      const pageInfo =
        await fetchTikTokPageInfo(
          url
        )

      if (
        pageInfo?.type ===
        'slide'
      ) {
        await sendTikTokSlide({
          sock,
          msg,
          jid,
          info:
            pageInfo
        })
        return
      }

      if (
        pageInfo?.type ===
        'slide-unresolved'
      ) {
        throw new Error(
          'TIKTOK_SLIDE_UNAVAILABLE'
        )
      }

      const result =
        await fetchTikTok(
          url
        )

      if (
        pageInfo?.type ===
        'video'
      ) {
        result.author =
          result.author ||
          pageInfo.author ||
          ''

        result.description =
          result.description ||
          pageInfo.description ||
          ''

        result.views =
          pageInfo.views ??
          result.views

        result.likes =
          pageInfo.likes ??
          result.likes

        result.comments =
          pageInfo.comments ??
          result.comments
      }

      const session =
        makeTikTokSession({
          owner,
          result,
          prefix
        })

      await sendTikTokPanel({
        sock,
        msg,
        jid,
        session
      })
    } catch (error) {
      console.error(
        '[TIKTOK]',
        error?.message ||
        error
      )

      await sock.sendMessage(
        jid,
        {
          text:
            '⚠️ *NEXA • TIKTOK*\n\n' +
            tiktokErrorText(
              error,
              prefix
            )
        },
        {
          quoted: msg
        }
      )
    }
  }
}
