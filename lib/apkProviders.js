// NEXA APK MULTI-PROVIDER V1
import * as cheerio from 'cheerio'

import {
  spawn
} from 'node:child_process'

import {
  Readable,
  Transform
} from 'node:stream'

import {
  pipeline
} from 'node:stream/promises'

import {
  createWriteStream
} from 'node:fs'

import {
  mkdtemp,
  open,
  rm,
  stat
} from 'node:fs/promises'

import {
  tmpdir
} from 'node:os'

import {
  join
} from 'node:path'

const APKMODY_API =
  'https://api.alwayscodex.eu.cc/api/downloader/apkmody'

const APKMODY_BASE =
  'https://apkmody.mobi'

const LITEAPKS_BASE =
  'https://liteapks.com'

const AN1_BASE =
  'https://an1.com'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36'

const HTML_TIMEOUT =
  30

const DOWNLOAD_TIMEOUT =
  20 * 60

const MAX_HTML_BYTES =
  8 * 1024 * 1024

// NEXA APK 1GB HARD LIMIT V1
export const MAX_APK_DOWNLOAD_BYTES =
  1024 * 1024 * 1024

function createDownloadSizeGuard() {
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
        MAX_APK_DOWNLOAD_BYTES
      ) {
        callback(
          new Error(
            'APK_FILE_TOO_LARGE'
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

function clean(
  value,
  max = 1000
) {
  return String(
    value ?? ''
  )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function absoluteUrl(
  value,
  base
) {
  const raw =
    String(
      value || ''
    ).trim()

  if (!raw) {
    return ''
  }

  try {
    return new URL(
      raw,
      base
    ).href
  } catch {
    return ''
  }
}

function isPrivateHost(
  hostname
) {
  const host =
    String(
      hostname || ''
    )
      .toLowerCase()
      .replace(/^\[|\]$/g, '')

  if (
    host === 'localhost' ||
    host === '::1' ||
    host.endsWith('.local')
  ) {
    return true
  }

  if (
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host)
  ) {
    return true
  }

  const m =
    host.match(
      /^172\.(\d+)\./
    )

  if (
    m &&
    Number(m[1]) >= 16 &&
    Number(m[1]) <= 31
  ) {
    return true
  }

  return false
}

export function safeRemoteUrl(
  value
) {
  try {
    const url =
      new URL(
        String(
          value || ''
        )
      )

    if (
      ![
        'http:',
        'https:'
      ].includes(
        url.protocol
      )
    ) {
      return ''
    }

    if (
      isPrivateHost(
        url.hostname
      )
    ) {
      return ''
    }

    return url.href
  } catch {
    return ''
  }
}

function spawnCapture(
  file,
  args,
  {
    maxBytes =
      MAX_HTML_BYTES
  } = {}
) {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      const child =
        spawn(
          file,
          args,
          {
            stdio: [
              'ignore',
              'pipe',
              'pipe'
            ]
          }
        )

      const chunks = []
      let size = 0
      let stderr = ''
      let settled = false

      function fail(
        error
      ) {
        if (settled) {
          return
        }

        settled = true

        try {
          child.kill(
            'SIGKILL'
          )
        } catch {}

        reject(error)
      }

      child.stdout.on(
        'data',
        chunk => {
          size +=
            chunk.length

          if (
            size >
            maxBytes
          ) {
            fail(
              new Error(
                'HTML_TOO_LARGE'
              )
            )

            return
          }

          chunks.push(
            chunk
          )
        }
      )

      child.stderr.on(
        'data',
        chunk => {
          stderr +=
            chunk.toString()
              .slice(0, 2000)
        }
      )

      child.once(
        'error',
        error => {
          fail(error)
        }
      )

      child.once(
        'close',
        code => {
          if (settled) {
            return
          }

          settled = true

          if (code !== 0) {
            reject(
              new Error(
                `CURL_${code}: ${clean(stderr, 500)}`
              )
            )

            return
          }

          resolve(
            Buffer.concat(
              chunks
            ).toString(
              'utf8'
            )
          )
        }
      )
    }
  )
}

async function fetchHtmlFallback(
  url,
  {
    headers = {},
    timeout = HTML_TIMEOUT
  } = {}
) {
  const controller =
    new AbortController()

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      timeout * 1000
    )

  try {
    const response =
      await fetch(
        url,
        {
          redirect:
            'follow',
          headers: {
            'User-Agent':
              UA,
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language':
              'en-US,en;q=0.9',
            ...headers
          },
          signal:
            controller.signal
        }
      )

    if (!response.ok) {
      throw new Error(
        `HTTP_${response.status}`
      )
    }

    const text =
      await response.text()

    if (
      Buffer.byteLength(
        text
      ) > MAX_HTML_BYTES
    ) {
      throw new Error(
        'HTML_TOO_LARGE'
      )
    }

    return text
  } finally {
    clearTimeout(timer)
  }
}

async function curlHtml(
  url,
  {
    headers = {},
    timeout = HTML_TIMEOUT
  } = {}
) {
  const args = [
    '-sS',
    '-L',
    '--compressed',
    '--connect-timeout',
    '15',
    '--max-time',
    String(timeout),
    '-H',
    `User-Agent: ${UA}`,
    '-H',
    'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    '-H',
    'Accept-Language: en-US,en;q=0.9'
  ]

  for (
    const [
      key,
      value
    ] of Object.entries(
      headers
    )
  ) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim()
    ) {
      args.push(
        '-H',
        `${key}: ${value}`
      )
    }
  }

  args.push(url)

  try {
    return await spawnCapture(
      'curl',
      args
    )
  } catch (error) {
    if (
      error?.code !==
        'ENOENT'
    ) {
      throw error
    }

    return fetchHtmlFallback(
      url,
      {
        headers,
        timeout
      }
    )
  }
}

