// NEXA_IQC_ZYVOR_V1
import {
  getMediaSource,
  downloadMedia
} from '../lib/maker-media.js'

const IQC_API =
  'https://api.zyvor.my.id/api/maker/iqc-dark'

const UGUU_API =
  'https://uguu.se/upload.php'

const MAX_INPUT_BYTES =
  12 * 1024 * 1024

const MAX_OUTPUT_BYTES =
  24 * 1024 * 1024

const UPLOAD_TIMEOUT =
  35 * 1000

const API_TIMEOUT =
  45 * 1000

const DOWNLOAD_TIMEOUT =
  45 * 1000

function currentWibTime() {
  const parts =
    new Intl.DateTimeFormat(
      'en-GB',
      {
        timeZone:
          'Asia/Jakarta',

        hour:
          '2-digit',

        minute:
          '2-digit',

        hour12:
          false
      }
    )
      .format(
        new Date()
      )

  return parts.replace(
    ':',
    '.'
  )
}

function detectImage(
  buffer
) {
  if (
    buffer?.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return {
      mime:
        'image/png',

      ext:
        'png'
    }
  }

  if (
    buffer?.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8
  ) {
    return {
      mime:
        'image/jpeg',

      ext:
        'jpg'
    }
  }

  if (
    buffer?.length >= 12 &&
    buffer
      .slice(
        0,
        4
      )
      .toString() ===
        'RIFF' &&
    buffer
      .slice(
        8,
        12
      )
      .toString() ===
        'WEBP'
  ) {
    return {
      mime:
        'image/webp',

      ext:
        'webp'
    }
  }

  return {
    mime:
      'application/octet-stream',

    ext:
      'img'
  }
}

async function fetchWithTimeout(
  url,
  options = {},
  timeoutMs =
    30_000
) {
  const controller =
    new AbortController()

  const timer =
    setTimeout(
      () =>
        controller.abort(
          new Error(
            'IQC_TIMEOUT'
          )
        ),
      timeoutMs
    )

  timer.unref?.()

  try {
    return await fetch(
      url,
      {
        ...options,
        signal:
          controller.signal
      }
    )
  } finally {
    clearTimeout(
      timer
    )
  }
}

async function readLimited(
  response,
  maxBytes
) {
  const declared =
    Number(
      response.headers.get(
        'content-length'
      )
    ) || 0

  if (
    declared >
    maxBytes
  ) {
    throw new Error(
      'IQC_RESULT_TOO_LARGE'
    )
  }

  const buffer =
    Buffer.from(
      await response.arrayBuffer()
    )

  if (
    buffer.length >
    maxBytes
  ) {
    throw new Error(
      'IQC_RESULT_TOO_LARGE'
    )
  }

  return buffer
}

function findImageReference(
  value,
  depth = 0
) {
  if (
    depth > 7 ||
    value == null
  ) {
    return ''
  }

  if (
    typeof value ===
    'string'
  ) {
    const text =
      value.trim()

    if (
      /^https?:\/\//i.test(
        text
      )
    ) {
      return text
    }

    if (
      /^data:image\//i.test(
        text
      )
    ) {
      return text
    }

    return ''
  }

  if (
    Array.isArray(
      value
    )
  ) {
    for (
      const item
      of value
    ) {
      const found =
        findImageReference(
          item,
          depth + 1
        )

      if (found) {
        return found
      }
    }

    return ''
  }

  if (
    typeof value ===
    'object'
  ) {
    const preferred = [
      'result',
      'data',
      'image',
      'output',
      'url',
      'image_url',
      'imageUrl',
      'result_url',
      'resultUrl',
      'src'
    ]

    for (
      const key
      of preferred
    ) {
      if (
        key in value
      ) {
        const found =
          findImageReference(
            value[key],
            depth + 1
          )

        if (found) {
          return found
        }
      }
    }

    for (
      const item
      of Object.values(
        value
      )
    ) {
      const found =
        findImageReference(
          item,
          depth + 1
        )

      if (found) {
        return found
      }
    }
  }

  return ''
}

