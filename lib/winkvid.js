// NEXA WINK VIDEO HD V2
// UX: kirim/reply video + .winkvid. URL manual tetap didukung sebagai fallback.
import {
  downloadMediaMessage
} from '@whiskeysockets/baileys'

const ZYVOR_API =
  'https://api.zyvor.my.id/api/hdvidio/wink-hd-video'

const UGUU_API =
  'https://uguu.se/upload'

const INPUT_DOWNLOAD_TIMEOUT_MS =
  60 * 1000

const UPLOAD_TIMEOUT_MS =
  2 * 60 * 1000

const API_TIMEOUT_MS =
  6 * 60 * 1000

const RESULT_DOWNLOAD_TIMEOUT_MS =
  4 * 60 * 1000

const MAX_INPUT_BYTES =
  48 * 1024 * 1024

const MAX_OUTPUT_BYTES =
  50 * 1024 * 1024

function timeoutSignal(ms) {
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(),
    ms
  )
  timer.unref?.()

  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timer)
    }
  }
}

function isHttpUrl(value) {
  try {
    const url = new URL(
      String(value || '').trim()
    )
    return (
      url.protocol === 'http:' ||
      url.protocol === 'https:'
    )
  } catch {
    return false
  }
}

function normalizeUrl(value) {
  return String(value || '').trim()
}

function extFromMime(mime) {
  const value =
    String(mime || '')
      .toLowerCase()
      .split(';')[0]
      .trim()

  if (value === 'video/webm') return 'webm'
  if (value === 'video/quicktime') return 'mov'
  if (value === 'video/x-m4v') return 'm4v'
  return 'mp4'
}

function collectUrls(value, out, depth = 0) {
  if (
    depth > 8 ||
    value === null ||
    value === undefined
  ) return

  if (typeof value === 'string') {
    const text = value.trim()
    if (isHttpUrl(text)) out.push(text)
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectUrls(item, out, depth + 1)
    }
    return
  }

  if (typeof value === 'object') {
    const preferred = [
      'video',
      'video_url',
      'videoUrl',
      'hd_video',
      'hdVideo',
      'download',
      'download_url',
      'downloadUrl',
      'output',
      'output_url',
      'outputUrl',
      'result',
      'result_url',
      'resultUrl',
      'data',
      'url',
      'src',
      'href'
    ]

    const visited = new Set()

    for (const key of preferred) {
      if (key in value) {
        visited.add(key)
        collectUrls(
          value[key],
          out,
          depth + 1
        )
      }
    }

    for (const [key, item] of Object.entries(value)) {
      if (!visited.has(key)) {
        collectUrls(
          item,
          out,
          depth + 1
        )
      }
    }
  }
}