async function postJson(
  url,
  payload,
  timeout = 35
) {
  const args = [
    '-sS',
    '-L',
    '--compressed',
    '--connect-timeout',
    '15',
    '--max-time',
    String(timeout),
    '-X',
    'POST',
    '-H',
    'Content-Type: application/json',
    '-H',
    'Accept: application/json',
    '--data-binary',
    JSON.stringify(payload),
    url
  ]

  try {
    const text =
      await spawnCapture(
        'curl',
        args,
        {
          maxBytes:
            4 * 1024 * 1024
        }
      )

    return JSON.parse(text)
  } catch (error) {
    if (
      error?.code !==
        'ENOENT'
    ) {
      if (
        error instanceof
          SyntaxError
      ) {
        throw new Error(
          'API_BAD_JSON'
        )
      }

      throw error
    }

    const controller =
      new AbortController()

    const timer =
      setTimeout(
        () =>
          controller.abort(),
        timeout * 1000
      )

    try {
      const response =
        await fetch(
          url,
          {
            method:
              'POST',
            headers: {
              'Content-Type':
                'application/json',
              Accept:
                'application/json'
            },
            body:
              JSON.stringify(
                payload
              ),
            signal:
              controller.signal
          }
        )

      const data =
        await response.json()

      if (!response.ok) {
        throw new Error(
          data?.message ||
          `HTTP_${response.status}`
        )
      }

      return data
    } finally {
      clearTimeout(timer)
    }
  }
}

function providerLabel(
  provider
) {
  if (
    provider ===
      'apkmody'
  ) {
    return 'APKMODY'
  }

  if (
    provider ===
      'liteapks'
  ) {
    return 'LiteAPKs'
  }

  if (
    provider === 'an1'
  ) {
    return 'AN1'
  }

  return clean(
    provider,
    40
  ) || 'Unknown'
}

function parseRating(
  value
) {
  const number =
    Number.parseFloat(
      String(
        value ?? ''
      )
    )

  return Number.isFinite(
    number
  )
    ? number
    : null
}

function makeSearchItem({
  provider,
  title,
  url,
  icon,
  version = '',
  size = '',
  mod = '',
  rating = null,
  developer = '',
  category = ''
}) {
  const safeUrl =
    safeRemoteUrl(url)

  if (
    !clean(title, 180) ||
    !safeUrl
  ) {
    return null
  }

  return {
    provider,
    providerLabel:
      providerLabel(
        provider
      ),
    title:
      clean(title, 180),
    url:
      safeUrl,
    icon:
      safeRemoteUrl(icon),
    version:
      clean(version, 100),
    size:
      clean(size, 80),
    mod:
      clean(mod, 220),
    rating:
      parseRating(rating),
    developer:
      clean(developer, 120),
    category:
      clean(category, 80)
  }
}

async function searchApkmody(
  query,
  page = 1
) {
  const data =
    await postJson(
      APKMODY_API,
      {
        action:
          'search',
        query,
        page:
          String(page)
      }
    )

  if (
    data?.status !== true ||
    !data?.result
  ) {
    throw new Error(
      data?.message ||
      'APKMODY_SEARCH_FAILED'
    )
  }

  const raw =
    Array.isArray(
      data.result.items
    )
      ? data.result.items
      : []

  const items = []

  for (const item of raw) {
    const text =
      clean(
        item?.version,
        220
      )

    const pieces =
      text.split('•')
        .map(x =>
          clean(x, 160)
        )
        .filter(Boolean)

    const normalized =
      makeSearchItem({
        provider:
          'apkmody',
        title:
          item?.title,
        url:
          absoluteUrl(
            item?.url,
            APKMODY_BASE
          ),
        icon:
          absoluteUrl(
            item?.cover,
            APKMODY_BASE
          ),
        version:
          pieces[0] || '',
        mod:
          pieces
            .slice(1)
            .join(' • ')
      })

    if (normalized) {
      items.push(
        normalized
      )
    }
  }

  return items
}

function parseLiteCard(
  $,
  el
) {
  const $el = $(el)

  const linkEl =
    $el.is('a')
      ? $el
      : $el
          .find(
            'a[href$=".html"]'
          )
          .first()

  if (!linkEl.length) {
    return null
  }

  const href =
    linkEl.attr(
      'href'
    ) || ''

  if (
    !href ||
    !href.endsWith(
      '.html'
    ) ||
    href.includes(
      '/news'
    ) ||
    href.includes(
      '/collection'
    )
  ) {
    return null
  }

  const title =
    $el
      .find(
        'h2, h3, h4'
      )
      .first()
      .text()
      .trim()

  if (
    !title ||
    [
      'more',
      'apps',
      'games',
      'home'
    ].includes(
      title.toLowerCase()
    )
  ) {
    return null
  }

  const allText =
    $el.text()

  const ratingMatch =
    allText.match(
      /(\d(?:\.\d)?)\s*★/
    ) ||
    allText.match(
      /★\s*(\d(?:\.\d)?)/
    )

  const version =
    allText.match(
      /v[\d.]+[a-zA-Z\d.\-]*/
    )?.[0] || ''

  const size =
    allText.match(
      /(\d+(?:\.\d+)?\s*(?:GB|MB|KB|G|M|K))/i
    )?.[0] || ''

  const badges = []

  $el
    .find(
      '.app-badge-wrap a, .app-badge-wrap span, div.absolute span, span[class*="badge"], .tag'
    )
    .each(
      (_, node) => {
        const value =
          clean(
            $(node).text(),
            80
          )

        if (
          value &&
          !badges.includes(
            value
          ) &&
          !/^\d+$/.test(
            value
          )
        ) {
          badges.push(value)
        }
      }
    )

  let modInfo = ''

  $el
    .find(
      'span, p, div'
    )
    .each(
      (_, node) => {
        const cls =
          $(node).attr(
            'class'
          ) || ''

        if (
          ![
            'text-orange',
            'font-semibold'
          ].some(
            key =>
              cls.includes(key)
          )
        ) {
          return
        }

        const value =
          clean(
            $(node).text(),
            160
          )

        if (
          value &&
          !/^★?\s*\d/.test(
            value
          ) &&
          !/^v[\d.]+/i.test(
            value
          ) &&
          value.length > 2
        ) {
          modInfo = value
          return false
        }
      }
    )

  if (
    !modInfo &&
    /\([^)]*(?:mod|premium|unlocked|pro|vip)[^)]*\)/i
      .test(title)
  ) {
    modInfo =
      title.match(
        /\(([^)]*)\)/
      )?.[1] || ''
  }

  if (
    !modInfo &&
    badges.length
  ) {
    modInfo =
      badges.join(', ')
  }

  const img =
    $el
      .find('img')
      .first()

  const icon =
    img.attr('src') ||
    img.attr('data-src') ||
    img.attr(
      'data-lazy-src'
    ) || ''

  return makeSearchItem({
    provider:
      'liteapks',
    title,
    url:
      absoluteUrl(
        href,
        LITEAPKS_BASE
      ),
    icon:
      absoluteUrl(
        icon,
        LITEAPKS_BASE
      ),
    version,
    size,
    mod:
      modInfo,
    rating:
      ratingMatch?.[1] ||
      null
  })
}

