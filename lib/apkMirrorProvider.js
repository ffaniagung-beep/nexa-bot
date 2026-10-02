// NEXA APKMIRROR PROVIDER V1
// Search -> release -> variant -> APK download.
// Metadata cache is RAM-only, bounded, and expires automatically.

import * as cheerio from 'cheerio'

const BASE = 'https://www.apkmirror.com'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36'

const HTML_TIMEOUT = 45_000
const MAX_HTML_BYTES = 8 * 1024 * 1024
const CACHE_TTL = 10 * 60 * 1000
const CACHE_MAX = 80

const cache = new Map()

function clean(value, max = 1000) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function absoluteUrl(value, base = BASE) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  try {
    return new URL(raw, base).href
  } catch {
    return ''
  }
}

function assertMirrorUrl(value) {
  const url = new URL(String(value || ''))
  const host = url.hostname.toLowerCase()

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !(
      host === 'apkmirror.com' ||
      host === 'www.apkmirror.com' ||
      host.endsWith('.apkmirror.com')
    )
  ) {
    throw new Error('APKMIRROR_URL_INVALID')
  }

  return url.href
}

function cleanupCache() {
  const time = Date.now()

  for (const [key, entry] of cache) {
    if (time - entry.time > CACHE_TTL) {
      cache.delete(key)
    }
  }

  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (!oldest) break
    cache.delete(oldest)
  }
}

function cacheGet(key) {
  cleanupCache()
  const hit = cache.get(key)
  if (!hit) return null

  hit.time = Date.now()
  cache.delete(key)
  cache.set(key, hit)
  return hit.value
}

function cacheSet(key, value) {
  cleanupCache()
  cache.set(key, {
    time: Date.now(),
    value
  })
  cleanupCache()
  return value
}

async function fetchHtml(url) {
  const safe = assertMirrorUrl(url)
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(),
    HTML_TIMEOUT
  )

  try {
    const response = await fetch(safe, {
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language':
          'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        Referer: `${BASE}/`
      },
      signal: controller.signal
    })

    if (!response.ok) {
      if ([403, 429, 503].includes(response.status)) {
        throw new Error(`APKMIRROR_BLOCKED_${response.status}`)
      }
      throw new Error(`APKMIRROR_HTTP_${response.status}`)
    }

    const length = Number(
      response.headers.get('content-length') || 0
    )

    if (length > MAX_HTML_BYTES) {
      throw new Error('APKMIRROR_HTML_TOO_LARGE')
    }

    const text = await response.text()

    if (Buffer.byteLength(text) > MAX_HTML_BYTES) {
      throw new Error('APKMIRROR_HTML_TOO_LARGE')
    }

    if (
      /cf-chl-|just a moment|checking your browser|attention required/i.test(text)
    ) {
      throw new Error('APKMIRROR_CLOUDFLARE')
    }

    return text
  } finally {
    clearTimeout(timer)
  }
}

function firstImage($, scope) {
  const node = scope && scope.length ? scope : $.root()
  const image = node.find('img').first()
  return absoluteUrl(
    image.attr('data-src') ||
      image.attr('data-lazy-src') ||
      image.attr('src') ||
      $('meta[property="og:image"]').attr('content') ||
      ''
  )
}

function isReleasePath(pathname) {
  return /^\/apk\/[^/]+\/[^/]+\/[^/]+-release\/?$/i.test(
    pathname
  )
}

function isVariantPath(pathname) {
  return /^\/apk\/[^/]+\/[^/]+\/[^/]+-release\/[^/]+-android-apk-download\/?$/i.test(
    pathname
  )
}

function versionFromText(text) {
  const value = clean(text, 220)
  const match = value.match(
    /\b(v?\d+(?:[._-]\d+){1,}(?:[-+._a-z0-9]*)?)\b/i
  )
  return clean(match?.[1] || '', 80)
}

function appTitleFromRelease(title, version) {
  const value = clean(title, 180)
  if (!version) return value

  const index = value.toLowerCase().lastIndexOf(
    version.toLowerCase()
  )

  if (index > 0) {
    return clean(value.slice(0, index), 160)
  }

  return value
}