function chooseResultUrl(data, sourceUrl) {
  const found = []
  collectUrls(data, found)

  const source = normalizeUrl(sourceUrl)

  const unique = [
    ...new Set(found)
  ]

  const scored =
    unique
      .filter(url => url !== source)
      .map(url => {
        const lower = url.toLowerCase()
        let score = 0

        if (
          /\.(mp4|mov|m4v|webm)(?:[?#]|$)/i.test(url)
        ) score += 20

        if (
          /video|download|result|output|enhanc|wink|hd/i.test(lower)
        ) score += 8

        if (
          /cdn|storage|file|media/i.test(lower)
        ) score += 4

        return {
          url,
          score
        }
      })
      .sort((a, b) => b.score - a.score)

  return scored[0]?.url || null
}

async function readLimitedResponse(
  res,
  maxBytes
) {
  const length =
    Number(
      res.headers.get('content-length')
    ) || 0

  if (
    length > 0 &&
    length > maxBytes
  ) {
    throw new Error('OUTPUT_TOO_LARGE')
  }

  const reader = res.body?.getReader()

  if (!reader) {
    throw new Error('EMPTY_RESPONSE')
  }

  const chunks = []
  let total = 0

  try {
    while (true) {
      const {
        done,
        value
      } = await reader.read()

      if (done) break

      total += value.byteLength

      if (total > maxBytes) {
        throw new Error('OUTPUT_TOO_LARGE')
      }

      chunks.push(
        Buffer.from(value)
      )
    }
  } finally {
    await reader.cancel().catch(() => {})
  }

  return Buffer.concat(chunks)
}

function cleanApiError(data) {
  const raw =
    data?.message ||
    data?.msg ||
    data?.error ||
    data?.detail ||
    ''

  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300)
}

export async function downloadWinkInput(
  source,
  sock
) {
  if (!source?.message) {
    throw new Error('MEDIA_NOT_FOUND')
  }

  const media =
    source.message?.videoMessage

  const declaredLength =
    Number(media?.fileLength || 0)

  if (
    declaredLength > 0 &&
    declaredLength > MAX_INPUT_BYTES
  ) {
    throw new Error('INPUT_TOO_LARGE')
  }

  const controller =
    new AbortController()

  let stream
  let timedOut = false

  const logger = {
    info() {},
    error() {},
    warn() {},
    debug() {},
    trace() {},
    child() {
      return this
    }
  }

  const timer =
    setTimeout(
      () => {
        timedOut = true
        controller.abort()
        stream?.destroy(
          new Error('INPUT_DOWNLOAD_TIMEOUT')
        )
      },
      INPUT_DOWNLOAD_TIMEOUT_MS
    )

  timer.unref?.()

  try {
    stream =
      await downloadMediaMessage(
        {
          key: source.key,
          message: source.message
        },
        'stream',
        {
          options: {
            signal: controller.signal,
            timeout:
              INPUT_DOWNLOAD_TIMEOUT_MS - 5000
          }
        },
        {
          logger,
          reuploadRequest:
            async message => {
              if (timedOut) {
                throw new Error(
                  'INPUT_DOWNLOAD_TIMEOUT'
                )
              }

              if (
                !source.key?.id ||
                !sock?.updateMediaMessage
              ) {
                throw new Error(
                  'REUPLOAD_REQUIRED'
                )
              }

              return sock.updateMediaMessage(
                message
              )
            }
        }
      )

    const chunks = []
    let total = 0

    for await (const chunk of stream) {
      total += chunk.length

      if (total > MAX_INPUT_BYTES) {
        throw new Error('INPUT_TOO_LARGE')
      }

      chunks.push(
        Buffer.from(chunk)
      )
    }

    if (!total) {
      throw new Error('INPUT_EMPTY')
    }

    return {
      buffer:
        Buffer.concat(chunks),
      mimetype:
        String(
          media?.mimetype ||
          'video/mp4'
        )
          .split(';')[0]
          .trim()
    }
  } catch (error) {
    if (
      timedOut ||
      error?.name === 'AbortError'
    ) {
      throw new Error(
        'INPUT_DOWNLOAD_TIMEOUT'
      )
    }
    throw error
  } finally {
    clearTimeout(timer)
    controller.abort()
    stream?.destroy()
  }
}

export async function uploadWinkInput({
  buffer,
  mimetype
}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new Error('INPUT_EMPTY')
  }

  if (buffer.length > MAX_INPUT_BYTES) {
    throw new Error('INPUT_TOO_LARGE')
  }

  const mime =
    String(mimetype || 'video/mp4')
      .split(';')[0]
      .trim()

  const ext =
    extFromMime(mime)

  const form =
    new FormData()

  form.append(
    'files[]',
    new Blob(
      [buffer],
      {
        type: mime
      }
    ),
    `nexa-wink-input-${Date.now()}.${ext}`
  )

  const guard =
    timeoutSignal(
      UPLOAD_TIMEOUT_MS
    )

  try {
    const res =
      await fetch(
        `${UGUU_API}?output=json`,
        {
          method: 'POST',
          headers: {
            'Accept':
              'application/json',
            'User-Agent':
              'NEXA-BOT/1.0'
          },
          body: form,
          signal: guard.signal
        }
      )

    if (!res.ok) {
      throw new Error(
        `UPLOAD_HTTP_${res.status}`
      )
    }

    const data =
      await res
        .json()
        .catch(() => null)

    const url =
      String(
        data?.files?.[0]?.url || ''
      ).trim()

    if (!isHttpUrl(url)) {
      throw new Error(
        'UPLOAD_NO_URL'
      )
    }

    return url
  } catch (error) {
    if (
      error?.name === 'AbortError'
    ) {
      throw new Error(
        'UPLOAD_TIMEOUT'
      )
    }
    throw error
  } finally {
    guard.clear()
  }
}

