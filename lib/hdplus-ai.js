// NEXA HD+ ZYVOR V2
import {
  mkdtemp,
  writeFile,
  readFile,
  rm
} from 'node:fs/promises'

import {
  tmpdir
} from 'node:os'

import {
  join
} from 'node:path'

import {
  fetchBuffered,
  runTool
} from './maker-runtime.js'

const MAX_INPUT_BYTES =
  16 * 1024 * 1024

const MAX_OUTPUT_BYTES =
  32 * 1024 * 1024

const UGUU_API =
  'https://uguu.se/upload'

const ZYVOR_API =
  'https://api.zyvor.my.id/api/imagehd/ai-enhancev8'

const UPLOAD_TIMEOUT =
  45 * 1000

const API_TIMEOUT =
  2 * 60 * 1000

const DOWNLOAD_TIMEOUT =
  2 * 60 * 1000

function detectImage(buffer) {
  if (
    buffer?.[0] === 0x89 &&
    buffer?.[1] === 0x50 &&
    buffer?.[2] === 0x4e &&
    buffer?.[3] === 0x47
  ) return { mime: 'image/png', ext: 'png' }

  if (
    buffer?.[0] === 0xff &&
    buffer?.[1] === 0xd8
  ) return { mime: 'image/jpeg', ext: 'jpg' }

  if (
    buffer?.slice(0, 4).toString() === 'RIFF' &&
    buffer?.slice(8, 12).toString() === 'WEBP'
  ) return { mime: 'image/webp', ext: 'webp' }

  if (
    buffer?.slice(0, 3).toString() === 'GIF'
  ) return { mime: 'image/gif', ext: 'gif' }

  return { mime: 'application/octet-stream', ext: 'img' }
}

function isPng(buffer) {
  return Boolean(
    buffer?.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  )
}

function pngSize(buffer) {
  if (!isPng(buffer) || buffer.length < 24) {
    return { width: null, height: null }
  }

  try {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20)
    }
  } catch {
    return { width: null, height: null }
  }
}

function timeoutSignal(timeout, code) {
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new Error(code)),
    timeout
  )
  timer.unref?.()

  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timer)
      controller.abort()
    }
  }
}

function normalizeScale(value) {
  return Number(value) >= 4 ? 4 : 2
}

function normalizeMode(value) {
  const mode = String(value || '').trim().toLowerCase()
  return (
    mode === 'photo' ||
    mode === 'foto' ||
    mode === 'general'
  ) ? 'photo' : 'anime'
}

function providerModelFor(mode) {
  return mode === 'photo' ? 'general' : 'plus'
}

function findImageRef(value, depth = 0) {
  if (depth > 7 || value == null) return null

  if (typeof value === 'string') {
    const text = value.trim()
    if (/^https?:\/\//i.test(text)) return text
    if (/^data:image\//i.test(text)) return text
    return null
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findImageRef(item, depth + 1)
      if (found) return found
    }
    return null
  }

  if (typeof value === 'object') {
    const preferred = [
      'result', 'data', 'output', 'image', 'images',
      'enhanced', 'enhanced_image', 'result_image',
      'image_url', 'imageUrl', 'result_url', 'resultUrl',
      'download', 'download_url', 'downloadUrl',
      'url', 'src', 'href'
    ]

    for (const key of preferred) {
      if (key in value) {
        const found = findImageRef(value[key], depth + 1)
        if (found) return found
      }
    }

    for (const key of Object.keys(value)) {
      const found = findImageRef(value[key], depth + 1)
      if (found) return found
    }
  }

  return null
}

async function readLimitedResponse(res, maxBytes) {
  const contentLength = Number(res.headers.get('content-length')) || 0
  if (contentLength > maxBytes) {
    throw new Error('RESULT_TOO_LARGE')
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('EMPTY_RESPONSE')

  const chunks = []
  let total = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) throw new Error('RESULT_TOO_LARGE')
      chunks.push(Buffer.from(value))
    }
  } finally {
    await reader.cancel().catch(() => {})
  }

  return Buffer.concat(chunks)
}

async function uploadImage(buffer) {
  const type = detectImage(buffer)
  const form = new FormData()

  form.append(
    'files[]',
    new Blob([buffer], { type: type.mime }),
    `nexa-hdplus-input.${type.ext}`
  )

  const guard = timeoutSignal(UPLOAD_TIMEOUT, 'UPLOAD_TIMEOUT')

  try {
    const res = await fetch(
      `${UGUU_API}?output=json`,
      {
        method: 'POST',
        headers: { 'User-Agent': 'NEXA-BOT/1.0' },
        body: form,
        signal: guard.signal
      }
    )

    if (!res.ok) throw new Error(`UPLOAD_HTTP_${res.status}`)

    const data = await res.json().catch(() => null)
    const url = String(data?.files?.[0]?.url || '').trim()

    if (!/^https?:\/\//i.test(url)) {
      throw new Error('UPLOAD_NO_URL')
    }

    return url
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('UPLOAD_TIMEOUT')
    }
    throw error
  } finally {
    guard.clear()
  }
}