export async function searchApkMirror(query, page = 1) {
  const q = clean(query, 120)
  if (!q) throw new Error('APP_QUERY_EMPTY')

  const pageNumber = Math.max(1, Number(page) || 1)
  const cacheKey =
    `search:${q.toLowerCase()}:${pageNumber}`
  const cached = cacheGet(cacheKey)

  if (cached) {
    return cached
  }

  const url = new URL(BASE)
  url.searchParams.set('post_type', 'app_release')
  url.searchParams.set('searchtype', 'apk')
  url.searchParams.set('s', q)

  if (pageNumber > 1) {
    url.searchParams.set('paged', String(pageNumber))
  }

  const html = await fetchHtml(url.href)
  const $ = cheerio.load(html)
  const output = []
  const seen = new Set()

  $('a[href]').each((_, element) => {
    if (output.length >= 10) return false

    const anchor = $(element)
    const href = absoluteUrl(anchor.attr('href'))
    if (!href) return

    let parsed
    try {
      parsed = new URL(href)
    } catch {
      return
    }

    if (!isReleasePath(parsed.pathname)) return
    if (seen.has(parsed.pathname)) return

    let title = clean(anchor.text(), 180)
    if (!title || /^\d+\s*variants?/i.test(title)) return

    const row = anchor.closest(
      '.appRow, .listWidget, .table-row, article, .appRowTitleWrap'
    )

    const rowText = clean(row.text(), 700)
    const version =
      clean(
        rowText.match(/Version:\s*([^\s]+(?:\s+(?:alpha|beta))?)/i)?.[1],
        80
      ) || versionFromText(title)

    const appTitle = appTitleFromRelease(title, version)

    const developer = clean(
      row
        .find(
          '.appRowDeveloper a, a[href*="/uploads/"], a[href*="developer"]'
        )
        .first()
        .text(),
      100
    )

    const size = clean(
      rowText.match(
        /File\s*size:\s*([\d.,]+\s*(?:KB|MB|GB|TB))/i
      )?.[1],
      60
    )

    const variants = Number(
      rowText.match(/(\d+)\s*variants?/i)?.[1] || 0
    )

    seen.add(parsed.pathname)
    output.push({
      provider: 'apkmirror',
      providerLabel: 'APKMirror',
      title: appTitle || title,
      version,
      developer,
      icon: firstImage($, row),
      description:
        `Release APKMirror${variants ? ` • ${variants} variant` : ''}`,
      size,
      fileType: 'APK',
      url: href,
      releaseTitle: title
    })
  })

  return cacheSet(
    cacheKey,
    output
  )
}

function parseVariantRow($, anchor) {
  const href = absoluteUrl(anchor.attr('href'))
  if (!href) return null

  let parsed
  try {
    parsed = new URL(href)
  } catch {
    return null
  }

  if (!isVariantPath(parsed.pathname)) return null

  const row = anchor.closest('.table-row')
  const scope = row.length ? row : anchor.parent().parent()
  const text = clean(scope.text(), 900)
  const cells = scope
    .find('.table-cell')
    .map((_, cell) => clean($(cell).text(), 300))
    .get()
    .filter(Boolean)

  const firstCell = cells[0] || text
  const fileType = /\bBUNDLE\b/i.test(firstCell)
    ? 'BUNDLE'
    : /\bAPK\b/i.test(firstCell)
      ? 'APK'
      : /\bBUNDLE\b/i.test(text)
        ? 'BUNDLE'
        : 'APK'

  const arch =
    cells.find(value =>
      /(?:arm64-v8a|armeabi-v7a|x86_64|\bx86\b|noarch)/i.test(value)
    ) ||
    clean(
      text.match(
        /((?:arm64-v8a|armeabi-v7a|x86_64|x86|noarch)(?:\s*\+\s*(?:arm64-v8a|armeabi-v7a|x86_64|x86|noarch))*)/i
      )?.[1],
      100
    )

  const android =
    cells.find(value => /Android\s+[\w.]+\+/i.test(value)) ||
    clean(text.match(/(Android\s+[\w.]+\+)/i)?.[1], 80)

  const dpi =
    cells.find(value => /(?:nodpi|dpi)/i.test(value)) ||
    clean(text.match(/\b(nodpi|\d+(?:-\d+)?dpi)\b/i)?.[1], 50)

  const version = clean(anchor.text(), 80)
  const versionCode = clean(
    firstCell.match(/\b(\d{6,12})\b/)?.[1] ||
      text.match(/\b(\d{6,12})\b/)?.[1],
    30
  )

  const date = clean(
    text.match(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/i
    )?.[0],
    60
  )

  return {
    url: href,
    version,
    versionCode,
    fileType,
    arch,
    android,
    dpi,
    date,
    label: clean(
      [
        version,
        fileType,
        arch,
        android,
        dpi
      ]
        .filter(Boolean)
        .join(' • '),
      260
    )
  }
}

export async function detailApkMirror(item) {
  const url = assertMirrorUrl(item?.url)
  const cacheKey = `detail:${url}`
  const cached = cacheGet(cacheKey)

  if (cached) {
    return cached
  }

  const html = await fetchHtml(url)
  const $ = cheerio.load(html)

  const pageTitle = clean(
    $('h1').first().text() || item.releaseTitle || item.title,
    180
  )

  const version = item.version || versionFromText(pageTitle)
  const title = appTitleFromRelease(pageTitle, version) || item.title

  const developer = clean(
    $('h3 a, a[href*="/uploads/"], .appRowDeveloper a')
      .first()
      .text() || item.developer,
    120
  )

  const description = clean(
    $('meta[name="description"]').attr('content') ||
      $('[itemprop="description"]').first().text() ||
      item.description,
    480
  )

  const variants = []
  const seen = new Set()

  $('a[href]').each((_, element) => {
    const parsed = parseVariantRow($, $(element))
    if (!parsed) return

    const key = new URL(parsed.url).pathname
    if (seen.has(key)) return
    seen.add(key)
    variants.push(parsed)
  })

  variants.sort((a, b) => {
    const aApk = a.fileType === 'APK' ? 0 : 1
    const bApk = b.fileType === 'APK' ? 0 : 1
    return aApk - bApk
  })

  if (!variants.length) {
    throw new Error('APKMIRROR_VARIANTS_NOT_FOUND')
  }

  return cacheSet(
    cacheKey,
    {
    ...item,
    provider: 'apkmirror',
    providerLabel: 'APKMirror',
    title,
    version,
    developer,
    icon:
      absoluteUrl($('meta[property="og:image"]').attr('content')) ||
      item.icon,
    description,
    fileType: 'APK',
    variants,
    variantCount: variants.length,
    standaloneCount: variants.filter(v => v.fileType === 'APK').length
    }
  )
}