function dataUriBuffer(
  value
) {
  const match =
    String(
      value ||
      ''
    ).match(
      /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i
    )

  if (!match) {
    return null
  }

  try {
    return {
      mime:
        match[1],

      buffer:
        Buffer.from(
          match[2],
          'base64'
        )
    }
  } catch {
    return null
  }
}

async function uploadOptionalImage(
  buffer
) {
  if (
    !buffer?.length
  ) {
    throw new Error(
      'IQC_IMAGE_EMPTY'
    )
  }

  if (
    buffer.length >
    MAX_INPUT_BYTES
  ) {
    throw new Error(
      'IQC_IMAGE_TOO_LARGE'
    )
  }

  const type =
    detectImage(
      buffer
    )

  if (
    type.mime ===
    'application/octet-stream'
  ) {
    throw new Error(
      'IQC_IMAGE_INVALID'
    )
  }

  const form =
    new FormData()

  form.append(
    'files[]',
    new Blob(
      [buffer],
      {
        type:
          type.mime
      }
    ),
    `nexa-iqc.${type.ext}`
  )

  const response =
    await fetchWithTimeout(
      UGUU_API,
      {
        method:
          'POST',

        body:
          form,

        headers: {
          Accept:
            'application/json'
        }
      },
      UPLOAD_TIMEOUT
    )

  if (
    !response.ok
  ) {
    throw new Error(
      `IQC_UPLOAD_HTTP_${response.status}`
    )
  }

  let data

  try {
    data =
      await response.json()
  } catch {
    throw new Error(
      'IQC_UPLOAD_BAD_JSON'
    )
  }

  const url =
    String(
      data
        ?.files
        ?.[0]
        ?.url ||
      data
        ?.files
        ?.[0]
        ?.download ||
      ''
    ).trim()

  if (
    !/^https?:\/\//i.test(
      url
    )
  ) {
    throw new Error(
      'IQC_UPLOAD_NO_URL'
    )
  }

  return url
}

async function downloadResult(
  reference
) {
  const embedded =
    dataUriBuffer(
      reference
    )

  if (embedded) {
    if (
      embedded.buffer.length >
      MAX_OUTPUT_BYTES
    ) {
      throw new Error(
        'IQC_RESULT_TOO_LARGE'
      )
    }

    return embedded
  }

  const response =
    await fetchWithTimeout(
      reference,
      {
        headers: {
          Accept:
            'image/*,*/*;q=0.8',

          'User-Agent':
            'NEXA-BOT/1.0'
        }
      },
      DOWNLOAD_TIMEOUT
    )

  if (
    !response.ok
  ) {
    throw new Error(
      `IQC_RESULT_HTTP_${response.status}`
    )
  }

  const buffer =
    await readLimited(
      response,
      MAX_OUTPUT_BYTES
    )

  const detected =
    detectImage(
      buffer
    )

  if (
    detected.mime ===
    'application/octet-stream'
  ) {
    throw new Error(
      'IQC_RESULT_NOT_IMAGE'
    )
  }

  return {
    buffer,
    mime:
      detected.mime
  }
}

async function createIqc({
  text,
  imageUrl
}) {
  const endpoint =
    new URL(
      IQC_API
    )

  endpoint.searchParams.set(
    'text',
    text
  )

  endpoint.searchParams.set(
    'time',
    currentWibTime()
  )

  if (imageUrl) {
    endpoint.searchParams.set(
      'image',
      imageUrl
    )
  }

  const response =
    await fetchWithTimeout(
      endpoint,
      {
        headers: {
          Accept:
            'image/*,application/json,text/plain,*/*;q=0.8',

          'User-Agent':
            'NEXA-BOT/1.0'
        }
      },
      API_TIMEOUT
    )

  if (
    !response.ok
  ) {
    throw new Error(
      `IQC_API_HTTP_${response.status}`
    )
  }

  const body =
    await readLimited(
      response,
      MAX_OUTPUT_BYTES
    )

  const direct =
    detectImage(
      body
    )

  if (
    direct.mime !==
    'application/octet-stream'
  ) {
    return {
      buffer:
        body,

      mime:
        direct.mime
    }
  }

  const raw =
    body
      .toString(
        'utf8'
      )
      .trim()

  if (!raw) {
    throw new Error(
      'IQC_API_EMPTY'
    )
  }

  let reference = ''

  try {
    const parsed =
      JSON.parse(
        raw
      )

    reference =
      findImageReference(
        parsed
      )
  } catch {
    reference =
      findImageReference(
        raw
      )
  }

  if (!reference) {
    throw new Error(
      'IQC_API_NO_IMAGE'
    )
  }

  return downloadResult(
    reference
  )
}

