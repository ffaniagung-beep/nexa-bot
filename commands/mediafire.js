import {
  createWriteStream
} from 'node:fs'

import {
  mkdtemp,
  rm,
  stat
} from 'node:fs/promises'

import {
  tmpdir
} from 'node:os'

import {
  join
} from 'node:path'

import http from 'node:http'
import https from 'node:https'

import {
  Transform
} from 'node:stream'

import {
  pipeline
} from 'node:stream/promises'

import {
  beginBilledJob,
  adjustBilledJob,
  refundBilledJob
} from '../lib/jobBilling.js'

import {
  getDownloadLimitCost,
  ensureDiskHeadroom,
  resourceBusyText,
  formatResourceBytes
} from '../lib/resourceGate.js'

import {
  sendLimitEmpty
} from '../lib/limitGate.js'

const API =
  'https://api.alwayscodex.eu.cc/api/downloader/mediafirev2'

const API_TIMEOUT =
  45_000

const CONNECT_TIMEOUT =
  30_000

const SOCKET_IDLE_TIMEOUT =
  90_000

const UPLOAD_TIMEOUT =
  20 * 60 * 1000

const MAX_REDIRECTS =
  8

// NEXA MEDIAFIRE 1GB HARD LIMIT V1
const MAX_MEDIAFIRE_BYTES =
  1024 * 1024 * 1024

function createMediaFireSizeGuard() {
  let total = 0

  return new Transform({
    transform(
      chunk,
      encoding,
      callback
    ) {
      total +=
        chunk.length

      if (
        total >
        MAX_MEDIAFIRE_BYTES
      ) {
        callback(
          new Error(
            'MEDIAFIRE_FILE_TOO_LARGE'
          )
        )
        return
      }

      callback(
        null,
        chunk
      )
    }
  })
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36'

function sleep(ms) {
  return new Promise(resolve =>
    setTimeout(resolve, ms)
  )
}

function isMediaFireUrl(value) {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()

    return (
      host === 'mediafire.com' ||
      host.endsWith('.mediafire.com')
    )
  } catch {
    return false
  }
}

function cleanFileName(value, ext) {
  let name =
    String(value || '')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/[\\/]/g, '_')
      .trim()

  const safeExt =
    String(ext || '')
      .replace(/[^a-z0-9]/gi, '')
      .toLowerCase()

  if (!name) {
    name = safeExt
      ? `NEXA-MediaFire.${safeExt}`
      : 'NEXA-MediaFire.bin'
  }

  if (
    safeExt &&
    !name.toLowerCase().endsWith(`.${safeExt}`)
  ) {
    name += `.${safeExt}`
  }

  if (name.length > 180) {
    const dot = name.lastIndexOf('.')
    const suffix =
      dot > 0 && name.length - dot <= 12
        ? name.slice(dot)
        : ''

    name =
      name.slice(0, 180 - suffix.length) +
      suffix
  }

  return name
}

function safeMime(value) {
  const mime = String(value || '').trim()

  if (
    /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(mime)
  ) {
    return mime
  }

  return 'application/octet-stream'
}

function parseApiSize(value) {
  const match =
    String(value || '')
      .trim()
      .match(
        /^([\d.,]+)\s*(B|KB|MB|GB|TB)$/i
      )

  if (!match) return null

  const number =
    Number(
      match[1].replace(',', '.')
    )

  if (!Number.isFinite(number) || number < 0) {
    return null
  }

  const power = {
    B: 0,
    KB: 1,
    MB: 2,
    GB: 3,
    TB: 4
  }[match[2].toUpperCase()]

  return number * (1024 ** power)
}

function humanBytes(value) {
  const size = Number(value)

  if (!Number.isFinite(size) || size < 0) {
    return '-'
  }

  if (size < 1024) {
    return `${size} B`
  }

  const units = [
    'KB',
    'MB',
    'GB',
    'TB'
  ]

  let current = size / 1024
  let unit = units[0]

  for (
    let i = 1;
    i < units.length &&
    current >= 1024;
    i++
  ) {
    current /= 1024
    unit = units[i]
  }

  return `${current.toFixed(2)} ${unit}`
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&#47;/g, '/')
}

