import { acquireMaker, react, stage, failureText } from '../lib/maker-runtime.js'
import { fetchBuffered } from '../lib/maker-runtime.js'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  mkdtemp,
  writeFile,
  rm
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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

const REMOVEBG_API =
  'https://v2.api-varhad.my.id/tools/removebg'

const UGUU_API =
  'https://uguu.se/upload'

const execFileAsync =
  promisify(
    execFile
  )

// =====================================
// TIMEOUT FETCH
// =====================================

const fetchTimeout = fetchBuffered

// =====================================
// DETECT IMAGE
// =====================================

function detectImage(
  buffer
) {
  if (
    buffer?.[0] === 0x89 &&
    buffer?.[1] === 0x50 &&
    buffer?.[2] === 0x4e &&
    buffer?.[3] === 0x47
  ) {
    return {
      mime:
        'image/png',
      ext:
        'png'
    }
  }

  if (
    buffer?.[0] === 0xff &&
    buffer?.[1] === 0xd8
  ) {
    return {
      mime:
        'image/jpeg',
      ext:
        'jpg'
    }
  }

  if (
    buffer?.slice(
      0,
      4
    ).toString() === 'RIFF' &&
    buffer?.slice(
      8,
      12
    ).toString() === 'WEBP'
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
      'image/jpeg',
    ext:
      'jpg'
  }
}

// =====================================
// TMPFILES UPLOAD
// =====================================

async function uploadImage(
  buffer
) {
  const type =
    detectImage(
      buffer
    )

  const dir =
    await mkdtemp(
      join(
        tmpdir(),
        'nexa-removebg-'
      )
    )

  const file =
    join(
      dir,
      `input.${type.ext}`
    )

  try {
    await writeFile(
      file,
      buffer
    )

    console.log(
      '🎨 Upload Uguu via curl...'
    )

    const {
      stdout,
      stderr
    } =
      await execFileAsync(
        'curl',
        [
          '-fsS',
          '--http1.1',

          '--connect-timeout',
          '8',

          '--max-time',
          '20',

          '-A',
          'NEXA-BOT/1.0',

          '-F',
          `files[]=@${file};type=${type.mime}`,

          `${UGUU_API}?output=json`
        ],
        {
          timeout:
            25000,

          maxBuffer:
            2 * 1024 * 1024
        }
      )

    const raw =
      String(
        stdout || ''
      ).trim()

    if (!raw) {
      console.error(
        '🎨 Uguu curl stderr:',
        String(
          stderr || ''
        ).slice(
          0,
          800
        )
      )

      throw new Error(
        'UPLOAD_EMPTY_RESPONSE'
      )
    }

    let data

    try {
      data =
        JSON.parse(
          raw
        )
    } catch {
      console.error(
        '🎨 Uguu raw:',
        raw.slice(
          0,
          1000
        )
      )

      throw new Error(
        'UPLOAD_BAD_JSON'
      )
    }

    const url =
      data?.files?.[0]?.url

    if (
      !url ||
      !/^https?:\/\//i.test(
        url
      )
    ) {
      console.error(
        '🎨 Uguu response:',
        JSON.stringify(
          data
        ).slice(
          0,
          1200
        )
      )

      throw new Error(
        'UPLOAD_NO_URL'
      )
    }

    console.log('🎨 Upload Uguu selesai')

    return url
  } catch (err) {
    console.error(
      '🎨 Uguu curl error:',
      err?.code ||
      err?.signal ||
      err?.message ||
      err
    )

    if (err?.stderr) {
      console.error(
        '🎨 curl stderr:',
        String(
          err.stderr
        ).slice(
          0,
          1000
        )
      )
    }

    throw new Error(err?.killed ? 'UPLOAD_TIMEOUT' : 'UPLOAD_CURL_FAILED')
  } finally {
    try {
      await rm(
        dir,
        {
          recursive:
            true,

          force:
            true
        }
      )
    } catch {}
  }
}

// =====================================
// FLEXIBLE RESULT PARSER
// =====================================

