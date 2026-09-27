// NEXA TEXT2IMG V2 + V1 FALLBACK V1
import {
  acquireMaker,
  react,
  stage,
  fetchBuffered
} from '../lib/maker-runtime.js'

import {
  beginBilledJob,
  refundBilledJob
} from '../lib/jobBilling.js'

import {
  resourceBusyText
} from '../lib/resourceGate.js'

import {
  sendLimitEmpty
} from '../lib/limitGate.js'

const T2I2_COST = 4

const FGSI_BASE =
  'https://fgsi.dpdns.org'

const DEFAULT_RESOLUTION =
  '512x768'

const MAX_OUTPUT_BYTES =
  20 * 1024 * 1024

function parseInput(args) {
  const raw =
    Array.isArray(args)
      ? args.join(' ').trim()
      : ''

  if (!raw) {
    return null
  }

  let prompt = raw
  let negativePrompt = ''
  let resolution = DEFAULT_RESOLUTION

  if (raw.includes('|')) {
    const parts = raw
      .split('|')
      .map(part =>
        String(part || '').trim()
      )

    prompt = parts[0] || ''
    negativePrompt = parts[1] || ''
    resolution =
      parts[2] ||
      DEFAULT_RESOLUTION
  } else {
    const negMatch =
      raw.match(
        /--neg(?:ative)?\s+([\s\S]*?)(?=\s+--res(?:olution)?\s+|$)/i
      )

    const resMatch =
      raw.match(
        /--res(?:olution)?\s+([^\s]+)/i
      )

    if (negMatch) {
      negativePrompt =
        String(
          negMatch[1] || ''
        ).trim()
    }

    if (resMatch) {
      resolution =
        String(
          resMatch[1] || ''
        ).trim()
    }

    prompt = raw
      .replace(
        /\s+--neg(?:ative)?\s+[\s\S]*?(?=\s+--res(?:olution)?\s+|$)/i,
        ''
      )
      .replace(
        /\s+--res(?:olution)?\s+([^\s]+)/i,
        ''
      )
      .trim()
  }

  if (!prompt) {
    return null
  }

  return {
    prompt,
    negativePrompt,
    resolution:
      normalizeResolution(
        resolution
      )
  }
}

function normalizeResolution(value) {
  const text =
    String(value || '')
      .trim()
      .toLowerCase()

  const aliases = {
    square: '768x768',
    portrait: '512x768',
    tall: '512x768',
    landscape: '768x512',
    wide: '768x512'
  }

  if (aliases[text]) {
    return aliases[text]
  }

  if (/^\d{3,4}x\d{3,4}$/.test(text)) {
    return text
  }

  return DEFAULT_RESOLUTION
}

function isImageBuffer(buffer) {
  if (!buffer?.length) {
    return false
  }

  if (
    buffer[0] === 0xff &&
    buffer[1] === 0xd8
  ) {
    return true
  }

  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return true
  }

  return (
    buffer.slice(0, 4)
      .toString() === 'RIFF' &&
    buffer.slice(8, 12)
      .toString() === 'WEBP'
  )
}