async function callZyvor(sourceUrl) {
  const endpoint =
    new URL(ZYVOR_API)

  endpoint.searchParams.set(
    'url',
    sourceUrl
  )

  const guard =
    timeoutSignal(API_TIMEOUT_MS)

  try {
    const res =
      await fetch(
        endpoint,
        {
          method: 'GET',
          headers: {
            'Accept':
              'application/json, video/*;q=0.9, */*;q=0.8',
            'User-Agent':
              'NEXA-BOT/1.0'
          },
          signal: guard.signal
        }
      )

    if (!res.ok) {
      let detail = ''

      try {
        detail =
          (await res.text())
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 250)
      } catch {}

      throw new Error(
        `ZYVOR_HTTP_${res.status}${
          detail ? `:${detail}` : ''
        }`
      )
    }

    const contentType =
      String(
        res.headers.get('content-type') || ''
      ).toLowerCase()

    if (
      contentType.startsWith('video/')
    ) {
      const buffer =
        await readLimitedResponse(
          res,
          MAX_OUTPUT_BYTES
        )

      return {
        buffer,
        url: null,
        mimetype:
          contentType.split(';')[0] ||
          'video/mp4'
      }
    }

    const raw =
      await readLimitedResponse(
        res,
        4 * 1024 * 1024
      )

    const text =
      raw.toString('utf8').trim()

    let data = null

    try {
      data = JSON.parse(text)
    } catch {
      if (isHttpUrl(text)) {
        return {
          buffer: null,
          url: text,
          mimetype: null
        }
      }

      throw new Error(
        'ZYVOR_BAD_RESPONSE'
      )
    }

    if (
      data?.success === false ||
      data?.status === false ||
      data?.status === 'error'
    ) {
      const detail =
        cleanApiError(data)

      throw new Error(
        detail
          ? `ZYVOR_API:${detail}`
          : 'ZYVOR_API_ERROR'
      )
    }

    const resultUrl =
      chooseResultUrl(
        data,
        sourceUrl
      )

    if (!resultUrl) {
      console.error(
        '[WINKVID] response tanpa output URL:',
        JSON.stringify(data).slice(0, 1500)
      )

      throw new Error(
        'ZYVOR_OUTPUT_MISSING'
      )
    }

    return {
      buffer: null,
      url: resultUrl,
      mimetype: null
    }
  } catch (error) {
    if (
      error?.name === 'AbortError' ||
      String(
        error?.message || ''
      ).includes('aborted')
    ) {
      throw new Error(
        'ZYVOR_TIMEOUT'
      )
    }

    throw error
  } finally {
    guard.clear()
  }
}