function findImageValue(
  value,
  depth = 0
) {
  if (
    depth > 6 ||
    value == null
  ) {
    return null
  }

  if (
    typeof value === 'string'
  ) {
    const text =
      value.trim()

    if (
      /^https?:\/\//i.test(
        text
      ) ||
      /^data:image\//i.test(
        text
      )
    ) {
      return text
    }

    return null
  }

  if (
    Array.isArray(
      value
    )
  ) {
    for (
      const item of value
    ) {
      const found =
        findImageValue(
          item,
          depth + 1
        )

      if (found) {
        return found
      }
    }

    return null
  }

  if (
    typeof value === 'object'
  ) {
    const priority = [
      'result',
      'imageUrl',
      'image_url',
      'url',
      'output',
      'image',
      'data',
      'download',
      'downloadUrl'
    ]

    for (
      const key of priority
    ) {
      if (
        Object.prototype
          .hasOwnProperty
          .call(
            value,
            key
          )
      ) {
        const found =
          findImageValue(
            value[key],
            depth + 1
          )

        if (found) {
          return found
        }
      }
    }


  }

  return null
}

// =====================================
// DATA URL
// =====================================

function dataUrlToBuffer(
  value
) {
  const match =
    String(
      value
    ).match(
      /^data:image\/[^;]+;base64,(.+)$/i
    )

  if (!match) {
    return null
  }

  return Buffer.from(
    match[1],
    'base64'
  )
}

// =====================================
// DOWNLOAD RESULT
// =====================================

async function downloadResult(
  url
) {
  const res =
    await fetchTimeout(
      url,
      {},
      60000
    )

  if (!res.ok) {
    throw new Error(
      `RESULT_HTTP_${res.status}`
    )
  }

  return Buffer.from(
    await res.arrayBuffer()
  )
}

// =====================================
// REMOVE BACKGROUND
// =====================================

async function removeBackground(
  imageUrl
) {
  const api =
    new URL(
      REMOVEBG_API
    )

  api.searchParams.set(
    'imageUrl',
    imageUrl
  )

  const res =
    await fetchTimeout(
      api,
      {
        headers: {
          Accept:
            'application/json,image/*'
        }
      },
      35000
    )

  if (!res.ok) {
    const errorText =
      await res.text()
        .catch(
          () => ''
        )

    console.error(
      `🎨 RemoveBG HTTP ${res.status}:`,
      errorText.slice(
        0,
        1000
      )
    )

    throw new Error(
      `REMOVEBG_HTTP_${res.status}`
    )
  }

  const contentType =
    String(
      res.headers.get(
        'content-type'
      ) || ''
    ).toLowerCase()

  // Kalau Varhad langsung kirim binary,
  // baru kita simpan buffer.
  if (
    contentType.startsWith(
      'image/'
    )
  ) {
    return {
      url:
        null,

      buffer:
        Buffer.from(
          await res.arrayBuffer()
        )
    }
  }

  const raw =
    await res.text()

  let data

  try {
    data =
      JSON.parse(
        raw
      )
  } catch {
    const direct =
      raw.trim()

    if (
      /^https?:\/\//i.test(
        direct
      )
    ) {
      return {
        url:
          direct,

        buffer:
          null
      }
    }

    console.error(
      '🎨 RemoveBG raw:',
      raw.slice(
        0,
        1200
      )
    )

    throw new Error(
      'REMOVEBG_BAD_RESPONSE'
    )
  }

  if (data?.success === false || data?.status === false || data?.error) {
    throw new Error('REMOVEBG_SERVICE_ERROR')
  }

  const result =
    findImageValue(
      data
    )

  if (!result) {
    console.error(
      '🎨 RemoveBG JSON:',
      JSON.stringify(
        data
      ).slice(
        0,
        1500
      )
    )

    throw new Error(
      'REMOVEBG_NO_RESULT'
    )
  }

  if (
    /^https?:\/\//i.test(
      result
    )
  ) {
    return {
      url:
        result,

      buffer:
        null
    }
  }

  if (
    result.startsWith(
      'data:image/'
    )
  ) {
    const buffer =
      dataUrlToBuffer(
        result
      )

    if (!buffer) {
      throw new Error(
        'REMOVEBG_BAD_BASE64'
      )
    }

    return {
      url:
        null,

      buffer
    }
  }

  throw new Error(
    'REMOVEBG_UNKNOWN_RESULT'
  )
}