async function searchLiteapks(
  query,
  page = 1
) {
  const target =
    `${LITEAPKS_BASE}/?s=${encodeURIComponent(query)}` +
    (
      page > 1
        ? `&page=${page}`
        : ''
    )

  const html =
    await curlHtml(
      target
    )

  const $ =
    cheerio.load(html)

  const items = []
  const seen =
    new Set()

  $('a[href$=".html"]')
    .each(
      (_, el) => {
        const item =
          parseLiteCard(
            $,
            el
          )

        if (
          !item ||
          seen.has(
            item.url
          )
        ) {
          return
        }

        seen.add(
          item.url
        )

        items.push(item)
      }
    )

  return items
}

function parseAn1Card(
  $,
  el
) {
  const $el = $(el)

  const a =
    $el
      .find('.name a')
      .first()

  if (!a.length) {
    return null
  }

  const href =
    a.attr('href') || ''

  const rawTitle =
    clean(
      a.text(),
      180
    )

  const title =
    rawTitle
      .replace(
        /\s*\([^)]*\)/g,
        ''
      )
      .trim() ||
    rawTitle

  const img =
    $el
      .find('.img img')
      .first()

  const icon =
    img.attr('src') ||
    img.attr('data-src') ||
    ''

  const developer =
    clean(
      $el
        .find('.developer')
        .first()
        .text(),
      120
    )

  const rating =
    parseRating(
      $el
        .find(
          '.current-rating'
        )
        .first()
        .text()
    )

  const mod =
    rawTitle.match(
      /\(([^)]*MOD[^)]*)\)/i
    )?.[1] ||
    'Free'

  return makeSearchItem({
    provider:
      'an1',
    title,
    url:
      absoluteUrl(
        href,
        AN1_BASE
      ),
    icon:
      absoluteUrl(
        icon,
        AN1_BASE
      ),
    mod,
    rating,
    developer
  })
}

async function searchAn1(
  query,
  page = 1
) {
  let target =
    `${AN1_BASE}/?do=search&subaction=search&story=${encodeURIComponent(query)}`

  if (
    page > 1
  ) {
    target =
      `${AN1_BASE}/index.php?do=search&subaction=search` +
      `&search_start=${page}&full_search=0` +
      `&result_from=${(page - 1) * 10 + 1}` +
      `&story=${encodeURIComponent(query)}`
  }

  const html =
    await curlHtml(
      target
    )

  const $ =
    cheerio.load(html)

  const items = []

  $('.item').each(
    (_, el) => {
      const item =
        parseAn1Card(
          $,
          el
        )

      if (item) {
        items.push(item)
      }
    }
  )

  return items
}

function queryScore(
  item,
  query
) {
  const title =
    clean(
      item?.title,
      200
    ).toLowerCase()

  const q =
    clean(
      query,
      120
    ).toLowerCase()

  if (!title || !q) {
    return 0
  }

  let score = 0

  if (title === q) {
    score += 1000
  }

  if (
    title.startsWith(q)
  ) {
    score += 500
  }

  if (
    title.includes(q)
  ) {
    score += 300
  }

  const words =
    q.split(/\s+/)
      .filter(Boolean)

  for (const word of words) {
    if (
      title.includes(word)
    ) {
      score += 80
    }
  }

  const priority = {
    apkmody: 30,
    an1: 20,
    liteapks: 10
  }[
    item?.provider
  ] || 0

  return score + priority
}

export async function searchAllApk(
  query,
  page = 1
) {
  const providers = [
    [
      'apkmody',
      () =>
        searchApkmody(
          query,
          page
        )
    ],
    [
      'an1',
      () =>
        searchAn1(
          query,
          page
        )
    ],
    [
      'liteapks',
      () =>
        searchLiteapks(
          query,
          page
        )
    ]
  ]

  const settled =
    await Promise.all(
      providers.map(
        async ([
          id,
          runner
        ]) => {
          const start =
            Date.now()

          try {
            const items =
              await runner()

            return {
              id,
              ok: true,
              count:
                items.length,
              ms:
                Date.now() - start,
              items
            }
          } catch (error) {
            console.error(
              `[APK/${id}] search:`,
              error?.message ||
              error
            )

            return {
              id,
              ok: false,
              count: 0,
              ms:
                Date.now() - start,
              error:
                clean(
                  error?.message ||
                  error,
                  160
                ),
              items: []
            }
          }
        }
      )
    )

  const all =
    settled
      .flatMap(
        item =>
          item.items
      )

  const seen =
    new Set()

  const unique = []

  for (const item of all) {
    const key =
      `${item.provider}|${item.url}`

    if (
      seen.has(key)
    ) {
      continue
    }

    seen.add(key)
    unique.push(item)
  }

  unique.sort(
    (a, b) =>
      queryScore(
        b,
        query
      ) -
      queryScore(
        a,
        query
      )
  )

  return {
    query,
    page,
    items:
      unique.slice(
        0,
        48
      ),
    providers:
      settled.map(
        item => ({
          id:
            item.id,
          label:
            providerLabel(
              item.id
            ),
          ok:
            item.ok,
          count:
            item.count,
          ms:
            item.ms,
          error:
            item.error || ''
        })
      )
  }
}

