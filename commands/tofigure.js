import {
  acquireMaker,
  react,
  stage,
  fetchBuffered
} from '../lib/maker-runtime.js'

import {
  getMediaSource,
  downloadMedia
} from '../lib/maker-media.js'

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

const TOFIGURE_COST = 4

const UGUU_API =
  'https://uguu.se/upload'

const FGSI_BASE =
  'https://fgsi.dpdns.org'

const MAX_INPUT_BYTES =
  16 * 1024 * 1024

const MAX_OUTPUT_BYTES =
  20 * 1024 * 1024

const POLL_INTERVAL =
  3000

const POLL_TIMEOUT =
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
    mime: 'image/jpeg',
    ext: 'jpg'
  }
}

function sleep(ms) {
  return new Promise(
    resolve => setTimeout(resolve, ms)
  )
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
    `nexa-tofigure.${type.ext}`
  )

  const res =
    await fetch(
      `${UGUU_API}?output=json`,
      {
        method: 'POST',
        headers: {
          'User-Agent':
            'NEXA-BOT/1.0'
        },
        body: form
      }
    )

  if (!res.ok) {
    throw new Error(
      `UPLOAD_HTTP_${res.status}`
    )
  }

  const raw =
    await res.text()

  let data

  try {
    data = JSON.parse(raw)
  } catch {
    console.error(
      '[TOFIGURE] Uguu raw:',
      raw.slice(0, 500)
    )

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
    console.error(
      '[TOFIGURE] Uguu response:',
      JSON.stringify(data)
        .slice(0, 800)
    )

    throw new Error(
      'UPLOAD_NO_URL'
    )
  }

  return url
}

function getPollUrl(data) {
  const direct =
    data?.data?.pollUrl ||
    data?.pollUrl ||
    data?.result?.pollUrl ||
    data?.data?.poll_url ||
    data?.poll_url

  return String(direct || '')
    .trim()
}

function getResultUrl(data) {
  const direct =
    data?.data?.result?.result_url ||
    data?.data?.result?.url ||
    data?.data?.result_url ||
    data?.result?.result_url ||
    data?.result?.url ||
    data?.url

  return String(direct || '')
    .trim()
}

function getStatus(data) {
  return String(
    data?.data?.status ||
    data?.status ||
    ''
  ).trim()
}

async function createTask(sourceUrl) {
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
    '/api/ai/image/img2figure',
    FGSI_BASE
  )

  url.searchParams.set(
    'apikey',
    key
  )
  url.searchParams.set(
    'url',
    sourceUrl
  )

  const res =
    await fetch(url, {
      method: 'GET',
      headers: {
        'Accept':
          'application/json',
        'User-Agent':
          'NEXA-BOT/1.0'
      }
    })

  if (!res.ok) {
    throw new Error(
      `FGSI_HTTP_${res.status}`
    )
  }

  const raw =
    await res.text()

  let data

  try {
    data = JSON.parse(raw)
  } catch {
    console.error(
      '[TOFIGURE] createTask raw:',
      raw.slice(0, 500)
    )

    throw new Error(
      'FGSI_BAD_JSON'
    )
  }

  const pollUrl =
    getPollUrl(data)

  if (!pollUrl) {
    console.error(
      '[TOFIGURE] createTask response:',
      JSON.stringify(data)
        .slice(0, 1000)
    )

    throw new Error(
      'FGSI_NO_POLL_URL'
    )
  }

  return pollUrl
}

async function pollTask(pollUrl) {
  const started =
    Date.now()

  while (
    Date.now() - started <
    POLL_TIMEOUT
  ) {
    const res =
      await fetch(pollUrl, {
        method: 'GET',
        headers: {
          'Accept':
            'application/json',
          'User-Agent':
            'NEXA-BOT/1.0'
        }
      })

    if (!res.ok) {
      throw new Error(
        `FGSI_POLL_HTTP_${res.status}`
      )
    }

    const raw =
      await res.text()

    let data

    try {
      data = JSON.parse(raw)
    } catch {
      console.error(
        '[TOFIGURE] poll raw:',
        raw.slice(0, 500)
      )

      throw new Error(
        'FGSI_POLL_BAD_JSON'
      )
    }

    const status =
      getStatus(data)
        .toLowerCase()

    if (
      status === 'success' ||
      status === 'completed' ||
      status === 'done'
    ) {
      const resultUrl =
        getResultUrl(data)

      if (!resultUrl) {
        throw new Error(
          'FGSI_RESULT_MISSING'
        )
      }

      return resultUrl
    }

    if (
      status === 'failed' ||
      status === 'error' ||
      status === 'cancelled'
    ) {
      throw new Error(
        'FGSI_PROCESS_FAILED'
      )
    }

    await sleep(
      POLL_INTERVAL
    )
  }

  throw new Error(
    'FGSI_TIMEOUT'
  )
}