function extractHash(text) {
  const section = String(text || '')
    .split(/APK file hashes/i)[1] || ''

  return clean(
    section.match(/SHA-256:\s*([a-f0-9]{64})/i)?.[1],
    80
  )
}

export async function selectApkMirrorVariant(detail, index) {
  const variant = detail?.variants?.[Number(index)]
  if (!variant) {
    throw new Error('APKMIRROR_VARIANT_INVALID')
  }

  if (variant.fileType !== 'APK') {
    throw new Error('APKMIRROR_BUNDLE_UNSUPPORTED')
  }

  const cacheKey = `variant:${variant.url}`
  const cached = cacheGet(cacheKey)

  if (cached) {
    return {
      ...detail,
      ...cached,
      selectedVariant: Number(index),
      variant
    }
  }

  const html = await fetchHtml(variant.url)
  const $ = cheerio.load(html)
  const bodyText = clean($('body').text(), 50_000)

  const size = clean(
    bodyText.match(
      /([\d.,]+\s*(?:KB|MB|GB|TB))\s*\([\d,]+\s*bytes\)/i
    )?.[1] ||
      bodyText.match(/File\s*size:\s*([\d.,]+\s*(?:KB|MB|GB|TB))/i)?.[1],
    60
  )

  const packageName = clean(
    bodyText.match(/Package:\s*([A-Za-z0-9._]+)/i)?.[1],
    180
  )

  const minAndroid = clean(
    bodyText.match(/Min:\s*(Android\s+[^T]{1,80}?)(?=Target:|armeabi|arm64|x86|noarch|nodpi|Uploaded)/i)?.[1] ||
      variant.android,
    100
  )

  const downloadLink = $('a[href]')
    .filter((_, element) => {
      const anchor = $(element)
      const href = String(anchor.attr('href') || '')
      const text = clean(anchor.text(), 120)
      return (
        /\/download\/(?:\?|$)/i.test(href) &&
        /Download\s+APK/i.test(text)
      )
    })
    .first()

  const downloadPageUrl = absoluteUrl(
    downloadLink.attr('href'),
    variant.url
  )

  if (!downloadPageUrl) {
    throw new Error('APKMIRROR_DOWNLOAD_PAGE_NOT_FOUND')
  }

  const metadata = {
    title:
      clean($('h1').first().text(), 180) || detail.title,
    packageName:
      packageName || detail.packageName || '',
    android:
      minAndroid || variant.android || detail.android || '',
    size:
      size || detail.size || '',
    fileType: 'APK',
    arch: variant.arch,
    dpi: variant.dpi,
    version:
      variant.version || detail.version,
    versionCode:
      variant.versionCode,
    sha256:
      extractHash(bodyText),
    downloadPageUrl
  }

  cacheSet(
    cacheKey,
    metadata
  )

  return {
    ...detail,
    ...metadata,
    selectedVariant:
      Number(index),
    variant
  }
}

function safeFilename(value) {
  return clean(value, 180)
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, '_')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function resolveApkMirrorDownload(detail) {
  if (!detail?.downloadPageUrl) {
    throw new Error('APKMIRROR_VARIANT_REQUIRED')
  }

  const page = assertMirrorUrl(detail.downloadPageUrl)
  const html = await fetchHtml(page)
  const $ = cheerio.load(html)

  const directAnchor = $('a[href]')
    .filter((_, element) => {
      const href = String($(element).attr('href') || '')
      return /\/wp-content\/themes\/APKMirror\/download\.php\?/i.test(href)
    })
    .first()

  const direct = absoluteUrl(
    directAnchor.attr('href'),
    page
  )

  if (!direct) {
    throw new Error('APKMIRROR_DIRECT_NOT_FOUND')
  }

  const filename =
    safeFilename(
      [
        detail.packageName || detail.title || 'NEXA-App',
        detail.version,
        detail.arch
      ]
        .filter(Boolean)
        .join('-')
    ) + '.apk'

  return {
    url: assertMirrorUrl(direct),
    filename,
    fileType: 'APK',
    size: detail.size || '',
    headers: {
      'User-Agent': UA,
      Referer: page,
      Accept: '*/*'
    }
  }
}