function cookieHeaderFrom(response) {
  try {
    if (
      typeof response.headers.getSetCookie ===
      'function'
    ) {
      return response.headers
        .getSetCookie()
        .map(x => x.split(';')[0])
        .filter(Boolean)
        .join('; ')
    }
  } catch {}

  const single =
    response.headers.get('set-cookie')

  if (!single) {
    return ''
  }

  return single
    .split(/,(?=[^;,]+=)/)
    .map(x => x.split(';')[0])
    .filter(Boolean)
    .join('; ')
}

function extractDownloadButton(html) {
  const tags =
    String(html || '')
      .match(/<a\b[^>]*>/gi) ||
    []

  for (const tag of tags) {
    if (
      !/\bid\s*=\s*["']downloadButton["']/i
        .test(tag)
    ) {
      continue
    }

    const href =
      tag.match(
        /\bhref\s*=\s*["']([^"']+)["']/i
      )?.[1]

    if (
      href &&
      /^https?:\/\//i.test(href)
    ) {
      return decodeHtml(href)
    }

    const scrambled =
      tag.match(
        /\bdata-scrambled-url\s*=\s*["']([^"']+)["']/i
      )?.[1]

    if (scrambled) {
      try {
        const decoded =
          Buffer.from(
            decodeHtml(scrambled),
            'base64'
          ).toString('utf8')

        if (
          /^https?:\/\//i.test(decoded)
        ) {
          return decoded
        }
      } catch {}
    }
  }

  const dynamic =
    String(html || '')
      .match(
        /https?:\/\/download\d+\.mediafire\.com\/[^"'<>\\\s]+/i
      )?.[0]

  return dynamic
    ? decodeHtml(dynamic)
    : ''
}

async function requestMediaFire(url) {
  let lastError

  for (
    let attempt = 1;
    attempt <= 2;
    attempt++
  ) {
    const controller =
      new AbortController()

    const timer =
      setTimeout(
        () => {
          controller.abort(
            new Error(
              'MEDIAFIRE_API_TIMEOUT'
            )
          )
        },
        API_TIMEOUT
      )

    try {
      const response =
        await fetch(
          API,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
              Accept:
                'application/json'
            },

            body:
              JSON.stringify({
                url
              }),

            signal:
              controller.signal
          }
        )

      const body =
        await response.text()

      let json

      try {
        json = JSON.parse(body)
      } catch {
        throw new Error(
          `MEDIAFIRE_API_INVALID_JSON_${response.status}`
        )
      }

      if (!response.ok) {
        throw new Error(
          json?.message ||
          `MEDIAFIRE_API_HTTP_${response.status}`
        )
      }

      if (json?.status !== true) {
        throw new Error(
          json?.message ||
          'MEDIAFIRE_API_FAILED'
        )
      }

      const result = json?.result

      if (
        !result ||
        typeof result !== 'object'
      ) {
        throw new Error(
          'MEDIAFIRE_RESULT_NOT_FOUND'
        )
      }

      return result
    } catch (error) {
      lastError = error

      const text =
        `${
          error?.cause?.code || ''
        } ${
          error?.code || ''
        } ${
          error?.message || ''
        }`

      if (
        attempt < 2 &&
        /timeout|fetch failed|connection|socket|econn|enotfound/i
          .test(text)
      ) {
        await sleep(1500)
        continue
      }

      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  throw (
    lastError ||
    new Error(
      'MEDIAFIRE_API_FAILED'
    )
  )
}

async function resolveLocalMediaFireLink(
  originalUrl
) {
  const controller =
    new AbortController()

  const timer =
    setTimeout(
      () => {
        controller.abort(
          new Error(
            'MEDIAFIRE_PAGE_TIMEOUT'
          )
        )
      },
      API_TIMEOUT
    )

  try {
    const response =
      await fetch(
        originalUrl,
        {
          redirect: 'follow',

          headers: {
            'User-Agent': UA,
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language':
              'id-ID,id;q=0.9,en-US;q=0.8'
          },

          signal:
            controller.signal
        }
      )

    if (!response.ok) {
      throw new Error(
        `MEDIAFIRE_PAGE_HTTP_${response.status}`
      )
    }

    const html =
      await response.text()

    const directUrl =
      extractDownloadButton(
        html
      )

    if (!directUrl) {
      throw new Error(
        'MEDIAFIRE_LOCAL_DIRECT_NOT_FOUND'
      )
    }

    return {
      directUrl,
      cookie:
        cookieHeaderFrom(
          response
        ),
      referer:
        response.url ||
        originalUrl
    }
  } finally {
    clearTimeout(timer)
  }
}

function openDownload(
  input,
  {
    cookie = '',
    referer =
      'https://www.mediafire.com/',
    redirectCount = 0
  } = {}
) {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      let url

      try {
        url = new URL(input)
      } catch {
        reject(
          new Error(
            'MEDIAFIRE_DIRECT_URL_INVALID'
          )
        )
        return
      }

      if (
        ![
          'http:',
          'https:'
        ].includes(url.protocol)
      ) {
        reject(
          new Error(
            'MEDIAFIRE_DIRECT_PROTOCOL_INVALID'
          )
        )
        return
      }

      const client =
        url.protocol === 'https:'
          ? https
          : http

      let settled = false

      const headers = {
        'User-Agent': UA,
        Accept: '*/*',
        'Accept-Language':
          'id-ID,id;q=0.9,en-US;q=0.8',
        Referer:
          referer
      }

      if (cookie) {
        headers.Cookie = cookie
      }

      const request =
        client.get(
          url,
          {
            headers
          },
          response => {
            clearTimeout(
              connectTimer
            )

            const status =
              Number(
                response.statusCode ||
                0
              )

            const location =
              response.headers
                .location

            if (
              status >= 300 &&
              status < 400 &&
              location
            ) {
              response.resume()

              if (
                redirectCount >=
                MAX_REDIRECTS
              ) {
                settled = true
                reject(
                  new Error(
                    'MEDIAFIRE_TOO_MANY_REDIRECTS'
                  )
                )
                return
              }

              const next =
                new URL(
                  location,
                  url
                ).toString()

              settled = true

              resolve(
                openDownload(
                  next,
                  {
                    cookie,
                    referer,
                    redirectCount:
                      redirectCount + 1
                  }
                )
              )
              return
            }

            if (
              status < 200 ||
              status >= 300
            ) {
              response.resume()

              settled = true

              reject(
                new Error(
                  `MEDIAFIRE_CDN_HTTP_${status}`
                )
              )
              return
            }

            settled = true

            resolve({
              response,
              finalUrl:
                url.toString(),
              contentType:
                String(
                  response.headers[
                    'content-type'
                  ] || ''
                ),
              contentLength:
                Number(
                  response.headers[
                    'content-length'
                  ] || 0
                )
            })
          }
        )

      const connectTimer =
        setTimeout(
          () => {
            if (!settled) {
              request.destroy(
                new Error(
                  'MEDIAFIRE_CDN_CONNECT_TIMEOUT'
                )
              )
            }
          },
          CONNECT_TIMEOUT
        )

      request.setTimeout(
        SOCKET_IDLE_TIMEOUT,
        () => {
          request.destroy(
            new Error(
              'MEDIAFIRE_CDN_IDLE_TIMEOUT'
            )
          )
        }
      )

      request.once(
        'error',
        error => {
          clearTimeout(
            connectTimer
          )

          if (!settled) {
            settled = true
            reject(error)
          }
        }
      )
    }
  )
}