function parseSchema(
  $,
  type
) {
  let result = null

  $(
    'script[type="application/ld+json"]'
  ).each(
    (_, el) => {
      if (result) {
        return
      }

      try {
        const raw =
          JSON.parse(
            $(el).text()
          )

        if (
          raw?.['@type'] ===
            type
        ) {
          result = raw
          return false
        }

        const graph =
          Array.isArray(
            raw?.['@graph']
          )
            ? raw['@graph']
            : []

        const found =
          graph.find(
            node =>
              node?.['@type'] ===
              type
          )

        if (found) {
          result = found
          return false
        }
      } catch {}
    }
  )

  return result || {}
}

function normalizeDetail({
  provider,
  title,
  url,
  icon = '',
  version = '',
  size = '',
  mod = '',
  packageName = '',
  android = '',
  updated = '',
  developer = '',
  rating = null,
  description = '',
  screenshots = [],
  downloads = []
}) {
  return {
    provider,
    providerLabel:
      providerLabel(
        provider
      ),
    title:
      clean(title, 180) ||
      'APK',
    url:
      safeRemoteUrl(url),
    icon:
      safeRemoteUrl(icon),
    version:
      clean(version, 100),
    size:
      clean(size, 80),
    mod:
      clean(mod, 260),
    package:
      clean(
        packageName,
        180
      ),
    android:
      clean(android, 100),
    updated:
      clean(updated, 100),
    developer:
      clean(developer, 140),
    rating:
      parseRating(rating),
    description:
      clean(description, 2500),
    screenshots:
      screenshots
        .map(x =>
          safeRemoteUrl(x)
        )
        .filter(Boolean)
        .slice(0, 8),
    downloads:
      downloads
        .map(
          (
            item,
            index
          ) => ({
            id:
              clean(
                item?.id ||
                String(index + 1),
                30
              ),
            name:
              clean(
                item?.name,
                180
              ),
            filename:
              clean(
                item?.filename,
                180
              ),
            size:
              clean(
                item?.size,
                80
              ),
            sourceUrl:
              safeRemoteUrl(
                item?.sourceUrl
              ),
            directUrl:
              safeRemoteUrl(
                item?.directUrl
              ),
            mimetype:
              clean(
                item?.mimetype,
                100
              )
          })
        )
        .filter(
          item =>
            item.sourceUrl ||
            item.directUrl
        )
  }
}

async function detailApkmody(
  item
) {
  const data =
    await postJson(
      APKMODY_API,
      {
        action:
          'detail',
        url:
          item.url
      }
    )

  if (
    data?.status !== true ||
    !data?.result
  ) {
    throw new Error(
      data?.message ||
      'APKMODY_DETAIL_FAILED'
    )
  }

  const result =
    data.result

  const downloads =
    Array.isArray(
      result.downloads
    )
      ? result.downloads.map(
          (
            file,
            index
          ) => ({
            id:
              String(index + 1),
            name:
              file?.fileName ||
              `${result.title || 'APK'} ${result.version || ''}`,
            filename:
              file?.fileName || '',
            size:
              file?.size || '',
            directUrl:
              file?.url || '',
            mimetype:
              String(
                file?.type || ''
              ).toLowerCase() ===
                'apk'
                ? 'application/vnd.android.package-archive'
                : 'application/octet-stream'
          })
        )
      : []

  return normalizeDetail({
    provider:
      'apkmody',
    title:
      result.title ||
      item.title,
    url:
      result.source ||
      item.url,
    icon:
      result.icon ||
      item.icon,
    version:
      result.version,
    size:
      downloads[0]?.size ||
      item.size,
    mod:
      result.mod ||
      item.mod,
    packageName:
      result.package,
    updated:
      result.updated,
    downloads
  })
}