async function sendRemoveBgResult({
  sock,
  jid,
  msg,
  resultUrl,
  resultBuffer
}) {
  // FAST MODE:
  // kalau API sudah kasih URL,
  // jangan upload ulang ke CDN WhatsApp.
  if (resultUrl) {
    await sock.sendMessage(
      jid,
      {
        text:
          `╭━━〔 🎨 *NEXA MAKER* 〕━━╮\n` +
          `│ Background berhasil dihapus ✨\n` +
          `│\n` +
          `│ 🔗 Hasil:\n` +
          `${resultUrl}\n` +
          `│\n` +
          `│ Link langsung dipakai biar nggak\n` +
          `│ nunggu upload WhatsApp yang lemot 😭\n` +
          `╰━━━━━━━━━━━━━━━━━━━━╯`
      },
      {
        quoted:
          msg
      }
    )

    return
  }

  // Jarang: kalau API kirim binary langsung.
  if (resultBuffer) {
    await sock.sendMessage(
      jid,
      {
        image:
          resultBuffer,

        mimetype:
          detectImage(resultBuffer).mime,

        caption:
          '🎨 Background berhasil dihapus ✨'
      },
      {
        quoted:
          msg,

        // Jangan bikin user nunggu berabad-abad.
        mediaUploadTimeoutMs:
          30000
      }
    )

    return
  }

  throw new Error(
    'EMPTY_REMOVEBG_RESULT'
  )
}

// =====================================
// COMMAND
// =====================================

const REMOVEBG_COST = 3
const REMOVEBG_PREMIUM_COST = 2

export default {
  name: 'removebg',
  aliases: [
    'removebackground',
    'nobg'
  ],
  category: 'MAKER',
  description:
    'Menghapus background foto',
  usage: '.removebg',

  async run({
    sock,
    msg,
    jid,
    config
  }) {
    const source =
      getMediaSource(
        msg,
        sock
      )

    if (
      source?.type !==
      'image'
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            `🎨 Reply foto dengan ${config?.prefix || '.'}removebg.\n` +
            `🎟 Free: ${REMOVEBG_COST} Limit • Premium: ${REMOVEBG_PREMIUM_COST} • Owner: gratis.`
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
            '⏳ Dua proses gambar sedang berjalan. Coba lagi setelah selesai.'
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
          REMOVEBG_COST,
        premiumCost:
          REMOVEBG_PREMIUM_COST,
        globalLimit: 2,
        perOwnerLimit: 1,
        ttlMs:
          5 * 60 * 1000
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
          jid
        })
      }

      return sock.sendMessage(
        jid,
        {
          text:
            resourceBusyText(
              job.busy,
              'proses maker'
            )
        },
        {
          quoted: msg
        }
      )
    }

    let delivered = false

    react(
      sock,
      jid,
      msg,
      '⏳'
    )

    try {
      const buffer =
        await stage(
          'removebg/download',
          () =>
            downloadMedia(
              source,
              sock
            )
        )

      const imageUrl =
        await stage(
          'removebg/upload',
          () =>
            uploadImage(
              buffer
            )
        )

      const result =
        await stage(
          'removebg/api',
          () =>
            removeBackground(
              imageUrl
            )
        )

      if (
        !result.url &&
        !result.buffer?.length
      ) {
        throw new Error(
          'REMOVEBG_EMPTY_RESULT'
        )
      }

      await stage(
        'removebg/send',
        () =>
          sendRemoveBgResult({
            sock,
            jid,
            msg,
            resultUrl:
              result.url,
            resultBuffer:
              result.buffer
          })
      )

      delivered = true

      react(
        sock,
        jid,
        msg,
        '✅'
      )
    } catch (err) {
      const refund =
        !delivered
          ? refundBilledJob(
              job,
              'removebg_failed'
            )
          : {
              refunded: false
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
            `⚠️ RemoveBG gagal (${err.makerStage || 'removebg'}).\n` +
            `${failureText(err)}` +
            (
              refund.refunded
                ? `\n🎟 ${refund.cost} Limit dikembalikan.`
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