async function downloadToTemp({
  directUrl,
  fileName,
  expectedBytes,
  cookie,
  referer
}) {
  const dir =
    await mkdtemp(
      join(
        tmpdir(),
        'nexa-mediafire-'
      )
    )

  const filePath =
    join(
      dir,
      fileName
    )

  const cleanup =
    async () => {
      await rm(
        dir,
        {
          recursive: true,
          force: true
        }
      )
    }

  try {
    if (
      expectedBytes &&
      expectedBytes >
        MAX_MEDIAFIRE_BYTES
    ) {
      throw new Error(
        'MEDIAFIRE_FILE_TOO_LARGE'
      )
    }

    const {
      response,
      contentType,
      contentLength
    } =
      await openDownload(
        directUrl,
        {
          cookie,
          referer
        }
      )

    if (
      contentLength >
      MAX_MEDIAFIRE_BYTES
    ) {
      response.resume()

      throw new Error(
        'MEDIAFIRE_FILE_TOO_LARGE'
      )
    }

    if (
      /^text\/html\b/i.test(
        contentType
      ) &&
      expectedBytes &&
      expectedBytes >
        1024 * 1024
    ) {
      response.resume()

      throw Object.assign(
        new Error(
          'MEDIAFIRE_HTML_INSTEAD_OF_FILE'
        ),
        {
          contentType,
          contentLength
        }
      )
    }

    if (
      expectedBytes &&
      contentLength &&
      contentLength <
        expectedBytes * 0.75
    ) {
      response.resume()

      throw Object.assign(
        new Error(
          'MEDIAFIRE_SIZE_MISMATCH_HEADER'
        ),
        {
          expectedBytes,
          actualBytes:
            contentLength
        }
      )
    }

    await pipeline(
      response,
      createMediaFireSizeGuard(),
      createWriteStream(
        filePath,
        {
          flags: 'wx'
        }
      )
    )

    const info =
      await stat(filePath)

    const actualBytes =
      Number(
        info.size || 0
      )

    if (!actualBytes) {
      throw new Error(
        'MEDIAFIRE_EMPTY_FILE'
      )
    }

    if (
      actualBytes >
      MAX_MEDIAFIRE_BYTES
    ) {
      throw new Error(
        'MEDIAFIRE_FILE_TOO_LARGE'
      )
    }

    if (
      expectedBytes &&
      expectedBytes >=
        1024 * 1024
    ) {
      const ratio =
        actualBytes /
        expectedBytes

      if (ratio < 0.75) {
        throw Object.assign(
          new Error(
            'MEDIAFIRE_SIZE_MISMATCH'
          ),
          {
            expectedBytes,
            actualBytes
          }
        )
      }
    }

    return {
      filePath,
      actualBytes,
      cleanup
    }
  } catch (error) {
    await cleanup()
    throw error
  }
}