async function detailLiteapks(
  item
) {
  const html =
    await curlHtml(
      item.url
    )

  const $ =
    cheerio.load(html)

  const rawTitle =
    clean(
      $('h1')
        .first()
        .text(),
      220
    ) ||
    item.title

  const title =
    rawTitle
      .replace(
        /\s+v?[\d.\-]+.*$/i,
        ''
      )
      .trim() ||
    rawTitle

  const schema =
    parseSchema(
      $,
      'SoftwareApplication'
    )

  const playLink =
    $('a[href*="play.google.com"]')
      .first()
      .attr('href') || ''

  let packageName = ''

  if (
    playLink.includes(
      'id='
    )
  ) {
    try {
      packageName =
        new URL(
          playLink
        ).searchParams.get(
          'id'
        ) || ''
    } catch {}
  }

  let developer =
    clean(
      $('.developer, [class*="developer"]')
        .first()
        .text(),
      140
    )

  if (
    !developer &&
    schema.author
  ) {
    developer =
      clean(
        typeof schema.author ===
          'object'
          ? schema.author.name
          : schema.author,
        140
      )
  }

  const stats = {}

  $('.app-stats .app-stat')
    .each(
      (_, el) => {
        const value =
          clean(
            $(el)
              .find('.value')
              .text(),
            100
          )

        const label =
          clean(
            $(el)
              .find('.label')
              .text(),
            80
          ).toLowerCase()

        if (
          label &&
          value
        ) {
          stats[label] =
            value
        }
      }
    )

  $('div, li, p')
    .each(
      (_, el) => {
        const lines =
          $(el)
            .text()
            .split('\n')
            .map(x =>
              clean(x, 120)
            )
            .filter(Boolean)

        if (
          lines.length < 2
        ) {
          return
        }

        const key =
          lines[0]
            .toLowerCase()

        if (
          [
            'version',
            'size',
            'genre',
            'developer',
            'updated'
          ].includes(key) &&
          !stats[key]
        ) {
          stats[key] =
            lines[1]
        }
      }
    )

  const modFeatures = []

  $('*').each(
    (_, el) => {
      if (
        $(el).children()
          .length !== 0
      ) {
        return
      }

      const text =
        clean(
          $(el).text(),
          240
        )

      if (
        /^(?:MOD|Mod info|MOD Info)\s*:/i
          .test(text)
      ) {
        const value =
          text.replace(
            /^MOD(?:\s*Info)?\s*:\s*/i,
            ''
          )

        if (
          value &&
          !modFeatures.includes(
            value
          )
        ) {
          modFeatures.push(
            value
          )
        }
      }
    }
  )

  if (
    !modFeatures.length &&
    /\([^)]*(?:mod|premium|unlocked|pro|vip)[^)]*\)/i
      .test(rawTitle)
  ) {
    const value =
      rawTitle.match(
        /\(([^)]*)\)/
      )?.[1]

    if (value) {
      modFeatures.push(value)
    }
  }

  let description =
    clean(
      schema.description ||
      $('meta[name="description"]')
        .attr('content') ||
      $('.entry-content p, #description p, .description p')
        .first()
        .text(),
      2500
    )

  let icon = ''

  $('header img, .app-stats img')
    .each(
      (_, img) => {
        const src =
          $(img).attr('src') ||
          $(img).attr(
            'data-src'
          ) || ''

        if (
          src &&
          src.includes(
            '/uploads/'
          ) &&
          !/avatar|gravatar|android\.ico/i
            .test(src)
        ) {
          icon =
            absoluteUrl(
              src,
              LITEAPKS_BASE
            )
          return false
        }
      }
    )

  if (!icon) {
    icon =
      item.icon
  }

  const screenshots = []

  $('a[href*="/uploads/"], img[src*="/uploads/"]')
    .each(
      (_, el) => {
        const src =
          $(el).attr('href') ||
          $(el).attr('src') ||
          ''

        if (
          !src ||
          /avatar|gravatar|android\.ico/i
            .test(src)
        ) {
          return
        }

        const full =
          absoluteUrl(
            src,
            LITEAPKS_BASE
          )

        if (
          full &&
          !screenshots.includes(
            full
          )
        ) {
          screenshots.push(
            full
          )
        }
      }
    )

  const candidateLinks = []

  $('a[href*="/download/"]')
    .each(
      (_, a) => {
        const href =
          $(a).attr('href') ||
          ''

        const full =
          absoluteUrl(
            href,
            LITEAPKS_BASE
          )

        if (
          full &&
          !candidateLinks.includes(
            full
          )
        ) {
          candidateLinks.push(
            full
          )
        }
      }
    )

  const downloads = []

  if (
    candidateLinks.length
  ) {
    const landing =
      candidateLinks[0]

    try {
      const dlHtml =
        await curlHtml(
          landing,
          {
            headers: {
              Referer:
                item.url
            },
            timeout: 15
          }
        )

      const $dl =
        cheerio.load(
          dlHtml
        )

      $dl(
        'a.dl-item, a[href*="/download/"]'
      ).each(
        (_, a) => {
          const href =
            $dl(a).attr(
              'href'
            ) || ''

          if (
            !/\/download\/[^/]+\/\d+(?:[/?#]|$)/
              .test(href)
          ) {
            return
          }

          const full =
            absoluteUrl(
              href,
              LITEAPKS_BASE
            )

          if (
            !full ||
            downloads.some(
              x =>
                x.sourceUrl ===
                full
            )
          ) {
            return
          }

          const name =
            clean(
              $dl(a)
                .find(
                  '.font-semibold, span.font-semibold'
                )
                .first()
                .text(),
              180
            ) ||
            `${title} APK`

          const size =
            clean(
              $dl(a)
                .find(
                  '.text-gray-3, span[class*="text-[10px]"]'
                )
                .last()
                .text(),
              80
            ) ||
            stats.size ||
            item.size

          downloads.push({
            id:
              String(
                downloads.length + 1
              ),
            name,
            size,
            sourceUrl:
              full,
            mimetype:
              'application/vnd.android.package-archive'
          })
        }
      )
    } catch (error) {
      console.warn(
        '[APK/liteapks] download landing:',
        error?.message ||
        error
      )
    }

    if (
      !downloads.length
    ) {
      for (
        const full
        of candidateLinks
      ) {
        downloads.push({
          id:
            String(
              downloads.length + 1
            ),
          name:
            `${title} APK`,
          size:
            stats.size ||
            item.size,
          sourceUrl:
            full,
          mimetype:
            'application/vnd.android.package-archive'
        })
      }
    }
  }

  return normalizeDetail({
    provider:
      'liteapks',
    title,
    url:
      item.url,
    icon,
    version:
      stats.version ||
      schema.softwareVersion ||
      item.version,
    size:
      stats.size ||
      item.size,
    mod:
      modFeatures.join(', ') ||
      item.mod,
    packageName,
    android:
      schema.operatingSystem,
    updated:
      stats.updated,
    developer:
      developer ||
      stats.developer,
    description,
    screenshots,
    downloads
  })
}

async function detailAn1(
  item
) {
  const html =
    await curlHtml(
      item.url
    )

  const $ =
    cheerio.load(html)

  const rawTitle =
    clean(
      $('h1')
        .first()
        .text(),
      220
    ) ||
    item.title

  const title =
    rawTitle
      .replace(
        /^Download\s+/i,
        ''
      )
      .replace(
        /\s+free on android$/i,
        ''
      )
      .trim() ||
    rawTitle

  const mod =
    rawTitle.match(
      /\(([^)]*MOD[^)]*)\)/i
    )?.[1] ||
    item.mod ||
    'Free'

  const developer =
    clean(
      $('.developer, [itemprop="author"]')
        .first()
        .text(),
      140
    ) ||
    item.developer

  const rating =
    parseRating(
      $('.rate_num, .current-rating')
        .first()
        .text()
    ) ??
    item.rating

  let icon =
    $('.app_view .img img, .item_app .img img')
      .first()
      .attr('src') ||
    item.icon ||
    ''

  icon =
    absoluteUrl(
      icon,
      AN1_BASE
    )

  const specs = {
    android: '',
    version: '',
    size: '',
    updated: ''
  }

  $('.spec').each(
    (_, el) => {
      const text =
        $(el).text()

      const android =
        text.match(
          /Android\s*([\d.]+\s*\+?)/i
        )

      const version =
        text.match(
          /Version:\s*([\d\w.\-]+)/i
        )

      const size =
        text.match(
          /([\d.]+\s*(?:MB|GB|KB|B))/i
        )

      const updated =
        text.match(
          /Updated\s*([A-Za-z]+\s*\d{1,2},\s*\d{4})/i
        )

      if (
        android &&
        !specs.android
      ) {
        specs.android =
          clean(
            android[1],
            80
          )
      }

      if (
        version &&
        !specs.version
      ) {
        specs.version =
          clean(
            version[1],
            80
          )
      }

      if (
        size &&
        !specs.size
      ) {
        specs.size =
          clean(
            size[1],
            80
          )
      }

      if (
        updated &&
        !specs.updated
      ) {
        specs.updated =
          clean(
            updated[1],
            100
          )
      }
    }
  )

  const descDiv =
    $('.description, [itemprop="description"], .text')
      .first()

  const description =
    clean(
      descDiv.text(),
      2500
    )

  const screenshots = []

  $('a[href*="/uploads/screenshots/"], img[src*="/screenshots/"]')
    .each(
      (_, el) => {
        const src =
          $(el).attr('href') ||
          $(el).attr('src') ||
          ''

        const full =
          absoluteUrl(
            src,
            AN1_BASE
          )

        if (
          full &&
          !screenshots.includes(
            full
          )
        ) {
          screenshots.push(full)
        }
      }
    )

  const downloads = []
  const seen =
    new Set()

  $('a[href*="file_"]')
    .each(
      (_, a) => {
        const href =
          $(a).attr('href') ||
          ''

        const full =
          absoluteUrl(
            href,
            AN1_BASE
          )

        if (
          !full ||
          seen.has(full)
        ) {
          return
        }

        seen.add(full)

        const buttonText =
          clean(
            $(a).text(),
            220
          )

        const size =
          buttonText.match(
            /([\d.]+\s*(?:MB|GB|KB|B))/i
          )?.[1] ||
          specs.size

        let name =
          buttonText
            .replace(
              /^Download\s*/i,
              ''
            )
            .trim()

        if (
          !name ||
          name.startsWith('(') ||
          /^apk$/i.test(name)
        ) {
          name =
            `${title}${size ? ` (${size})` : ''}`
        }

        downloads.push({
          id:
            String(
              downloads.length + 1
            ),
          name,
          size,
          sourceUrl:
            full,
          mimetype:
            'application/vnd.android.package-archive'
        })
      }
    )

  return normalizeDetail({
    provider:
      'an1',
    title,
    url:
      item.url,
    icon,
    version:
      specs.version,
    size:
      specs.size,
    mod,
    android:
      specs.android,
    updated:
      specs.updated,
    developer,
    rating,
    description,
    screenshots,
    downloads
  })
}

