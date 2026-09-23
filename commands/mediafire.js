import {
  AIRich
} from '@rexxhayanasi/elaina-baileys'

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

function createMediaFireSizeGuard({
  totalBytes = 0,
  onProgress = null
} = {}) {
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

      if (
        typeof onProgress ===
          'function'
      ) {
        const safeTotal =
          Number(totalBytes) > 0
            ? Number(totalBytes)
            : 0

        const percent =
          safeTotal > 0
            ? Math.min(
                100,
                Math.floor(
                  total /
                  safeTotal *
                  100
                )
              )
            : null

        try {
          onProgress({
            downloadedBytes:
              total,
            totalBytes:
              safeTotal,
            percent
          })
        } catch {}
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

function decodeURIComponentSafe(value) {
  let text =
    String(value || '')

  for (
    let i = 0;
    i < 3;
    i += 1
  ) {
    try {
      const next =
        decodeURIComponent(text)

      if (next === text) {
        break
      }

      text = next
    } catch {
      break
    }
  }

  return text
}

function fileNameFromUrl(value) {
  try {
    const url =
      new URL(value)

    const parts =
      url.pathname
        .split('/')
        .filter(Boolean)

    const last =
      parts[parts.length - 1] ||
      ''

    return decodeURIComponentSafe(
      last
    )
  } catch {
    return ''
  }
}

function fileNameFromPageUrl(value) {
  try {
    const url =
      new URL(value)

    const parts =
      url.pathname
        .split('/')
        .filter(Boolean)

    if (
      parts.length >= 3 &&
      parts[0] === 'file'
    ) {
      const candidate =
        parts[parts.length - 1] ===
          'file'
          ? parts[parts.length - 2]
          : parts[parts.length - 1]

      return decodeURIComponentSafe(
        candidate
      )
    }

    return ''
  } catch {
    return ''
  }
}

function inferMimeFromName(value) {
  const name =
    String(value || '')
      .toLowerCase()

  const ext =
    name.includes('.')
      ? name.split('.').pop()
      : ''

  const map = {
    zip: 'application/zip',
    rar: 'application/vnd.rar',
    '7z': 'application/x-7z-compressed',
    apk: 'application/vnd.android.package-archive',
    xapk: 'application/zip',
    pdf: 'application/pdf',
    txt: 'text/plain',
    json: 'application/json',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    wav: 'audio/wav',
    mp4: 'video/mp4',
    mkv: 'video/x-matroska',
    webm: 'video/webm',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif'
  }

  return map[ext] ||
    'application/octet-stream'
}

function extractMediaFireMeta(
  html,
  originalUrl,
  directUrl
) {
  const plain =
    decodeHtml(
      String(html || '')
        .replace(
          /<script\b[^>]*>[\s\S]*?<\/script>/gi,
          ' '
        )
        .replace(
          /<style\b[^>]*>[\s\S]*?<\/style>/gi,
          ' '
        )
        .replace(
          /<[^>]+>/g,
          ' '
        )
    )
      .replace(/\s+/g, ' ')
      .trim()

  const sizeMatch =
    plain.match(
      /File\s*size\s*:\s*([\d.,]+\s*(?:B|KB|MB|GB|TB))/i
    ) ||
    plain.match(
      /Download\s*\(\s*([\d.,]+\s*(?:B|KB|MB|GB|TB))\s*\)/i
    )

  const fileName =
    fileNameFromUrl(
      directUrl
    ) ||
    fileNameFromPageUrl(
      originalUrl
    ) ||
    'NEXA-MediaFire.bin'

  const ext =
    fileName.includes('.')
      ? fileName
          .split('.')
          .pop()
          .replace(
            /[^a-z0-9]/gi,
            ''
          )
          .toLowerCase()
      : ''

  return {
    filename:
      fileName,
    ext,
    mimetype:
      inferMimeFromName(
        fileName
      ),
    filesize:
      sizeMatch?.[1]
        ? sizeMatch[1]
            .replace(/\s+/g, '')
        : '-'
  }
}

async function requestMediaFire(url) {
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
        url,
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

    const meta =
      extractMediaFireMeta(
        html,
        response.url || url,
        directUrl
      )

    return {
      ...meta,
      link:
        directUrl,
      cookie:
        cookieHeaderFrom(
          response
        ),
      referer:
        response.url ||
        url
    }
  } catch (error) {
    if (
      error?.name ===
        'AbortError'
    ) {
      throw new Error(
        'MEDIAFIRE_PAGE_TIMEOUT'
      )
    }

    throw error
  } finally {
    clearTimeout(timer)
  }
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
  referer,
  onProgress = null
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
      createMediaFireSizeGuard({
        totalBytes:
          contentLength ||
          expectedBytes ||
          0,
        onProgress
      }),
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
  expectedBytes,
  cookie = '',
  referer = '',
  onProgress = null
}) {
  let resolved = null

  if (apiDirectUrl) {
    resolved = {
      directUrl:
        apiDirectUrl,
      cookie,
      referer:
        referer ||
        originalUrl
    }
  } else {
    resolved =
      await resolveLocalMediaFireLink(
        originalUrl
      )
  }

  console.log(
    '[MEDIAFIRE V4] direct link resolved locally'
  )

  return downloadToTemp({
    directUrl:
      resolved.directUrl,
    fileName,
    expectedBytes,
    cookie:
      resolved.cookie,
    referer:
      resolved.referer,
    onProgress
  })
}

function progressBar(percent) {
  const safe =
    Math.max(
      0,
      Math.min(
        100,
        Number(percent) || 0
      )
    )

  const filled =
    Math.round(
      safe / 10
    )

  return (
    '█'.repeat(filled) +
    '░'.repeat(10 - filled)
  )
}