async function downloadWithFallback({
  originalUrl,
  apiDirectUrl,
  fileName,
  expectedBytes
}) {
  let localError = null

  try {
    const resolved =
      await resolveLocalMediaFireLink(
        originalUrl
      )

    console.log(
      '[MEDIAFIRE V3] local direct link resolved'
    )

    return await downloadToTemp({
      directUrl:
        resolved.directUrl,
      fileName,
      expectedBytes,
      cookie:
        resolved.cookie,
      referer:
        resolved.referer
    })
  } catch (error) {
    localError = error

    if (
      /MEDIAFIRE_FILE_TOO_LARGE/i
        .test(
          String(
            error?.message ||
            ''
          )
        )
    ) {
      throw error
    }

    console.warn(
      '[MEDIAFIRE V3] local resolve/download failed:',
      error?.message ||
      error
    )
  }

  if (!apiDirectUrl) {
    throw localError
  }

  console.log(
    '[MEDIAFIRE V3] trying API direct link fallback'
  )

  return downloadToTemp({
    directUrl:
      apiDirectUrl,
    fileName,
    expectedBytes,
    referer:
      originalUrl
  })
}

function errorText(error) {
  const text =
    `${
      error?.cause?.code || ''
    } ${
      error?.code || ''
    } ${
      error?.message || ''
    }`

  if (
    /SERVER_DISK_LOW/i
      .test(text)
  ) {
    return (
      `Storage server sedang kurang aman untuk job ini.\n` +
      `Tersedia: *${formatResourceBytes(error?.availableBytes)}* • ` +
      `Dibutuhkan aman: *${formatResourceBytes(error?.neededBytes)}*.`
    )
  }

  if (
    /MEDIAFIRE_LIMIT_CHANGED/i
      .test(text)
  ) {
    return (
      'Ukuran aktual file masuk tier biaya yang lebih tinggi, ' +
      'tapi Limit kamu tidak cukup. File tidak dikirim.'
    )
  }

  if (
    /FILE_TOO_LARGE/i
      .test(text)
  ) {
    return (
      'Ukuran file melewati batas aman 1 GB.\n' +
      'NEXA membatalkan download demi keamanan server.'
    )
  }

  if (
    /HTML_INSTEAD_OF_FILE|SIZE_MISMATCH/i
      .test(text)
  ) {
    return (
      'MediaFire mengembalikan halaman HTML/redirect, bukan file asli.\n' +
      'NEXA membatalkan pengiriman supaya tidak mengirim file palsu.'
    )
  }

  if (
    /LOCAL_DIRECT_NOT_FOUND/i
      .test(text)
  ) {
    return (
      'Link download asli tidak ditemukan pada halaman MediaFire.'
    )
  }

  if (
    /CONNECT_TIMEOUT|IDLE_TIMEOUT|timeout/i
      .test(text)
  ) {
    return (
      'Koneksi ke server MediaFire timeout.\n' +
      'Coba lagi beberapa saat.'
    )
  }

  if (
    /CDN_HTTP_/i
      .test(text)
  ) {
    return (
      'Server download MediaFire menolak direct download sementara.'
    )
  }

  if (
    /fetch failed|connection|socket|econn|enotfound/i
      .test(text)
  ) {
    return (
      'Tidak bisa terhubung ke layanan MediaFire saat ini.'
    )
  }

  return (
    error?.message &&
    !String(
      error.message
    ).startsWith(
      'MEDIAFIRE_'
    )
      ? String(
          error.message
        )
      : 'MediaFire downloader sedang tidak tersedia.'
  )
}

