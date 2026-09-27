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
  '1024x1024'

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
        String(part || '')
          .trim()
      )
      .filter(Boolean)

    prompt = parts[0] || ''
    negativePrompt = parts[1] || ''
    resolution = parts[2] || DEFAULT_RESOLUTION
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

  resolution = normalizeResolution(resolution)

  return {
    prompt,
    negativePrompt,
    resolution
  }
}

function normalizeResolution(value) {
  const text =
    String(value || '')
      .trim()
      .toLowerCase()

  if (!text) {
    return DEFAULT_RESOLUTION
  }

  const aliases = {
    square: '1024x1024',
    portrait: '1024x1536',
    tall: '1024x1536',
    landscape: '1536x1024',
    wide: '1536x1024'
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

  if (
    buffer.slice(0, 4)
      .toString() === 'RIFF' &&
    buffer.slice(8, 12)
      .toString() === 'WEBP'
  ) {
    return true
  }

  return false
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

    if (/^[A-Za-z0-9+/=\r\n]+$/.test(text) && text.length > 200) {
      return `data:image/png;base64,${text.replace(/\s+/g, '')}`
    }

    return null
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found =
        findOutput(item, depth + 1)
      if (found) {
        return found
      }
    }
    return null
  }

  if (typeof value === 'object') {
    const keys = [
      'result', 'data', 'output', 'image', 'images',
      'url', 'src', 'href', 'image_url', 'imageUrl',
      'result_url', 'resultUrl', 'download_url', 'downloadUrl',
      'b64_json', 'base64', 'base64Image', 'image_base64'
    ]

    for (const key of keys) {
      if (key in value) {
        const found =
          findOutput(value[key], depth + 1)
        if (found) {
          return found
        }
      }
    }

    for (const key of Object.keys(value)) {
      const found =
        findOutput(value[key], depth + 1)
      if (found) {
        return found
      }
    }
  }

  return null
}

