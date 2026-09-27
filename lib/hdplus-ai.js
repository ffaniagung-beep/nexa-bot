// NEXA HD+ ZYVOR V1
import {
  mkdtemp,
  writeFile,
  rm
} from 'node:fs/promises'

import {
  tmpdir
} from 'node:os'

import {
  join
} from 'node:path'

import {
  fetchBuffered
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
  ) {
    return {
      mime: 'image/png',
      ext: 'png'
    }
  }

  if (
    buffer?.[0] === 0xff &&
    buffer?.[1] === 0xd8
  ) {
    return {
      mime: 'image/jpeg',
      ext: 'jpg'
    }
  }

  if (
    buffer?.slice(0, 4)
      .toString() === 'RIFF' &&
    buffer?.slice(8, 12)
      .toString() === 'WEBP'
  ) {
    return {
      mime: 'image/webp',
      ext: 'webp'
    }
  }

  return {
    mime: 'application/octet-stream',
    ext: 'img'
  }
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

function timeoutSignal(timeout, code) {
  const controller =
    new AbortController()

  const timer = setTimeout(
    () => controller.abort(
      new Error(code)
    ),
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
  return Number(value) >= 4
    ? 4
    : 2
}

function normalizeMode(value) {
  const mode =
    String(value || '')
      .trim()
      .toLowerCase()

  return (
    mode === 'photo' ||
    mode === 'foto' ||
    mode === 'general'
  )
    ? 'photo'
    : 'anime'
}

function providerModelFor(mode) {
  return mode === 'photo'
    ? 'general'
    : 'plus'
}

function findPreferredUrl(value, depth = 0) {
  if (
    depth > 6 ||
    value == null
  ) {
    return null
  }

  if (typeof value === 'string') {
    const text =
      value.trim()

    if (
      /^https?:\/\//i.test(text) ||
      /^data:image\//i.test(text)
    ) {
      return text
    }

    return null
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found =
        findPreferredUrl(
          item,
          depth + 1
        )

      if (found) {
        return found
      }
    }

    return null
  }

  if (typeof value === 'object') {
    const preferredKeys = [
      'result', 'data', 'output', 'image', 'images',
      'enhanced', 'enhanced_image', 'result_image',
      'image_url', 'imageUrl', 'result_url', 'resultUrl',
      'download', 'download_url', 'downloadUrl',
      'url', 'src', 'href'
    ]

    for (const key of preferredKeys) {
      if (key in value) {
        const found =
          findPreferredUrl(
            value[key],
            depth + 1
          )

        if (found) {
          return found
        }
      }
    }

    for (const key of Object.keys(value)) {
      const found =
        findPreferredUrl(
          value[key],
          depth + 1
        )

      if (found) {
        return found
      }
    }
  }

  return null
}

function numberField(value, keys) {
  for (const key of keys) {
    const num = Number(value?.[key])
    if (Number.isFinite(num) && num > 0) {
      return num
    }
  }
  return null
}