export default {
  name: 'mediafire',

  aliases: [
    'mf',
    'mfdl'
  ],

  category:
    'DOWNLOADER',

  description:
    'Download file MediaFire',

  usage:
    '.mediafire <url>',

  async run({
    sock,
    msg,
    jid,
    args,
    config
  }) {
    const url =
      String(
        args?.[0] || ''
      ).trim()

    if (
      !url ||
      !isMediaFireUrl(
        url
      )
    ) {
      await sock.sendMessage(
        jid,
        {
          text:
            '✦ *NEXA • MEDIAFIRE*\n\n' +
            'Kirim link MediaFire yang valid.\n\n' +
            'Contoh:\n' +
            `${config?.prefix || '.'}mediafire https://www.mediafire.com/file/xxxxx\n\n` +
            '🎟 Biaya: 3–15 Limit sesuai ukuran\n' +
            '⭐ Premium: 2–8 Limit • 👑 Owner: gratis'
        },
        {
          quoted: msg
        }
      )

      return
    }

    let downloaded =
      null

    let job =
      null

    try {
      await sock.sendMessage(
        jid,
        {
          text:
            '✦ *NEXA • MEDIAFIRE*\n\n' +
            '⏳ Mengambil metadata dan direct link file...'
        },
        {
          quoted: msg
        }
      )

      const data =
        await requestMediaFire(
          url
        )

      const fileName =
        cleanFileName(
          data.filename,
          data.ext
        )

      const mimetype =
        safeMime(
          data.mimetype
        )

      const expectedBytes =
        parseApiSize(
          data.filesize
        )

      if (
        expectedBytes &&
        expectedBytes >
          MAX_MEDIAFIRE_BYTES
      ) {
        throw new Error(
          'MEDIAFIRE_FILE_TOO_LARGE'
        )
      }

      const normalCost =
        getDownloadLimitCost(
          expectedBytes,
          {
            premium: false
          }
        )

      const premiumCost =
        getDownloadLimitCost(
          expectedBytes,
          {
            premium: true
          }
        )

      job =
        beginBilledJob({
          msg,
          jid,
          kind:
            'download',
          normalCost,
          premiumCost,
          globalLimit: 2,
          perOwnerLimit: 1,
          ttlMs:
            30 *
            60 *
            1000
        })

      if (!job.ok) {
        if (
          job.reason ===
          'LIMIT'
        ) {
          await sendLimitEmpty({
            sock,
            msg,
            jid
          })

          return
        }

        await sock.sendMessage(
          jid,
          {
            text:
              `✦ *NEXA • MEDIAFIRE*\n\n` +
              resourceBusyText(
                job.busy,
                'download besar'
              )
          },
          {
            quoted: msg
          }
        )

        return
      }

      ensureDiskHeadroom(
        expectedBytes ||
        MAX_MEDIAFIRE_BYTES
      )

      await sock.sendMessage(
        jid,
        {
          text:
            '✦ *NEXA • MEDIAFIRE*\n\n' +
            `📁 *File:* ${fileName}\n` +
            `📦 *Ukuran:* ${String(data.filesize || '-')}\n` +
            `🧩 *Tipe:* ${mimetype}\n` +
            `🎟 *Biaya awal:* ${
              job.cost
                ? `${job.cost} Limit${
                    job.access?.premium
                      ? ' • Premium ⭐'
                      : ''
                  }`
                : 'Gratis • Owner 👑'
            }\n\n` +
            'Biaya final menyesuaikan ukuran aktual.\n' +
            '⬇️ Mengunduh file asli dari MediaFire...'
        },
        {
          quoted: msg
        }
      )

      downloaded =
        await downloadWithFallback({
          originalUrl:
            url,
          apiDirectUrl:
            data.link,
          fileName,
          expectedBytes
        })

      const finalCost =
        job.access?.owner
          ? 0
          : getDownloadLimitCost(
              downloaded.actualBytes,
              {
                premium:
                  Boolean(
                    job.access
                      ?.premium
                  )
              }
            )

      const adjusted =
        adjustBilledJob(
          job,
          finalCost
        )

      if (
        !adjusted.success
      ) {
        throw new Error(
          'MEDIAFIRE_LIMIT_CHANGED'
        )
      }

      await sock.sendMessage(
        jid,
        {
          document: {
            url:
              downloaded.filePath
          },

          fileName,
          mimetype,

          caption:
            '✦ *NEXA • MEDIAFIRE*\n\n' +
            `📁 *File:* ${fileName}\n` +
            `📦 *Ukuran:* ${humanBytes(downloaded.actualBytes)}\n` +
            `🧩 *Tipe:* ${mimetype}\n` +
            `🎟 *Biaya:* ${
              job.cost
                ? `${job.cost} Limit`
                : 'Gratis • Owner 👑'
            }\n\n` +
            '✅ File berhasil diunduh dan dikirim.'
        },
        {
          quoted: msg,
          mediaUploadTimeoutMs:
            UPLOAD_TIMEOUT
        }
      )
    } catch (error) {
      const refunded =
        job?.ok
          ? refundBilledJob(
              job,
              'mediafire_failed'
            )
          : {
              refunded: false
            }

      console.error(
        '[MEDIAFIRE V3]',
        error
      )

      await sock.sendMessage(
        jid,
        {
          text:
            '❌ *MediaFire gagal*\n\n' +
            errorText(
              error
            ) +
            (
              refunded.refunded
                ? `\n\n🎟 ${refunded.cost} Limit dikembalikan.`
                : ''
            )
        },
        {
          quoted: msg
        }
      )
    } finally {
      try {
        await downloaded
          ?.cleanup?.()
      } catch (
        cleanupError
      ) {
        console.error(
          '[MEDIAFIRE V3] cleanup:',
          cleanupError
        )
      }

      try {
        job
          ?.release?.()
      } catch {}
    }
  }
}
