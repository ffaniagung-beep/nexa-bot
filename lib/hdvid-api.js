// NEXA HD VIDEO API
// Direct multipart upload to Zyvor /api/hdvidio/tohd.
import {
  downloadMediaMessage
} from '@whiskeysockets/baileys'

const HDVID_API =
  'https://api.zyvor.my.id/api/hdvidio/tohd'

const MAX_INPUT_BYTES =
  45 * 1024 * 1024

const MAX_OUTPUT_BYTES =
  50 * 1024 * 1024

const DOWNLOAD_TIMEOUT_MS =
  90 * 1000

const API_TIMEOUT_MS =
  7 * 60 * 1000

const RESULT_TIMEOUT_MS =
  4 * 60 * 1000

function timeoutSignal(ms) {
  const controller =
    new AbortController()

  const timer =
    setTimeout(
      () => controller.abort(),
      ms
    )

  timer.unref?.()

  return {
    signal:
      controller.signal,

    clear() {
      clearTimeout(timer)
    }
  }
}

function isHttpUrl(value) {
  try {
    const url =
      new URL(
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

function extFromMime(mime) {
  const value =
    String(
      mime || ''
    )
      .toLowerCase()
      .split(';')[0]
      .trim()

  if (value === 'video/webm') {
    return 'webm'
  }

  if (value === 'video/quicktime') {
    return 'mov'
  }

  if (value === 'video/x-m4v') {
    return 'm4v'
  }

  return 'mp4'
}

async function readLimited(
  response,
  maxBytes
) {
  const length =
    Number(
      response.headers.get(
        'content-length'
      )
    ) || 0

  if (
    length > 0 &&
    length > maxBytes
  ) {
    throw new Error(
      'OUTPUT_TOO_LARGE'
    )
  }

  const reader =
    response.body?.getReader()

  if (!reader) {
    throw new Error(
      'EMPTY_RESPONSE'
    )
  }

  const chunks = []
  let total = 0

  try {
    while (true) {
      const {
        done,
        value
      } =
        await reader.read()

      if (done) {
        break
      }

      total +=
        value.byteLength

      if (
        total >
        maxBytes
      ) {
        throw new Error(
          'OUTPUT_TOO_LARGE'
        )
      }

      chunks.push(
        Buffer.from(value)
      )
    }
  } finally {
    await reader
      .cancel()
      .catch(() => {})
  }

  return Buffer.concat(
    chunks
  )
}

function collectUrls(
  value,
  output,
  depth = 0
) {
  if (
    depth > 8 ||
    value === null ||
    value === undefined
  ) {
    return
  }

  if (
    typeof value ===
    'string'
  ) {
    const text =
      value.trim()

    if (
      isHttpUrl(text)
    ) {
      output.push(text)
    }

    return
  }

  if (
    Array.isArray(value)
  ) {
    for (
      const item
      of value
    ) {
      collectUrls(
        item,
        output,
        depth + 1
      )
    }

    return
  }

  if (
    typeof value ===
    'object'
  ) {
    const preferred = [
      'video',
      'video_url',
      'videoUrl',
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

    const visited =
      new Set()

    for (
      const key
      of preferred
    ) {
      if (key in value) {
        visited.add(key)

        collectUrls(
          value[key],
          output,
          depth + 1
        )
      }
    }

    for (
      const [key, item]
      of Object.entries(
        value
      )
    ) {
      if (
        visited.has(key)
      ) {
        continue
      }

      collectUrls(
        item,
        output,
        depth + 1
      )
    }
  }
}

function findResultUrl(data) {
  const urls = []

  collectUrls(
    data,
    urls
  )

  const unique =
    [...new Set(urls)]

  const ranked =
    unique
      .map(url => {
        const lower =
          url.toLowerCase()

        let score = 0

        if (
          /\.(mp4|mov|m4v|webm)(?:[?#]|$)/i
            .test(url)
        ) {
          score += 20
        }

        if (
          /video|download|result|output|hd|enhanc/i
            .test(lower)
        ) {
          score += 8
        }

        if (
          /cdn|storage|media|file/i
            .test(lower)
        ) {
          score += 4
        }

        return {
          url,
          score
        }
      })
      .sort(
        (a, b) =>
          b.score -
          a.score
      )

  return (
    ranked[0]?.url ||
    null
  )
}

function apiMessage(data) {
  const value =
    data?.message ||
    data?.msg ||
    data?.error ||
    data?.detail ||
    ''

  return String(
    value || ''
  )
    .replace(
      /\s+/g,
      ' '
    )
    .trim()
    .slice(
      0,
      350
    )
}

export async function downloadHdvidInput(
  source,
  sock
) {
  if (
    !source?.message
  ) {
    throw new Error(
      'MEDIA_NOT_FOUND'
    )
  }

  const media =
    source.message
      ?.videoMessage

  const declared =
    Number(
      media?.fileLength ||
      0
    )

  if (
    declared > 0 &&
    declared >
      MAX_INPUT_BYTES
  ) {
    throw new Error(
      'INPUT_TOO_LARGE'
    )
  }

  const controller =
    new AbortController()

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

  let stream
  let timedOut = false

  const timer =
    setTimeout(
      () => {
        timedOut = true
        controller.abort()

        stream?.destroy(
          new Error(
            'INPUT_DOWNLOAD_TIMEOUT'
          )
        )
      },
      DOWNLOAD_TIMEOUT_MS
    )

  timer.unref?.()

  try {
    stream =
      await downloadMediaMessage(
        {
          key:
            source.key,
          message:
            source.message
        },
        'stream',
        {
          options: {
            signal:
              controller.signal,
            timeout:
              DOWNLOAD_TIMEOUT_MS -
              5000
          }
        },
        {
          logger,

          reuploadRequest:
            async message => {
              if (
                timedOut
              ) {
                throw new Error(
                  'INPUT_DOWNLOAD_TIMEOUT'
                )
              }

              if (
                !source.key?.id ||
                !sock
                  ?.updateMediaMessage
              ) {
                throw new Error(
                  'REUPLOAD_REQUIRED'
                )
              }

              return (
                sock
                  .updateMediaMessage(
                    message
                  )
              )
            }
        }
      )

    const chunks = []
    let total = 0

    for await (
      const chunk
      of stream
    ) {
      total +=
        chunk.length

      if (
        total >
        MAX_INPUT_BYTES
      ) {
        throw new Error(
          'INPUT_TOO_LARGE'
        )
      }

      chunks.push(
        Buffer.from(chunk)
      )
    }

    if (!total) {
      throw new Error(
        'INPUT_EMPTY'
      )
    }

    return {
      buffer:
        Buffer.concat(
          chunks
        ),

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
      error?.name ===
        'AbortError'
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

async function downloadResult(
  url
) {
  const guard =
    timeoutSignal(
      RESULT_TIMEOUT_MS
    )

  try {
    const response =
      await fetch(
        url,
        {
          redirect:
            'follow',

          headers: {
            Accept:
              'video/*, application/octet-stream;q=0.9, */*;q=0.8',

            'User-Agent':
              'NEXA-BOT/1.0'
          },

          signal:
            guard.signal
        }
      )

    if (
      !response.ok
    ) {
      throw new Error(
        `RESULT_HTTP_${response.status}`
      )
    }

    const buffer =
      await readLimited(
        response,
        MAX_OUTPUT_BYTES
      )

    if (
      !buffer.length
    ) {
      throw new Error(
        'RESULT_EMPTY'
      )
    }

    const rawType =
      String(
        response.headers.get(
          'content-type'
        ) ||
        'video/mp4'
      )
        .split(';')[0]
        .trim()

    return {
      buffer,

      mimetype:
        rawType
          .startsWith(
            'video/'
          )
          ? rawType
          : 'video/mp4'
    }
  } catch (error) {
    if (
      error?.name ===
        'AbortError'
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

export async function enhanceHdVideo({
  buffer,
  mimetype,
  settings
}) {
  if (
    !Buffer.isBuffer(
      buffer
    ) ||
    !buffer.length
  ) {
    throw new Error(
      'INPUT_EMPTY'
    )
  }

  if (
    buffer.length >
    MAX_INPUT_BYTES
  ) {
    throw new Error(
      'INPUT_TOO_LARGE'
    )
  }

  const safeType =
    String(
      mimetype ||
      'video/mp4'
    )
      .split(';')[0]
      .trim()

  const ext =
    extFromMime(
      safeType
    )

  const form =
    new FormData()

  form.append(
    'video',
    new Blob(
      [buffer],
      {
        type:
          safeType
      }
    ),
    `nexa-hdvid-${Date.now()}.${ext}`
  )

  form.append(
    'fps',
    String(
      settings.fps
    )
  )

  form.append(
    'resolution',
    String(
      settings.resolution
    )
  )

  form.append(
    'quality',
    String(
      settings.quality
    )
  )

  form.append(
    'enhance',
    settings.enhance
      ? 'yes'
      : 'no'
  )

  form.append(
    'denoise',
    settings.denoise
      ? 'yes'
      : 'no'
  )

  form.append(
    'stabilize',
    settings.stabilize
      ? 'yes'
      : 'no'
  )

  form.append(
    'format',
    'mp4'
  )

  const guard =
    timeoutSignal(
      API_TIMEOUT_MS
    )

  try {
    const response =
      await fetch(
        HDVID_API,
        {
          method:
            'POST',

          headers: {
            Accept:
              'application/json, video/*;q=0.9, */*;q=0.8',

            'User-Agent':
              'NEXA-BOT/1.0'
          },

          body:
            form,

          signal:
            guard.signal
        }
      )

    if (
      !response.ok
    ) {
      let detail = ''

      try {
        detail =
          (await response.text())
            .replace(
              /\s+/g,
              ' '
            )
            .trim()
            .slice(
              0,
              350
            )
      } catch {}

      throw new Error(
        `HDVID_HTTP_${response.status}` +
        (
          detail
            ? `:${detail}`
            : ''
        )
      )
    }

    const contentType =
      String(
        response.headers.get(
          'content-type'
        ) || ''
      )
        .toLowerCase()

    if (
      contentType
        .startsWith(
          'video/'
        ) ||
      contentType
        .includes(
          'application/octet-stream'
        )
    ) {
      const output =
        await readLimited(
          response,
          MAX_OUTPUT_BYTES
        )

      if (
        !output.length
      ) {
        throw new Error(
          'RESULT_EMPTY'
        )
      }

      return {
        buffer:
          output,

        mimetype:
          contentType
            .startsWith(
              'video/'
            )
            ? contentType
                .split(';')[0]
            : 'video/mp4'
      }
    }

    const raw =
      await readLimited(
        response,
        4 * 1024 * 1024
      )

    const text =
      raw
        .toString(
          'utf8'
        )
        .trim()

    let data

    try {
      data =
        JSON.parse(text)
    } catch {
      if (
        isHttpUrl(text)
      ) {
        return (
          await downloadResult(
            text
          )
        )
      }

      throw new Error(
        'HDVID_BAD_RESPONSE'
      )
    }

    if (
      data?.success ===
        false ||
      data?.status ===
        false ||
      data?.status ===
        'error'
    ) {
      const detail =
        apiMessage(data)

      throw new Error(
        detail
          ? `HDVID_API:${detail}`
          : 'HDVID_API_ERROR'
      )
    }

    const resultUrl =
      findResultUrl(
        data
      )

    if (
      !resultUrl
    ) {
      console.error(
        '[HDVID] response tanpa URL output:',
        JSON.stringify(data)
          .slice(
            0,
            1600
          )
      )

      throw new Error(
        'HDVID_OUTPUT_MISSING'
      )
    }

    return (
      await downloadResult(
        resultUrl
      )
    )
  } catch (error) {
    if (
      error?.name ===
        'AbortError'
    ) {
      throw new Error(
        'HDVID_TIMEOUT'
      )
    }

    throw error
  } finally {
    guard.clear()
  }
}

export function hdvidErrorText(
  error
) {
  const message =
    String(
      error?.message ||
      ''
    )

  const known = {
    MEDIA_NOT_FOUND:
      'Video tidak ditemukan.',

    INPUT_TOO_LARGE:
      'Video input terlalu besar. Batas saat ini 45 MB.',

    INPUT_EMPTY:
      'Video kosong atau gagal dibaca.',

    INPUT_DOWNLOAD_TIMEOUT:
      'Terlalu lama mengambil video dari WhatsApp.',

    REUPLOAD_REQUIRED:
      'Media WhatsApp perlu diunduh ulang tapi gagal.',

    OUTPUT_TOO_LARGE:
      'Video hasil melebihi batas 50 MB.',

    RESULT_EMPTY:
      'API selesai, tetapi video hasil kosong.',

    RESULT_TIMEOUT:
      'Terlalu lama mengambil video hasil.',

    HDVID_TIMEOUT:
      'API HD Video terlalu lama merespons.',

    HDVID_BAD_RESPONSE:
      'Format respons API HD Video tidak dikenali.',

    HDVID_OUTPUT_MISSING:
      'API merespons, tetapi video hasil tidak ditemukan.'
  }

  if (
    known[message]
  ) {
    return (
      known[message]
    )
  }

  if (
    message.startsWith(
      'HDVID_API:'
    )
  ) {
    return (
      message.slice(
        'HDVID_API:'
          .length
      )
    )
  }

  if (
    message.startsWith(
      'HDVID_HTTP_'
    )
  ) {
    const rest =
      message.replace(
        'HDVID_HTTP_',
        ''
      )

    if (
      rest.startsWith(
        '524'
      )
    ) {
      return (
        'Server API terlalu lama memproses video (HTTP 524). Coba video lebih pendek atau ulang beberapa saat lagi.'
      )
    }

    return (
      `API HD Video error (HTTP ${rest}).`
    )
  }

  if (
    message.startsWith(
      'RESULT_HTTP_'
    )
  ) {
    return (
      `Gagal mengambil video hasil (HTTP ${message.replace('RESULT_HTTP_', '')}).`
    )
  }

  return (
    message ||
    'Unknown error'
  )
}