async function downloadResult(url) {
  const guard =
    timeoutSignal(
      RESULT_DOWNLOAD_TIMEOUT_MS
    )

  try {
    const res =
      await fetch(
        url,
        {
          redirect: 'follow',
          headers: {
            'Accept':
              'video/*, application/octet-stream;q=0.9, */*;q=0.8',
            'User-Agent':
              'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36'
          },
          signal: guard.signal
        }
      )

    if (!res.ok) {
      throw new Error(
        `RESULT_HTTP_${res.status}`
      )
    }

    const buffer =
      await readLimitedResponse(
        res,
        MAX_OUTPUT_BYTES
      )

    if (!buffer.length) {
      throw new Error(
        'RESULT_EMPTY'
      )
    }

    const mimetype =
      String(
        res.headers.get('content-type') ||
        'video/mp4'
      )
        .split(';')[0]
        .trim()

    return {
      buffer,
      mimetype:
        mimetype.startsWith('video/')
          ? mimetype
          : 'video/mp4'
    }
  } catch (error) {
    if (
      error?.name === 'AbortError' ||
      String(
        error?.message || ''
      ).includes('aborted')
    ) {
      throw new Error(
        'RESULT_TIMEOUT'
      )
    }

    throw error
  } finally {
    guard.clear()
  }
}

function friendlyError(error) {
  const message =
    String(error?.message || '')

  const direct = {
    MEDIA_NOT_FOUND:
      'Video tidak ditemukan.',
    INPUT_TOO_LARGE:
      'Video input terlalu besar. Batas saat ini 48 MB.',
    INPUT_EMPTY:
      'Video input kosong atau gagal dibaca.',
    INPUT_DOWNLOAD_TIMEOUT:
      'Terlalu lama mengambil video dari WhatsApp.',
    REUPLOAD_REQUIRED:
      'Media WhatsApp perlu diunduh ulang tapi gagal.',
    UPLOAD_TIMEOUT:
      'Upload video sementara terlalu lama.',
    UPLOAD_NO_URL:
      'Upload sementara berhasil, tapi URL video tidak ditemukan.',
    ZYVOR_TIMEOUT:
      'API Wink terlalu lama merespons.',
    RESULT_TIMEOUT:
      'Video hasil terlalu lama saat diunduh.',
    OUTPUT_TOO_LARGE:
      'Video hasil melebihi batas 50 MB.',
    ZYVOR_OUTPUT_MISSING:
      'API merespons, tapi URL video hasil tidak ditemukan.',
    ZYVOR_BAD_RESPONSE:
      'Format respons API tidak dikenali.'
  }

  if (direct[message]) {
    return direct[message]
  }

  if (
    message.startsWith(
      'UPLOAD_HTTP_'
    )
  ) {
    return (
      `Gagal upload video sementara ` +
      `(HTTP ${message.replace('UPLOAD_HTTP_', '')}).`
    )
  }

  if (
    message.startsWith(
      'ZYVOR_API:'
    )
  ) {
    return message.slice(
      'ZYVOR_API:'.length
    )
  }

  if (
    message.startsWith(
      'ZYVOR_HTTP_'
    )
  ) {
    return (
      `API Wink error ` +
      `(${message.replace('ZYVOR_HTTP_', '')}).`
    )
  }

  if (
    message.startsWith(
      'RESULT_HTTP_'
    )
  ) {
    return (
      `Gagal mengambil video hasil ` +
      `(HTTP ${message.replace('RESULT_HTTP_', '')}).`
    )
  }

  return (
    message ||
    'Unknown error'
  )
}

export async function enhanceWinkVideo(
  sourceUrl
) {
  const url =
    normalizeUrl(sourceUrl)

  if (!isHttpUrl(url)) {
    throw new Error('URL_INVALID')
  }

  const api =
    await callZyvor(url)

  if (api.buffer) {
    return {
      buffer: api.buffer,
      mimetype:
        api.mimetype ||
        'video/mp4',
      bytes:
        api.buffer.length
    }
  }

  const result =
    await downloadResult(
      api.url
    )

  return {
    buffer:
      result.buffer,
    mimetype:
      result.mimetype ||
      'video/mp4',
    bytes:
      result.buffer.length
  }
}

export function winkvidErrorText(error) {
  if (
    String(error?.message || '') ===
    'URL_INVALID'
  ) {
    return 'URL video tidak valid.'
  }

  return friendlyError(error)
}