function findOutput(value, depth = 0) {
  if (
    depth > 7 ||
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

    if (
      /^[A-Za-z0-9+/=\r\n]+$/.test(text) &&
      text.length > 300
    ) {
      return (
        'data:image/png;base64,' +
        text.replace(/\s+/g, '')
      )
    }

    return null
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found =
        findOutput(
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
    const keys = [
      'result',
      'data',
      'output',
      'image',
      'images',
      'url',
      'src',
      'href',
      'image_url',
      'imageUrl',
      'result_url',
      'resultUrl',
      'download_url',
      'downloadUrl',
      'b64_json',
      'base64',
      'base64Image',
      'image_base64'
    ]

    for (const key of keys) {
      if (!(key in value)) {
        continue
      }

      const found =
        findOutput(
          value[key],
          depth + 1
        )

      if (found) {
        return found
      }
    }

    for (const key of Object.keys(value)) {
      const found =
        findOutput(
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

async function outputToBuffer(outputRef) {
  if (
    /^data:image\//i.test(outputRef)
  ) {
    const base64 =
      outputRef.split(',', 2)[1] || ''

    const buffer =
      Buffer.from(
        base64,
        'base64'
      )

    if (!isImageBuffer(buffer)) {
      throw new Error(
        'FGSI_T2I_BAD_IMAGE'
      )
    }

    return buffer
  }

  const fileRes =
    await fetchBuffered(
      outputRef,
      {},
      120000,
      MAX_OUTPUT_BYTES
    )

  const buffer =
    Buffer.from(
      await fileRes.arrayBuffer()
    )

  if (!isImageBuffer(buffer)) {
    throw new Error(
      'FGSI_T2I_BAD_IMAGE'
    )
  }

  return buffer
}

async function requestGenerator({
  version,
  prompt,
  negativePrompt = '',
  resolution = DEFAULT_RESOLUTION
}) {
  const key =
    String(
      process.env.FGSI_API_KEY || ''
    ).trim()

  if (!key) {
    throw new Error(
      'FGSI_KEY_MISSING'
    )
  }

  const endpoint =
    version === 'v1'
      ? '/api/ai/text2img/v1'
      : '/api/ai/text2img/v2'

  const url = new URL(
    endpoint,
    FGSI_BASE
  )

  url.searchParams.set(
    'apikey',
    key
  )
  url.searchParams.set(
    'prompt',
    prompt
  )

  if (version === 'v2') {
    url.searchParams.set(
      'negativePrompt',
      negativePrompt
    )
    url.searchParams.set(
      'resolution',
      resolution
    )
  }

  const res =
    await fetch(url, {
      method: 'GET',
      headers: {
        accept:
          'application/json, image/*, text/plain;q=0.8, */*;q=0.5',
        'User-Agent':
          'NEXA-BOT/1.0'
      }
    })

  const type =
    String(
      res.headers.get(
        'content-type'
      ) || ''
    ).toLowerCase()

  if (type.startsWith('image/')) {
    const buffer =
      Buffer.from(
        await res.arrayBuffer()
      )

    if (!res.ok) {
      throw new Error(
        `FGSI_T2I_${version.toUpperCase()}_HTTP_${res.status}`
      )
    }

    if (!isImageBuffer(buffer)) {
      throw new Error(
        'FGSI_T2I_BAD_IMAGE'
      )
    }

    return {
      buffer,
      engine:
        version.toUpperCase(),
      resolution:
        version === 'v2'
          ? resolution
          : null
    }
  }

  const raw =
    await res.text()

  let parsed = null

  try {
    parsed = JSON.parse(raw)
  } catch {}

  const message =
    String(
      parsed?.message ||
      parsed?.error ||
      parsed?.msg ||
      ''
    ).trim()

  if (
    /failed\s+to\s+get\s+userkey/i.test(
      message
    )
  ) {
    const error =
      new Error(
        'FGSI_USERKEY_FAILED'
      )

    error.fgsiMessage =
      message

    throw error
  }

  if (!res.ok) {
    console.error(
      `[T2I2:${version}] error raw:`,
      raw.slice(0, 800)
    )

    throw new Error(
      `FGSI_T2I_${version.toUpperCase()}_HTTP_${res.status}`
    )
  }

  if (
    parsed?.status === false ||
    parsed?.success === false
  ) {
    const error =
      new Error(
        `FGSI_T2I_${version.toUpperCase()}_API_ERROR`
      )

    error.fgsiMessage =
      message

    throw error
  }

  let outputRef = null

  if (parsed) {
    outputRef =
      findOutput(parsed)
  } else {
    const plain =
      raw.trim()

    if (
      /^https?:\/\//i.test(plain) ||
      /^data:image\//i.test(plain)
    ) {
      outputRef =
        plain
    }
  }

  if (!outputRef) {
    console.error(
      `[T2I2:${version}] response:`,
      raw.slice(0, 1000)
    )

    throw new Error(
      `FGSI_T2I_${version.toUpperCase()}_OUTPUT_MISSING`
    )
  }

  const buffer =
    await outputToBuffer(
      outputRef
    )

  return {
    buffer,
    engine:
      version.toUpperCase(),
    resolution:
      version === 'v2'
        ? resolution
        : null
  }
}

async function generateImage(input) {
  try {
    return await requestGenerator({
      version: 'v2',
      ...input
    })
  } catch (error) {
    if (
      String(
        error?.message || ''
      ) !== 'FGSI_USERKEY_FAILED'
    ) {
      throw error
    }

    console.warn(
      '[T2I2] V2 gagal dapet userKey -> fallback ke V1'
    )

    try {
      const fallback =
        await requestGenerator({
          version: 'v1',
          prompt:
            input.prompt
        })

      return {
        ...fallback,
        fallback: true,
        fallbackReason:
          'FGSI_USERKEY_FAILED'
      }
    } catch (fallbackError) {
      fallbackError.v2Error =
        error

      throw fallbackError
    }
  }
}

function failText(err) {
  const code =
    String(
      err?.code ||
      err?.message ||
      ''
    )

  if (/FGSI_KEY_MISSING/.test(code)) {
    return (
      '🔑 API key FGSI belum kepasang, njir.\n' +
      'Set *FGSI_API_KEY* dulu di server.'
    )
  }

  if (/403/.test(code)) {
    return (
      '🚫 FGSI nolak request-nya.\n' +
      'Cek API key atau limit akun dulu.'
    )
  }

  if (/429/.test(code)) {
    return (
      '😵 Kena rate limit dulu kayaknya.\n' +
      'Tunggu bentar terus coba lagi.'
    )
  }

  if (/FGSI_USERKEY_FAILED/.test(code)) {
    return (
      '🗿 V2 kehilangan kunci rumah, dan fallback V1 juga nggak nyelametin.\n' +
      'Backend FGSI lagi apes kayaknya 😭'
    )
  }

  if (/API_ERROR/.test(code)) {
    const detail =
      String(
        err?.fgsiMessage || ''
      ).trim()

    return (
      '🗿 AI-nya nolak request.\n' +
      (
        detail
          ? `Pesannya: *${detail.slice(0, 180)}*`
          : 'Coba ubah prompt terus ulang lagi.'
      )
    )
  }

  if (
    /OUTPUT_MISSING|BAD_IMAGE/.test(code)
  ) {
    return (
      '💀 AI-nya ngasih hasil yang aneh.\n' +
      'Coba lagi bentar.'
    )
  }

  return (
    '💀 Dua-duanya lagi nggak mood bikin gambar.\n' +
    'Coba lagi bentar atau ganti prompt 😭'
  )
}

function usageText(prefix) {
  return (
    '✦ *NEXA • TEXT2IMG V2*\n\n' +
    '🗿 Prompt-nya mana? AI bukan cenayang 😭\n\n' +
    '*Contoh:*\n' +
    `${prefix}text2imgv2 cewek anime pakai hoodie hitam\n` +
    `${prefix}text2imgv2 kota cyberpunk malam | blur, low quality | portrait\n` +
    `${prefix}text2imgv2 kucing astronot --neg blur --res landscape\n\n` +
    '📐 Resolusi: *square / portrait / landscape*\n' +
    '♻️ Kalau V2 ngambek karena userKey, otomatis dicoba pakai V1.'
  )
}

export default {
  name: 'text2imgv2',
  aliases: [
    'text2imagev2',
    'txt2imgv2',
    't2i2',
    'imagine2'
  ],
  category: 'PREMIUM',
  description:
    'Bikin gambar dari teks (V2 + fallback V1)',
  usage:
    '.text2imgv2 <prompt>',
  premiumOnly: true,

  async run({
    sock,
    msg,
    jid,
    args,
    config
  }) {
    const input =
      parseInput(args)

    if (!input) {
      return sock.sendMessage(
        jid,
        {
          text:
            usageText(
              config?.prefix || '.'
            )
        },
        {
          quoted: msg
        }
      )
    }

    const localRelease =
      acquireMaker()

    if (!localRelease) {
      return sock.sendMessage(
        jid,
        {
          text:
            '⏳ Pabrik gambar lagi penuh. Sabar bentar njir 😭'
        },
        {
          quoted: msg
        }
      )
    }

    const job =
      beginBilledJob({
        msg,
        jid,
        kind: 'maker',
        normalCost:
          T2I2_COST,
        premiumCost:
          T2I2_COST,
        globalLimit: 1,
        perOwnerLimit: 1,
        ttlMs:
          7 * 60 * 1000
      })

    if (!job.ok) {
      localRelease()

      if (
        job.reason === 'LIMIT'
      ) {
        return sendLimitEmpty({
          sock,
          msg,
          jid
        })
      }

      return sock.sendMessage(
        jid,
        {
          text:
            resourceBusyText(
              job.busy,
              'proses gambar AI'
            )
        },
        {
          quoted: msg
        }
      )
    }

    let result
    let delivered = false

    react(
      sock,
      jid,
      msg,
      '🎨'
    )

    try {
      await sock.sendMessage(
        jid,
        {
          text:
            '✦ *NEXA • TEXT2IMG V2*\n\n' +
            '🗿 Prompt-nya gue lempar ke pabrik gambar dulu...\n' +
            'Kalau V2 kehilangan kunci rumah, gue suruh V1 gantian kerja 😭\n\n' +
            `📝 *Prompt:* ${input.prompt.slice(0, 120)}${input.prompt.length > 120 ? '…' : ''}\n` +
            `📐 *Target:* ${input.resolution}`
        },
        {
          quoted: msg
        }
      )

      result =
        await stage(
          'text2imgv2/fgsi',
          () => generateImage(input)
        )

      const engineText =
        result.fallback
          ? 'V1 • fallback otomatis'
          : 'V2'

      await stage(
        'text2imgv2/send',
        () => sock.sendMessage(
          jid,
          {
            image:
              result.buffer,
            caption:
              '✦ *NEXA • TEXT2IMG*\n\n' +
              '✅ Jadi juga akhirnya 😭\n\n' +
              `📝 *Prompt:* ${input.prompt.slice(0, 160)}${input.prompt.length > 160 ? '…' : ''}\n` +
              `🧠 *Engine:* ${engineText}\n` +
              (
                result.fallback
                  ? '🗿 V2 tadi kehilangan userKey, jadi V1 yang turun tangan.\n'
                  : `📐 *Resolusi:* ${input.resolution}\n`
              ) +
              `🎟 *Biaya:* ${job.cost ? `${job.cost} Limit` : 'Gratis • Owner 👑'}`
          },
          {
            quoted: msg,
            mediaUploadTimeoutMs:
              120000
          }
        )
      )

      delivered = true

      react(
        sock,
        jid,
        msg,
        '✅'
      )
    } catch (error) {
      const refund =
        !delivered
          ? refundBilledJob(
              job,
              'text2imgv2_failed'
            )
          : {
              refunded: false
            }

      console.error(
        '[TEXT2IMGV2]',
        error?.stack || error
      )

      react(
        sock,
        jid,
        msg,
        '❌'
      )

      await sock.sendMessage(
        jid,
        {
          text:
            '✦ *NEXA • TEXT2IMG V2*\n\n' +
            failText(error) +
            (
              refund.refunded
                ? `\n\n🎟 ${refund.cost} Limit dikembalikan.`
                : ''
            )
        },
        {
          quoted: msg
        }
      )
    } finally {
      job.release()
      localRelease()
    }
  }
}