async function callZyvor(url, { scale, mode }) {
  const guard = timeoutSignal(API_TIMEOUT, 'ZYVOR_TIMEOUT')

  try {
    const res = await fetch(
      ZYVOR_API,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': '*/*',
          'User-Agent': 'NEXA-BOT/1.0'
        },
        body: JSON.stringify({
          url,
          scale: String(scale),
          model: providerModelFor(mode)
        }),
        signal: guard.signal
      }
    )

    if (!res.ok) {
      throw new Error(`ZYVOR_HTTP_${res.status}`)
    }

    const contentType = String(
      res.headers.get('content-type') || ''
    ).toLowerCase()

    const raw = await readLimitedResponse(res, MAX_OUTPUT_BYTES)

    if (!raw.length) {
      throw new Error('ZYVOR_OUTPUT_EMPTY')
    }

    // Some API versions return the enhanced image body directly.
    const magic = detectImage(raw)
    if (
      contentType.startsWith('image/') ||
      magic.mime.startsWith('image/')
    ) {
      console.log(
        `[HD+] Zyvor direct image: ${contentType || magic.mime} • ${raw.length} bytes`
      )
      return {
        buffer: raw,
        outputRef: null,
        responseType: 'binary'
      }
    }

    const text = raw.toString('utf8').trim()

    // JSON response (documented/example behavior).
    try {
      const data = JSON.parse(text)

      const explicitError = String(
        data?.error || data?.message || data?.msg || ''
      ).trim()

      if (data?.success === false || data?.status === false) {
        throw new Error(
          explicitError
            ? `ZYVOR_API_ERROR:${explicitError}`
            : 'ZYVOR_API_ERROR'
        )
      }

      const outputRef = findImageRef(data)
      if (!outputRef) {
        console.error(
          '[HD+] Zyvor JSON tanpa image ref:',
          JSON.stringify(data).slice(0, 1000)
        )
        throw new Error('ZYVOR_OUTPUT_MISSING')
      }

      return {
        buffer: null,
        outputRef,
        responseType: 'json'
      }
    } catch (error) {
      if (
        String(error?.message || '').startsWith('ZYVOR_')
      ) {
        throw error
      }
    }

    // Some endpoints simply return the result URL as plain text.
    if (
      /^https?:\/\//i.test(text) ||
      /^data:image\//i.test(text)
    ) {
      console.log('[HD+] Zyvor plain result ref diterima')
      return {
        buffer: null,
        outputRef: text,
        responseType: 'text'
      }
    }

    console.error(
      `[HD+] Zyvor unexpected response (${contentType || 'no-content-type'}):`,
      text.slice(0, 500)
    )

    throw new Error('ZYVOR_BAD_RESPONSE')
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('ZYVOR_TIMEOUT')
    }
    throw error
  } finally {
    guard.clear()
  }
}

async function bufferFromRef(ref) {
  if (/^data:image\//i.test(ref)) {
    const comma = ref.indexOf(',')
    if (comma < 0) throw new Error('ZYVOR_OUTPUT_BAD_DATA_URI')
    const meta = ref.slice(0, comma)
    const payload = ref.slice(comma + 1)
    const buffer = Buffer.from(
      payload,
      /;base64/i.test(meta) ? 'base64' : 'utf8'
    )
    if (!buffer.length) throw new Error('ZYVOR_OUTPUT_EMPTY')
    return buffer
  }

  const response = await fetchBuffered(
    ref,
    {},
    DOWNLOAD_TIMEOUT,
    MAX_OUTPUT_BYTES
  )

  return Buffer.from(await response.arrayBuffer())
}

async function ensurePng(buffer) {
  if (isPng(buffer)) return buffer

  const type = detectImage(buffer)

  if (!type.mime.startsWith('image/')) {
    throw new Error('HDPLUS_OUTPUT_NOT_IMAGE')
  }

  const dir = await mkdtemp(join(tmpdir(), 'nexa-hdplus-png-'))
  const input = join(dir, `input.${type.ext}`)
  const output = join(dir, 'output.png')

  try {
    await writeFile(input, buffer)

    await runTool(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel', 'error',
        '-nostdin',
        '-y',
        '-threads', '1',
        '-i', input,
        '-frames:v', '1',
        '-compression_level', '6',
        output
      ],
      60 * 1000
    )

    const converted = await readFile(output)
    if (!isPng(converted)) {
      throw new Error('HDPLUS_OUTPUT_NOT_PNG')
    }

    console.log(
      `[HD+] Output ${type.mime} dikonversi ke PNG (${converted.length} bytes)`
    )

    return converted
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

export async function enhancePhotoPlusAI(
  buffer,
  {
    scale = 2,
    mode = 'anime'
  } = {}
) {
  if (!buffer?.length) throw new Error('EMPTY_IMAGE')
  if (buffer.length > MAX_INPUT_BYTES) throw new Error('MEDIA_TOO_LARGE')

  const finalScale = normalizeScale(scale)
  const finalMode = normalizeMode(mode)

  const uploadedUrl = await uploadImage(buffer)

  const apiResult = await callZyvor(
    uploadedUrl,
    {
      scale: finalScale,
      mode: finalMode
    }
  )

  let output = apiResult.buffer

  if (!output?.length && apiResult.outputRef) {
    output = await bufferFromRef(apiResult.outputRef)
  }

  if (!output?.length) {
    throw new Error('ZYVOR_OUTPUT_EMPTY')
  }

  output = await ensurePng(output)

  if (output.length > MAX_OUTPUT_BYTES) {
    throw new Error('HDPLUS_OUTPUT_TOO_LARGE')
  }

  const size = pngSize(output)

  const dir = await mkdtemp(join(tmpdir(), 'nexa-hdplus-zyvor-'))
  const path = join(dir, 'NEXA-HD+.png')
  const cleanup = () => rm(dir, { recursive: true, force: true })

  try {
    await writeFile(path, output)
  } catch (error) {
    await cleanup()
    throw error
  }

  return {
    buffer: output,
    path,
    width: size.width,
    height: size.height,
    fileSize: output.length,
    scale: finalScale,
    mode: finalMode,
    model: providerModelFor(finalMode),
    requestId: null,
    cleanup
  }
}