async function uploadImage(buffer) {
  const type =
    detectImage(buffer)

  const form =
    new FormData()

  form.append(
    'files[]',
    new Blob([buffer], {
      type: type.mime
    }),
    `nexa-hdplus-input.${type.ext}`
  )

  const guard =
    timeoutSignal(
      UPLOAD_TIMEOUT,
      'UPLOAD_TIMEOUT'
    )

  try {
    const res =
      await fetch(
        `${UGUU_API}?output=json`,
        {
          method: 'POST',
          headers: {
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

    const text =
      await res.text()

    let data

    try {
      data = JSON.parse(text)
    } catch {
      throw new Error(
        'UPLOAD_BAD_JSON'
      )
    }

    const url =
      String(
        data?.files?.[0]?.url || ''
      ).trim()

    if (
      !url ||
      !/^https?:\/\//i.test(url)
    ) {
      throw new Error(
        'UPLOAD_NO_URL'
      )
    }

    return url
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(
        'UPLOAD_TIMEOUT'
      )
    }

    throw error
  } finally {
    guard.clear()
  }
}

async function callZyvor(url, {
  scale,
  mode
}) {
  const guard =
    timeoutSignal(
      API_TIMEOUT,
      'ZYVOR_TIMEOUT'
    )

  try {
    const res =
      await fetch(
        ZYVOR_API,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
            'Accept':
              'application/json',
            'User-Agent':
              'NEXA-BOT/1.0'
          },
          body: JSON.stringify({
            url,
            scale:
              String(scale),
            model:
              providerModelFor(mode)
          }),
          signal: guard.signal
        }
      )

    if (!res.ok) {
      throw new Error(
        `ZYVOR_HTTP_${res.status}`
      )
    }

    const raw =
      await res.text()

    let data

    try {
      data = JSON.parse(raw)
    } catch {
      throw new Error(
        'ZYVOR_BAD_JSON'
      )
    }

    const explicitError =
      String(
        data?.error ||
        data?.message ||
        data?.msg ||
        ''
      ).trim()

    if (
      data?.success === false ||
      data?.status === false
    ) {
      throw new Error(
        explicitError
          ? `ZYVOR_API_ERROR:${explicitError}`
          : 'ZYVOR_API_ERROR'
      )
    }

    const outputUrl =
      findPreferredUrl(data)

    if (!outputUrl) {
      throw new Error(
        'ZYVOR_OUTPUT_MISSING'
      )
    }

    return {
      data,
      outputUrl,
      width:
        numberField(data, [
          'width', 'output_width',
          'result_width'
        ]),
      height:
        numberField(data, [
          'height', 'output_height',
          'result_height'
        ])
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(
        'ZYVOR_TIMEOUT'
      )
    }

    throw error
  } finally {
    guard.clear()
  }
}

async function bufferFromRef(ref) {
  if (/^data:image\//i.test(ref)) {
    const base64 =
      ref.split(',', 2)[1] || ''

    const buffer =
      Buffer.from(
        base64,
        'base64'
      )

    if (!buffer.length) {
      throw new Error(
        'ZYVOR_OUTPUT_EMPTY'
      )
    }

    return buffer
  }

  const response =
    await fetchBuffered(
      ref,
      {},
      DOWNLOAD_TIMEOUT,
      MAX_OUTPUT_BYTES
    )

  return Buffer.from(
    await response.arrayBuffer()
  )
}

export async function enhancePhotoPlusAI(
  buffer,
  {
    scale = 2,
    mode = 'anime'
  } = {}
) {
  if (!buffer?.length) {
    throw new Error('EMPTY_IMAGE')
  }

  if (
    buffer.length >
    MAX_INPUT_BYTES
  ) {
    throw new Error(
      'MEDIA_TOO_LARGE'
    )
  }

  const finalScale =
    normalizeScale(scale)

  const finalMode =
    normalizeMode(mode)

  const uploadedUrl =
    await uploadImage(buffer)

  const apiResult =
    await callZyvor(
      uploadedUrl,
      {
        scale: finalScale,
        mode: finalMode
      }
    )

  const output =
    await bufferFromRef(
      apiResult.outputUrl
    )

  if (!output.length) {
    throw new Error(
      'ZYVOR_OUTPUT_EMPTY'
    )
  }

  if (!isPng(output)) {
    throw new Error(
      'HDPLUS_OUTPUT_NOT_PNG'
    )
  }

  const dir =
    await mkdtemp(
      join(
        tmpdir(),
        'nexa-hdplus-zyvor-'
      )
    )

  const path =
    join(
      dir,
      'NEXA-HD+.png'
    )

  const cleanup =
    () => rm(
      dir,
      {
        recursive: true,
        force: true
      }
    )

  try {
    await writeFile(
      path,
      output
    )
  } catch (error) {
    await cleanup()
    throw error
  }

  return {
    buffer: output,
    path,
    width:
      apiResult.width,
    height:
      apiResult.height,
    fileSize:
      output.length,
    scale:
      finalScale,
    mode:
      finalMode,
    model:
      providerModelFor(finalMode),
    requestId: null,
    cleanup
  }
}