function errorText(
  error
) {
  const code =
    String(
      error?.message ||
      error ||
      ''
    )

  if (
    code ===
    'IQC_TIMEOUT' ||
    code.includes(
      'AbortError'
    )
  ) {
    return (
      '⚠️ Server IQC terlalu lama merespons. ' +
      'Coba lagi sebentar.'
    )
  }

  if (
    code ===
    'IQC_IMAGE_TOO_LARGE'
  ) {
    return (
      '⚠️ Foto untuk IQC terlalu besar. ' +
      'Maksimal sekitar 12 MB.'
    )
  }

  if (
    code.startsWith(
      'IQC_UPLOAD_'
    )
  ) {
    return (
      '⚠️ Foto opsional gagal di-upload sementara. ' +
      'Coba lagi atau jalankan IQC tanpa foto.'
    )
  }

  if (
    code.startsWith(
      'IQC_API_HTTP_'
    )
  ) {
    return (
      '⚠️ Endpoint IQC Zyvor sedang error. ' +
      `(${code.replace('IQC_API_HTTP_', 'HTTP ')})`
    )
  }

  return (
    '⚠️ Gagal membuat IQC. ' +
    `(${code.slice(0, 100) || 'UNKNOWN'})`
  )
}

export default {
  name:
    'iqc',

  aliases: [
    'iphoneqc'
  ],

  category:
    'MAKER',

  description:
    'Membuat iPhone quote dark; foto opsional',

  usage:
    '.iqc <teks> (opsional: kirim/reply foto)',

  async run({
    sock,
    msg,
    jid,
    args,
    config
  }) {
    const text =
      (args || [])
        .join(' ')
        .trim()

    if (!text) {
      return sock.sendMessage(
        jid,
        {
          text:
            '📱 *IQC DARK • NEXA*\n\n' +
            `Gunakan:\n*${config?.prefix || '.'}iqc <teks>*\n\n` +
            '🖼️ Foto bersifat opsional.\n' +
            'Kalau mau pakai foto, kirim/reply foto sambil menjalankan command.\n\n' +
            `Contoh:\n*${config?.prefix || '.'}iqc Halo, apa kabar? 😊*`
        },
        {
          quoted:
            msg
        }
      )
    }

    if (
      text.length >
      700
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            '⚠️ Teks IQC maksimal *700 karakter*.'
        },
        {
          quoted:
            msg
        }
      )
    }

    await sock.sendMessage(
      jid,
      {
        react: {
          text:
            '⏳',

          key:
            msg.key
        }
      }
    )

    try {
      const source =
        getMediaSource(
          msg,
          sock
        )

      let imageUrl = ''

      if (
        source?.type ===
        'image'
      ) {
        const buffer =
          await downloadMedia(
            source,
            sock
          )

        imageUrl =
          await uploadOptionalImage(
            buffer
          )
      }

      const result =
        await createIqc({
          text,
          imageUrl
        })

      await sock.sendMessage(
        jid,
        {
          image:
            result.buffer,

          mimetype:
            result.mime,

          caption:
            imageUrl
              ? '📱 IQC Dark • dengan foto'
              : '📱 IQC Dark'
        },
        {
          quoted:
            msg,

          mediaUploadTimeoutMs:
            45_000
        }
      )

      await sock.sendMessage(
        jid,
        {
          react: {
            text:
              '✅',

            key:
              msg.key
          }
        }
      )
    } catch (
      error
    ) {
      console.error(
        '[IQC-ZYVOR]',
        error?.message ||
        error
      )

      await sock.sendMessage(
        jid,
        {
          react: {
            text:
              '❌',

            key:
              msg.key
          }
        }
      )

      await sock.sendMessage(
        jid,
        {
          text:
            errorText(
              error
            )
        },
        {
          quoted:
            msg
        }
      )
    }
  }
}