async function startMediaFireRichStatus({
  sock,
  msg,
  jid
}) {
  try {
    const rich =
      new AIRich(sock)
        .setTitle(
          '✦ NEXA • MEDIAFIRE'
        )
        .setFooter(
          'NEXA Downloader • AIRich'
        )
        .addText(
          '⏳ Mengambil metadata dan direct link file...',
          {
            id:
              'status'
          }
        )

    await rich.send(
      jid,
      {
        quoted:
          msg
      }
    )

    return rich
  } catch (error) {
    console.warn(
      '[MEDIAFIRE V4] AIRich start fallback:',
      error?.message ||
      error
    )

    return null
  }
}

async function updateMediaFireRichStatus(
  rich,
  text
) {
  if (!rich) {
    return false
  }

  try {
    rich.addText(
      text,
      {
        replace:
          'status'
      }
    )

    await rich.sendEdit()
    return true
  } catch (error) {
    console.warn(
      '[MEDIAFIRE V4] AIRich edit fallback:',
      error?.message ||
      error
    )

    return false
  }
}

function createMediaFireProgressUpdater({
  rich,
  fileName
}) {
  let lastPercent =
    -5

  let lastAt =
    0

  let active =
    Boolean(rich)

  let queue =
    Promise.resolve()

  const report = state => {
    if (!active) {
      return
    }

    const now =
      Date.now()

    const percent =
      Number.isFinite(
        Number(
          state?.percent
        )
      )
        ? Number(
            state.percent
          )
        : null

    if (percent !== null) {
      const bucket =
        percent >= 100
          ? 100
          : Math.floor(
              percent / 5
            ) * 5

      if (
        bucket < 100 &&
        bucket <
          lastPercent + 5 &&
        now - lastAt <
          2500
      ) {
        return
      }

      lastPercent =
        Math.max(
          lastPercent,
          bucket
        )

      lastAt =
        now

      const text =
        `📁 *${fileName}*\n` +
        `⬇️ Mengunduh dari MediaFire...\n\n` +
        `${progressBar(bucket)} *${bucket}%*\n` +
        `${humanBytes(state.downloadedBytes)} / ${humanBytes(state.totalBytes)}`

      queue =
        queue.then(
          async () => {
            const ok =
              await updateMediaFireRichStatus(
                rich,
                text
              )

            if (!ok) {
              active =
                false
            }
          }
        )

      return
    }

    if (
      now - lastAt <
      3000
    ) {
      return
    }

    lastAt =
      now

    queue =
      queue.then(
        async () => {
          const ok =
            await updateMediaFireRichStatus(
              rich,
              `📁 *${fileName}*\n` +
              `⬇️ Mengunduh dari MediaFire...\n\n` +
              `📦 ${humanBytes(state.downloadedBytes)}`
            )

          if (!ok) {
            active =
              false
          }
        }
      )
  }

  report.flush =
    async () => {
      try {
        await queue
      } catch {}
    }

  return report
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

    let richStatus =
      null

    let progressUpdate =
      null

    try {
      richStatus =
        await startMediaFireRichStatus({
          sock,
          msg,
          jid
        })

      if (!richStatus) {
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
      }

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


      const costText =
        job.cost
          ? `${job.cost} Limit${
              job.access?.premium
                ? ' • Premium ⭐'
                : ''
            }`
          : 'Gratis • Owner 👑'

      const metadataText =
        `📁 *${fileName}*\n` +
        `📦 *Ukuran:* ${String(data.filesize || '-')}\n` +
        `🧩 *Tipe:* ${mimetype}\n` +
        `🎟 *Biaya awal:* ${costText}\n\n` +
        `⬇️ Mengunduh file asli dari MediaFire...\n\n` +
        `${progressBar(0)} *0%*`

      const richUpdated =
        await updateMediaFireRichStatus(
          richStatus,
          metadataText
        )

      if (!richUpdated) {
        await sock.sendMessage(
          jid,
          {
            text:
              '✦ *NEXA • MEDIAFIRE*\n\n' +
              `📁 *File:* ${fileName}\n` +
              `📦 *Ukuran:* ${String(data.filesize || '-')}\n` +
              `🧩 *Tipe:* ${mimetype}\n` +
              `🎟 *Biaya awal:* ${costText}\n\n` +
              'Biaya final menyesuaikan ukuran aktual.\n' +
              '⬇️ Mengunduh file asli dari MediaFire...'
          },
          {
            quoted: msg
          }
        )
      }

      progressUpdate =
        createMediaFireProgressUpdater({
          rich:
            richStatus,
          fileName
        })

      downloaded =
        await downloadWithFallback({
          originalUrl:
            url,
          apiDirectUrl:
            data.link,
          fileName,
          expectedBytes,
          cookie:
            data.cookie || '',
          referer:
            data.referer || url,
          onProgress:
            progressUpdate
        })

      await progressUpdate
        ?.flush?.()

      await updateMediaFireRichStatus(
        richStatus,
        `📁 *${fileName}*\n` +
        `⬇️ Download selesai • ${humanBytes(downloaded.actualBytes)}\n\n` +
        `⬆️ Mengirim file ke WhatsApp...`
      )

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

      await updateMediaFireRichStatus(
        richStatus,
        `✅ *Selesai*\n\n` +
        `📁 *${fileName}*\n` +
        `📦 ${humanBytes(downloaded.actualBytes)}\n` +
        `🎟 ${
          job.cost
            ? `${job.cost} Limit`
            : 'Gratis • Owner 👑'
        }`
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

      await updateMediaFireRichStatus(
        richStatus,
        `❌ *Download gagal*\n\n${errorText(error)}`
      )

      console.error(
        '[MEDIAFIRE V4]',
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