async function toFigure(buffer) {
  if (!buffer?.length) {
    throw new Error(
      'EMPTY_IMAGE'
    )
  }

  if (
    buffer.length >
    MAX_INPUT_BYTES
  ) {
    throw new Error(
      'MEDIA_TOO_LARGE'
    )
  }

  const uploaded =
    await uploadImage(buffer)

  const pollUrl =
    await createTask(uploaded)

  const resultUrl =
    await pollTask(pollUrl)

  const response =
    await fetchBuffered(
      resultUrl,
      {},
      120000,
      MAX_OUTPUT_BYTES
    )

  const output = Buffer.from(
    await response.arrayBuffer()
  )

  if (!output.length) {
    throw new Error(
      'FGSI_OUTPUT_EMPTY'
    )
  }

  return output
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

  if (/FGSI_TIMEOUT/.test(code)) {
    return (
      '⏳ Figure-nya kelamaan nongol.\n' +
      'AI-nya lagi lelet, coba lagi bentar lagi 😭'
    )
  }

  if (/FGSI_PROCESS_FAILED/.test(code)) {
    return (
      '💀 Figure-nya gagal lahir.\n' +
      'Coba fotonya ganti atau ulang lagi nanti.'
    )
  }

  if (/UPLOAD_|FGSI_BAD_JSON|FGSI_NO_POLL_URL|FGSI_RESULT_MISSING|FGSI_OUTPUT_EMPTY/.test(code)) {
    return (
      '🗿 Prosesnya nyangkut di jalan.\n' +
      'Coba lagi bentar lagi ya.'
    )
  }

  if (/FGSI_HTTP_403|FGSI_POLL_HTTP_403|403/.test(code)) {
    return (
      '🚫 FGSI nolak request-nya.\n' +
      'Cek API key atau limit akun dulu.'
    )
  }

  if (/HTTP_429|429/.test(code)) {
    return (
      '😵 Request lagi rame.\n' +
      'Kena limit dulu kayaknya, tunggu bentar ya.'
    )
  }

  if (/TOO_LARGE|PIXEL_LIMIT/.test(code)) {
    return (
      '🗿 Gambarnya kegedean.\n' +
      'Coba kirim yang lebih kecil dikit.'
    )
  }

  if (/REUPLOAD|404|410/.test(code)) {
    return (
      '📸 Medianya udah kabur.\n' +
      'Reply/kirim ulang fotonya terus coba lagi.'
    )
  }

  return (
    '💀 Yah gagal njir.\n' +
    'Coba ulang lagi bentar.'
  )
}

export default {
  name: 'tofigure',
  aliases: [
    'figure',
    'figurine'
  ],
  category: 'PREMIUM',
  description:
    'Ubah foto jadi figure AI',
  usage:
    '.tofigure (reply foto)',
  premiumOnly: true,

  async run({
    sock,
    msg,
    jid
  }) {
    const release =
      acquireMaker()

    if (!release) {
      await sock.sendMessage(
        jid,
        {
          text:
            resourceBusyText(
              'maker'
            )
        },
        {
          quoted: msg
        }
      )
      return
    }

    const bill =
      beginBilledJob({
        jid,
        key: 'premiumLimit',
        amount:
          TOFIGURE_COST,
        label: 'tofigure'
      })

    if (
      !bill.allowed
    ) {
      release()
      await sendLimitEmpty({
        sock,
        jid,
        msg,
        mode:
          'premiumLimit'
      })
      return
    }

    let delivered = false

    try {
      const source =
        getMediaSource(msg)

      if (!source) {
        throw new Error(
          'REUPLOAD_IMAGE'
        )
      }

      const mime = String(
        source?.mimetype || ''
      )

      if (
        !mime.startsWith(
          'image/'
        )
      ) {
        await sock.sendMessage(
          jid,
          {
            text:
              '✦ *NEXA • TO FIGURE*\n\n' +
              '🗿 Mana fotonya?\n' +
              'Reply atau kirim gambar bareng *.tofigure*.'
          },
          {
            quoted: msg
          }
        )
        refundBilledJob(bill)
        return
      }

      react(
        sock,
        jid,
        msg,
        '🎎'
      )

      await sock.sendMessage(
        jid,
        {
          text:
            '✦ *NEXA • TO FIGURE*\n\n' +
            '🗿 Fotonya gue ambil dulu...\n' +
            'Lagi gue sulap jadi figure, jangan ditagih dulu 😭'
        },
        {
          quoted: msg
        }
      )

      const buffer =
        await stage(
          'tofigure/download',
          () => downloadMedia(source)
        )

      const result =
        await stage(
          'tofigure/fgsi',
          () => toFigure(buffer)
        )

      await sock.sendMessage(
        jid,
        {
          image: result,
          caption:
            '✦ *NEXA • TO FIGURE*\n\n' +
            '✅ Nah jadi juga 😭\n\n' +
            '🗿 Sekarang fotonya resmi naik pangkat\n' +
            'jadi figure buat pajangan lemari.'
        },
        {
          quoted: msg,
          mediaUploadTimeoutMs:
            120000
        }
      )

      react(
        sock,
        jid,
        msg,
        '✅'
      )

      delivered = true
    } catch (error) {
      console.error(
        '[TOFIGURE]',
        error?.stack || error
      )

      if (!delivered) {
        refundBilledJob(bill)
      }

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
            '✦ *NEXA • TO FIGURE*\n\n' +
            failText(error)
        },
        {
          quoted: msg
        }
      )
    } finally {
      release()
    }
  }
}