export async function getApkDetail(
  item
) {
  if (
    item?.provider ===
      'apkmody'
  ) {
    return detailApkmody(
      item
    )
  }

  if (
    item?.provider ===
      'an1'
  ) {
    return detailAn1(
      item
    )
  }

  if (
    item?.provider ===
      'liteapks'
  ) {
    return detailLiteapks(
      item
    )
  }

  throw new Error(
    'APK_PROVIDER_UNKNOWN'
  )
}

async function resolveLiteDownload(
  detail,
  option
) {
  let fullUrl =
    option.sourceUrl

  let html =
    await curlHtml(
      fullUrl,
      {
        headers: {
          Referer:
            detail.url ||
            `${LITEAPKS_BASE}/`
        }
      }
    )

  let dataLink =
    cheerio
      .load(html)(
        '[data-link]'
      )
      .first()
      .attr('data-link') ||
    html.match(
      /data-link=["']([^"']+)["']/i
    )?.[1] ||
    ''

  if (!dataLink) {
    const $ =
      cheerio.load(html)

    const sub =
      $('a.dl-item, a[href*="/download/"]')
        .filter(
          (_, el) => {
            const href =
              $(el).attr('href') ||
              ''

            return /\/download\/[^/]+\/\d+(?:[/?#]|$)/
              .test(href)
          }
        )
        .first()

    if (sub.length) {
      const nextUrl =
        absoluteUrl(
          sub.attr('href'),
          LITEAPKS_BASE
        )

      html =
        await curlHtml(
          nextUrl,
          {
            headers: {
              Referer:
                fullUrl
            }
          }
        )

      fullUrl =
        nextUrl

      dataLink =
        cheerio
          .load(html)(
            '[data-link]'
          )
          .first()
          .attr('data-link') ||
        html.match(
          /data-link=["']([^"']+)["']/i
        )?.[1] ||
        ''
    }
  }

  if (!dataLink) {
    throw new Error(
      'LITEAPKS_DIRECT_NOT_FOUND'
    )
  }

  let rawUrl

  try {
    rawUrl =
      Buffer.from(
        dataLink,
        'base64'
      ).toString(
        'utf8'
      )
  } catch {
    throw new Error(
      'LITEAPKS_DIRECT_DECODE_FAILED'
    )
  }

  const safe =
    safeRemoteUrl(
      rawUrl
    )

  if (!safe) {
    throw new Error(
      'LITEAPKS_DIRECT_INVALID'
    )
  }

  const ttl =
    Math.floor(
      Date.now() / 1000
    ) +
    3 * 60 * 60

  const token =
    Buffer.from(
      Buffer.from(
        String(ttl)
      ).toString(
        'base64'
      )
    ).toString(
      'base64'
    )

  const direct =
    new URL(safe)

  direct.searchParams.set(
    'token',
    token
  )

  const filename =
    decodeURIComponent(
      direct.pathname
        .split('/')
        .pop() ||
      option.filename ||
      'download.apk'
    )

  return {
    url:
      direct.href,
    filename:
      filename.endsWith(
        '.apk'
      ) ||
      filename.endsWith(
        '.zip'
      )
        ? filename
        : `${filename}.apk`,
    size:
      option.size ||
      detail.size,
    mimetype:
      option.mimetype ||
      'application/vnd.android.package-archive',
    headers: {
      Referer:
        `${LITEAPKS_BASE}/`,
      Origin:
        LITEAPKS_BASE,
      'User-Agent':
        UA
    }
  }
}

async function resolveAn1Download(
  detail,
  option
) {
  const html =
    await curlHtml(
      option.sourceUrl,
      {
        headers: {
          Referer:
            detail.url ||
            `${AN1_BASE}/`
        }
      }
    )

  const $ =
    cheerio.load(html)

  let direct =
    $('a#pre_download, a[href*="files.an1."]')
      .filter(
        (_, el) => {
          const href =
            $(el).attr('href') ||
            ''

          return (
            href &&
            !href.endsWith(
              'an1store.apk'
            )
          )
        }
      )
      .first()
      .attr('href') ||
    ''

  if (!direct) {
    $('a').each(
      (_, el) => {
        const href =
          $(el).attr('href') ||
          ''

        if (
          (
            href.includes(
              'files.an1.'
            ) ||
            /\.(?:apk|zip)(?:[?#]|$)/i
              .test(href)
          ) &&
          !href.endsWith(
            'an1store.apk'
          )
        ) {
          direct = href
          return false
        }
      }
    )
  }

  direct =
    absoluteUrl(
      direct,
      AN1_BASE
    )

  const safe =
    safeRemoteUrl(
      direct
    )

  if (!safe) {
    throw new Error(
      'AN1_DIRECT_NOT_FOUND'
    )
  }

  const url =
    new URL(safe)

  const filename =
    decodeURIComponent(
      url.pathname
        .split('/')
        .pop() ||
      option.filename ||
      'download.apk'
    )

  return {
    url:
      url.href,
    filename:
      filename ||
      'download.apk',
    size:
      option.size ||
      detail.size,
    mimetype:
      option.mimetype ||
      'application/vnd.android.package-archive',
    headers: {
      Referer:
        `${AN1_BASE}/`,
      Origin:
        AN1_BASE,
      'User-Agent':
        UA
    }
  }
}

export async function resolveApkDownload(
  detail,
  optionIndex = 0
) {
  const option =
    detail?.downloads?.[
      optionIndex
    ]

  if (!option) {
    throw new Error(
      'APK_DOWNLOAD_OPTION_INVALID'
    )
  }

  if (
    detail.provider ===
      'apkmody'
  ) {
    const url =
      safeRemoteUrl(
        option.directUrl
      )

    if (!url) {
      throw new Error(
        'APKMODY_DIRECT_NOT_FOUND'
      )
    }

    return {
      url,
      filename:
        option.filename ||
        `${detail.title}-${detail.version || 'latest'}.apk`,
      size:
        option.size ||
        detail.size,
      mimetype:
        option.mimetype ||
        'application/vnd.android.package-archive',
      headers: {}
    }
  }

  if (
    detail.provider ===
      'an1'
  ) {
    return resolveAn1Download(
      detail,
      option
    )
  }

  if (
    detail.provider ===
      'liteapks'
  ) {
    return resolveLiteDownload(
      detail,
      option
    )
  }

  throw new Error(
    'APK_PROVIDER_UNKNOWN'
  )
}

export function parseSizeBytes(
  value
) {
  const raw =
    clean(
      value,
      100
    )
      .replace(',', '.')

  const match =
    raw.match(
      /([\d.]+)\s*(B|KB|MB|GB|TB)\b/i
    )

  if (!match) {
    return null
  }

  const number =
    Number(
      match[1]
    )

  if (
    !Number.isFinite(
      number
    ) ||
    number < 0
  ) {
    return null
  }

  const power = {
    B: 0,
    KB: 1,
    MB: 2,
    GB: 3,
    TB: 4
  }[
    match[2]
      .toUpperCase()
  ]

  return (
    number *
    1024 ** power
  )
}

function safeFilename(
  value,
  fallback = 'NEXA.apk'
) {
  let name =
    clean(
      value,
      200
    )
      .replace(
        /[\\/:*?"<>|\u0000-\u001f\u007f]+/g,
        '_'
      )
      .trim()

  if (!name) {
    name = fallback
  }

  return name
}

async function downloadWithFetch(
  resolved,
  filePath
) {
  const controller =
    new AbortController()

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      DOWNLOAD_TIMEOUT * 1000
    )

  try {
    const response =
      await fetch(
        resolved.url,
        {
          redirect:
            'follow',
          headers:
            resolved.headers ||
            {},
          signal:
            controller.signal
        }
      )

    if (!response.ok) {
      throw new Error(
        `APK_CDN_HTTP_${response.status}`
      )
    }

    if (!response.body) {
      throw new Error(
        'APK_CDN_EMPTY_BODY'
      )
    }

    const contentLength =
      Number(
        response.headers.get(
          'content-length'
        ) || 0
      )

    if (
      contentLength >
      MAX_APK_DOWNLOAD_BYTES
    ) {
      throw new Error(
        'APK_FILE_TOO_LARGE'
      )
    }

    await pipeline(
      Readable.fromWeb(
        response.body
      ),
      createDownloadSizeGuard(),
      createWriteStream(
        filePath,
        {
          flags:
            'wx'
        }
      )
    )
  } finally {
    clearTimeout(timer)
  }
}

function downloadWithCurl(
  resolved,
  filePath
) {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      const args = [
        '-fL',
        '--retry',
        '2',
        '--retry-delay',
        '1',
        '--connect-timeout',
        '30',
        '--max-time',
        String(
          DOWNLOAD_TIMEOUT
        ),
        '--max-filesize',
        String(
          MAX_APK_DOWNLOAD_BYTES
        ),
        '-o',
        filePath
      ]

      for (
        const [
          key,
          value
        ] of Object.entries(
          resolved.headers ||
          {}
        )
      ) {
        if (
          value !== undefined &&
          value !== null &&
          String(value).trim()
        ) {
          args.push(
            '-H',
            `${key}: ${value}`
          )
        }
      }

      args.push(
        resolved.url
      )

      const child =
        spawn(
          'curl',
          args,
          {
            stdio: [
              'ignore',
              'ignore',
              'pipe'
            ]
          }
        )

      let stderr = ''
      let settled = false

      child.stderr.on(
        'data',
        chunk => {
          stderr +=
            chunk.toString()
              .slice(0, 3000)
        }
      )

      child.once(
        'error',
        error => {
          if (settled) {
            return
          }

          settled = true

          if (
            error?.code ===
              'ENOENT'
          ) {
            downloadWithFetch(
              resolved,
              filePath
            ).then(
              resolve,
              reject
            )

            return
          }

          reject(error)
        }
      )

      child.once(
        'close',
        code => {
          if (settled) {
            return
          }

          settled = true

          if (code !== 0) {
            if (
              code === 63
            ) {
              reject(
                new Error(
                  'APK_FILE_TOO_LARGE'
                )
              )

              return
            }

            reject(
              new Error(
                `APK_CURL_${code}: ${clean(stderr, 500)}`
              )
            )

            return
          }

          resolve()
        }
      )
    }
  )
}

async function validateDownloadedFile({
  filePath,
  expectedBytes
}) {
  const info =
    await stat(filePath)

  const actualBytes =
    Number(
      info.size || 0
    )

  if (!actualBytes) {
    throw new Error(
      'APK_FILE_EMPTY'
    )
  }

  if (
    actualBytes >
    MAX_APK_DOWNLOAD_BYTES
  ) {
    throw new Error(
      'APK_FILE_TOO_LARGE'
    )
  }

  const handle =
    await open(
      filePath,
      'r'
    )

  const head =
    Buffer.alloc(2048)

  let bytesRead = 0

  try {
    const result =
      await handle.read(
        head,
        0,
        head.length,
        0
      )

    bytesRead =
      result.bytesRead
  } finally {
    await handle.close()
  }

  const text =
    head
      .subarray(
        0,
        bytesRead
      )
      .toString('utf8')
      .toLowerCase()

  if (
    text.includes(
      '<!doctype html'
    ) ||
    text.includes(
      '<html'
    )
  ) {
    throw new Error(
      'APK_FILE_IS_HTML'
    )
  }

  if (
    expectedBytes &&
    expectedBytes >=
      1024 * 1024 &&
    actualBytes <
      expectedBytes * 0.65
  ) {
    throw Object.assign(
      new Error(
        'APK_SIZE_MISMATCH'
      ),
      {
        expectedBytes,
        actualBytes
      }
    )
  }

  return actualBytes
}

export async function downloadApkToTemp(
  resolved
) {
  const dir =
    await mkdtemp(
      join(
        tmpdir(),
        'nexa-apk-'
      )
    )

  const filename =
    safeFilename(
      resolved.filename,
      'NEXA.apk'
    )

  const filePath =
    join(
      dir,
      filename
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
    const expectedBytes =
      parseSizeBytes(
        resolved.size
      )

    if (
      expectedBytes &&
      expectedBytes >
        MAX_APK_DOWNLOAD_BYTES
    ) {
      throw new Error(
        'APK_FILE_TOO_LARGE'
      )
    }

    await downloadWithCurl(
      resolved,
      filePath
    )

    const actualBytes =
      await validateDownloadedFile({
        filePath,
        expectedBytes
      })

    return {
      filePath,
      filename,
      actualBytes,
      cleanup
    }
  } catch (error) {
    await cleanup()
    throw error
  }
}

export function formatBytes(
  value
) {
  const size =
    Number(value)

  if (
    !Number.isFinite(size) ||
    size < 0
  ) {
    return '-'
  }

  if (
    size < 1024
  ) {
    return `${size} B`
  }

  const units = [
    'KB',
    'MB',
    'GB',
    'TB'
  ]

  let current =
    size / 1024

  let unit =
    units[0]

  for (
    let i = 1;
    i < units.length &&
    current >= 1024;
    i++
  ) {
    current /= 1024
    unit = units[i]
  }

  return (
    `${current.toFixed(2)} ${unit}`
  )
}