async function generateImage({
  prompt,
  negativePrompt,
  resolution
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

  const url = new URL(
    '/api/ai/text2img/v2',
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
  url.searchParams.set(
    'negativePrompt',
    negativePrompt
  )
  url.searchParams.set(
    'resolution',
    resolution
  )

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
      res.headers.get('content-type') || ''
    ).toLowerCase()

  if (
    type.startsWith('image/')
  ) {
    const buffer = Buffer.from(
      await res.arrayBuffer()
    )

    if (!isImageBuffer(buffer)) {
      throw new Error(
        'FGSI_T2I_BAD_IMAGE'
      )
    }

    return {
      buffer,
      responseType: type,
      resolution
    }
  }

  const raw =
    await res.text()

  if (!res.ok) {
    console.error(
      '[T2I2] error raw:',
      raw.slice(0, 800)
    )

    throw new Error(
      `FGSI_T2I_HTTP_${res.status}`
    )
  }

  let outputRef = null
  let parsed = null

  try {
    parsed = JSON.parse(raw)

    if (
      parsed?.status === false ||
      parsed?.success === false
    ) {
      const detail = String(
        parsed?.message ||
        parsed?.error ||
        parsed?.msg ||
        ''
      ).trim()

      throw new Error(
        detail
          ? `FGSI_T2I_API_ERROR:${detail}`
          : 'FGSI_T2I_API_ERROR'
      )
    }

    outputRef =
      findOutput(parsed)
  } catch (error) {
    if (
      String(error?.message || '')
        .startsWith('FGSI_T2I_API_ERROR')
    ) {
      throw error
    }

    const plain = raw.trim()

    if (
      /^https?:\/\//i.test(plain) ||
      /^data:image\//i.test(plain)
    ) {
      outputRef = plain
    } else {
      console.error(
        '[T2I2] raw response:',
        plain.slice(0, 800)
      )

      throw new Error(
        'FGSI_T2I_BAD_JSON'
      )
    }
  }

  if (!outputRef) {
    console.error(
      '[T2I2] parsed response:',
      JSON.stringify(parsed)
        .slice(0, 1000)
    )

    throw new Error(
      'FGSI_T2I_OUTPUT_MISSING'
    )
  }

  if (
    /^data:image\//i.test(outputRef)
  ) {
    const base64 =
      outputRef.split(',', 2)[1] || ''

    const buffer = Buffer.from(
      base64,
      'base64'
    )

    if (!isImageBuffer(buffer)) {
      throw new Error(
        'FGSI_T2I_BAD_IMAGE'
      )
    }

    return {
      buffer,
      responseType:
        outputRef.slice(5, outputRef.indexOf(';')) || 'image/png',
      resolution
    }
  }

  const fileRes =
    await fetchBuffered(
      outputRef,
      {},
      120000,
      MAX_OUTPUT_BYTES
    )

  const buffer = Buffer.from(
    await fileRes.arrayBuffer()
  )

  if (!isImageBuffer(buffer)) {
    throw new Error(
      'FGSI_T2I_BAD_IMAGE'
    )
  }

  return {
    buffer,
    responseType:
      String(fileRes.headers.get('content-type') || '') || 'image/png',
    resolution
  }
}

function failText(err) {
  const code = String(
    err?.code ||
    err?.message ||
    ''
  )

  if (/FGSI_KEY_MISSING/.test(code)) {
    return (
      '🔑 API key FGSI belum dipasang, njir.\n' +
      'Set dulu *FGSI_API_KEY* di server.'
    )
  }

  if (/FGSI_T2I_HTTP_403|403/.test(code)) {
    return (
      '🚫 FGSI nolak request-nya.\n' +
      'Cek API key atau limit akun dulu.'
    )
  }

  if (/429/.test(code)) {
    return (
      '😵 Lagi rame, kena limit dulu kayaknya.\n' +
      'Coba lagi bentar ya.'
    )
  }

  if (/FGSI_T2I_API_ERROR/.test(code)) {
    return (
      '🗿 Prompt-nya ditolak atau AI-nya ngambek.\n' +
      'Coba ubah prompt / negative prompt-nya.'
    )
  }

  if (/FGSI_T2I_BAD_JSON|FGSI_T2I_OUTPUT_MISSING|FGSI_T2I_BAD_IMAGE/.test(code)) {
    return (
      '💀 Hasil dari AI-nya aneh.\n' +
      'Server-nya ngasih respons yang nggak kebaca.'
    )
  }

  return (
    '💀 Gagal bikin gambarnya, njir.\n' +
    'Coba lagi bentar atau ganti prompt.'
  )
}

function usageText(prefix) {
  return (
    '✦ *NEXA • TEXT2IMG V2*\n\n' +
    '🗿 Mau bikin gambar tapi prompt-nya mana?\n\n' +
    '*Contoh:*\n' +
    `${prefix}text2imgv2 cewek anime pakai hoodie hitam\n` +
    `${prefix}text2imgv2 kota cyberpunk malam hari | blur, low quality | 1024x1536\n` +
    `${prefix}text2imgv2 kucing astronot --neg blur, bad hands --res 1536x1024\n\n` +
    '📐 Resolusi alias: *square*, *portrait*, *landscape*\n' +
    '👑 Owner: gratis • ⭐ Premium: limit premium'
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
    'Bikin gambar dari teks (FGSI V2)',
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
            '⏳ Mesin gambar lagi sibuk. Sabar bentar njir 😭'
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
        job.reason ===
        'LIMIT'
      ) {
        return sendLimitEmpty({
          sock,
          msg,
          jid,
          mode:
            'premiumLimit'
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
            '🗿 Prompt-nya gue lempar dulu ke pabrik gambar...\n' +
            'Jangan ditanya kapan jadi, AI-nya lagi kerja 😭\n\n' +
            `📝 *Prompt:* ${input.prompt.slice(0, 120)}${input.prompt.length > 120 ? '…' : ''}\n` +
            `📐 *Resolusi:* ${input.resolution}`
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

      await stage(
        'text2imgv2/send',
        () => sock.sendMessage(
          jid,
          {
            image:
              result.buffer,
            caption:
              '✦ *NEXA • TEXT2IMG V2*\n\n' +
              '✅ Jadi juga akhirnya 😭\n\n' +
              `📝 *Prompt:* ${input.prompt.slice(0, 160)}${input.prompt.length > 160 ? '…' : ''}\n` +
              `📐 *Resolusi:* ${result.resolution}\n` +
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
