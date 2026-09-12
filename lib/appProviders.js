// NEXA ORIGINAL APP PROVIDERS V1
// Adapted from the user-provided Lann scraper source.
// Providers: APKPure + Uptodown. No browser/headless runtime.

import * as cheerio from 'cheerio'

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

import {
  Readable,
  Transform
} from 'node:stream'

import {
  pipeline
} from 'node:stream/promises'

const APKPURE_BASE =
  'https://apkpure.com'

const UPTODOWN_BASE =
  'https://id.uptodown.com'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36'

const HTML_TIMEOUT =
  45_000

const DOWNLOAD_TIMEOUT =
  20 * 60 * 1000

const MAX_HTML_BYTES =
  8 * 1024 * 1024

export const MAX_APP_DOWNLOAD_BYTES =
  1024 * 1024 * 1024

let cfPromise = null

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
    String(value || '').trim()

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
    String(hostname || '')
      .toLowerCase()
      .replace(/^\[|\]$/g, '')

  if (
    host === 'localhost' ||
    host === '::1' ||
    host.endsWith('.local') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host)
  ) {
    return true
  }

  const match =
    host.match(
      /^172\.(\d+)\./
    )

  return Boolean(
    match &&
    Number(match[1]) >= 16 &&
    Number(match[1]) <= 31
  )
}

export function safeRemoteUrl(
  value
) {
  try {
    const url =
      new URL(
        String(value || '')
      )

    if (
      ![
        'http:',
        'https:'
      ].includes(
        url.protocol
      ) ||
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

function assertHost(
  value,
  allowed
) {
  const safe =
    safeRemoteUrl(value)

  if (!safe) {
    throw new Error(
      'APP_REMOTE_URL_INVALID'
    )
  }

  const host =
    new URL(safe)
      .hostname
      .toLowerCase()

  const ok =
    allowed.some(
      item =>
        host === item ||
        host.endsWith(
          `.${item}`
        )
    )

  if (!ok) {
    throw new Error(
      'APP_REMOTE_HOST_BLOCKED'
    )
  }

  return safe
}

async function getCloudflareHelper() {
  if (!cfPromise) {
    cfPromise =
      import('haidarcf')
        .then(mod => {
          const helper =
            mod?.haidar ||
            mod?.default?.haidar ||
            mod?.default

          if (
            !helper ||
            typeof helper !== 'object'
          ) {
            throw new Error(
              'HAIDARCF_API_INVALID'
            )
          }

          return helper
        })
        .catch(error => {
          cfPromise = null

          if (
            error?.code ===
            'ERR_MODULE_NOT_FOUND'
          ) {
            throw new Error(
              'HAIDARCF_NOT_INSTALLED'
            )
          }

          throw error
        })
  }

  return cfPromise
}

async function fetchText(
  url,
  {
    headers = {},
    timeout =
      HTML_TIMEOUT
  } = {}
) {
  const controller =
    new AbortController()

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      timeout
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
              'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            ...headers
          },
          signal:
            controller.signal
        }
      )

    if (!response.ok) {
      throw new Error(
        `APP_HTTP_${response.status}`
      )
    }

    const text =
      await response.text()

    if (
      Buffer.byteLength(text) >
      MAX_HTML_BYTES
    ) {
      throw new Error(
        'APP_HTML_TOO_LARGE'
      )
    }

    return text
  } finally {
    clearTimeout(timer)
  }
}

async function fetchApkPureHtml(
  target
) {
  const url =
    absoluteUrl(
      target,
      APKPURE_BASE
    )

  assertHost(
    url,
    [
      'apkpure.com'
    ]
  )

  const cf =
    await getCloudflareHelper()

  if (
    typeof cf.source !==
    'function'
  ) {
    throw new Error(
      'HAIDARCF_SOURCE_UNAVAILABLE'
    )
  }

  const result =
    await cf.source({
      url
    })

  const html =
    String(
      result?.source || ''
    )

  if (!html) {
    throw new Error(
      'APKPURE_HTML_EMPTY'
    )
  }

  if (
    Buffer.byteLength(html) >
    MAX_HTML_BYTES
  ) {
    throw new Error(
      'APP_HTML_TOO_LARGE'
    )
  }

  return html
}

function parseJsonLd(
  html
) {
  const $ =
    cheerio.load(html)

  let mobileApp = null

  $(
    'script[type="application/ld+json"]'
  ).each(
    (_, el) => {
      try {
        const parsed =
          JSON.parse(
            $(el).html() || ''
          )

        const queue =
          Array.isArray(parsed)
            ? parsed
            : [parsed]

        for (
          const item
          of queue
        ) {
          if (
            item?.['@type'] ===
            'MobileApplication'
          ) {
            mobileApp = item
          }

          if (
            item?.mainEntity?.['@type'] ===
            'MobileApplication'
          ) {
            mobileApp =
              item.mainEntity
          }
        }
      } catch {}
    }
  )

  return mobileApp
}

function parseRating(
  value
) {
  const number =
    Number.parseFloat(
      String(value ?? '')
    )

  return Number.isFinite(number)
    ? number
    : null
}

function makeSearchItem({
  provider,
  title,
  url,
  icon = '',
  developer = '',
  rating = null,
  description = '',
  top = false
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
      provider === 'apkpure'
        ? 'APKPure'
        : 'Uptodown',
    title:
      clean(title, 180),
    url:
      safeUrl,
    icon:
      safeRemoteUrl(icon),
    developer:
      clean(developer, 120),
    rating:
      parseRating(rating),
    description:
      clean(description, 220),
    top:
      Boolean(top)
  }
}

async function searchApkPure(
  query,
  page = 1
) {
  const url =
    `${APKPURE_BASE}/id/search?q=${encodeURIComponent(query)}&page=${Math.max(1, Number(page) || 1)}`

  const html =
    await fetchApkPureHtml(url)

  const $ =
    cheerio.load(html)

  const items = []

  const top =
    $('.first.brand')
      .first()

  if (top.length) {
    const link =
      top.find(
        '.first-info a, a'
      ).first()
        .attr('href') || ''

    const item =
      makeSearchItem({
        provider:
          'apkpure',
        title:
          clean(
            top.find('.p1')
              .first()
              .text()
          ),
        url:
          absoluteUrl(
            link,
            APKPURE_BASE
          ),
        icon:
          top.find('img')
            .first()
            .attr('data-original') ||
          top.find('img')
            .first()
            .attr('src') || '',
        developer:
          clean(
            top.find('.p2')
              .first()
              .text()
          ),
        rating:
          clean(
            top.find(
              '.star, .score'
            ).first().text()
          ),
        top: true
      })

    if (item) {
      items.push(item)
    }
  }

  $('ul.search-res > li')
    .each(
      (_, el) => {
        const node =
          $(el)

        const link =
          node.find('a')
            .first()
            .attr('href') || ''

        const item =
          makeSearchItem({
            provider:
              'apkpure',
            title:
              clean(
                node.find(
                  '.p1, a.title, .name'
                ).first().text()
              ),
            url:
              absoluteUrl(
                link,
                APKPURE_BASE
              ),
            icon:
              node.find('img')
                .first()
                .attr('data-original') ||
              node.find('img')
                .first()
                .attr('src') || '',
            developer:
              clean(
                node.find(
                  '.p2, .developer, .author'
                ).first().text()
              ),
            rating:
              clean(
                node.find(
                  '.star, .score'
                ).first().text()
              )
          })

        if (
          item &&
          !items.some(
            x => x.url === item.url
          )
        ) {
          items.push(item)
        }
      }
    )

  return items
}

async function searchUptodown(
  query,
  page = 1
) {
  const url =
    `${UPTODOWN_BASE}/android/search?query=${encodeURIComponent(query)}&page=${Math.max(1, Number(page) || 1)}`

  const html =
    await fetchText(url)

  const $ =
    cheerio.load(html)

  const items = []

  $('.item').each(
    (index, el) => {
      const node =
        $(el)

      const link =
        node.find('a')
          .first()
          .attr('href') || ''

      if (
        !/uptodown\.com\/android/i
          .test(link)
      ) {
        return
      }

      const item =
        makeSearchItem({
          provider:
            'uptodown',
          title:
            clean(
              node.find(
                '.name, a.name, h2, h3'
              ).first().text()
            ),
          url: link,
          icon:
            node.find('img')
              .first()
              .attr('src') ||
            node.find('img')
              .first()
              .attr('data-src') || '',
          developer:
            clean(
              node.find(
                '.author, .developer'
              ).first().text()
            ),
          description:
            clean(
              node.find(
                '.description, p'
              ).first().text()
            ),
          // Deliberately do NOT invent a rating.
          rating: null,
          top:
            index === 0
        })

      if (
        item &&
        !items.some(
          x => x.url === item.url
        )
      ) {
        items.push(item)
      }
    }
  )

  return items
}

function interleave(
  lists,
  max = 16
) {
  const output = []
  const seen = new Set()

  const longest =
    Math.max(
      0,
      ...lists.map(
        list => list.length
      )
    )

  for (
    let index = 0;
    index < longest &&
    output.length < max;
    index += 1
  ) {
    for (
      const list
      of lists
    ) {
      const item =
        list[index]

      if (!item) {
        continue
      }

      const key =
        `${item.provider}:${item.url}`

      if (seen.has(key)) {
        continue
      }

      seen.add(key)
      output.push(item)

      if (
        output.length >= max
      ) {
        break
      }
    }
  }

  return output
}

export async function searchOriginalApps(
  query,
  page = 1
) {
  const cleanQuery =
    clean(query, 120)

  if (!cleanQuery) {
    throw new Error(
      'APP_QUERY_EMPTY'
    )
  }

  const providers = [
    [
      'apkpure',
      'APKPure',
      () =>
        searchApkPure(
          cleanQuery,
          page
        )
    ],
    [
      'uptodown',
      'Uptodown',
      () =>
        searchUptodown(
          cleanQuery,
          page
        )
    ]
  ]

  const settled =
    await Promise.all(
      providers.map(
        async ([
          provider,
          label,
          run
        ]) => {
          try {
            const items =
              await run()

            return {
              provider,
              label,
              ok: true,
              items
            }
          } catch (error) {
            return {
              provider,
              label,
              ok: false,
              items: [],
              error:
                clean(
                  error?.message ||
                  error,
                  250
                )
            }
          }
        }
      )
    )

  return {
    items:
      interleave(
        settled.map(
          item => item.items
        ),
        16
      ),
    providers:
      settled.map(
        item => ({
          provider:
            item.provider,
          label:
            item.label,
          ok:
            item.ok,
          count:
            item.items.length,
          error:
            item.error || ''
        })
      )
  }
}

async function detailApkPure(
  item
) {
  const html =
    await fetchApkPureHtml(
      item.url
    )

  const $ =
    cheerio.load(html)

  const jsonLd =
    parseJsonLd(html)

  const title =
    clean(
      jsonLd?.name ||
      $('h1, .detail-banner .title, .banner .title')
        .first()
        .text() ||
      item.title,
      180
    )

  const developer =
    clean(
      jsonLd?.publisher?.name ||
      $('.author, .developer, a[href*="/developer/"]')
        .first()
        .text()
        .replace(/Selebihnya.*/i, '') ||
      item.developer,
      120
    )

  const icon =
    safeRemoteUrl(
      $('img[alt*="ikon"], .detail-banner img, .icon-wrap img')
        .first()
        .attr('src') ||
      $('img[alt*="icon"]')
        .first()
        .attr('src') ||
      $('meta[property="og:image"]')
        .attr('content') ||
      item.icon
    )

  const rating =
    parseRating(
      jsonLd?.aggregateRating
        ?.ratingValue ||
      $('.stars, .rating, .score, .rating-score')
        .first()
        .text()
    )

  const ratingCount =
    Math.max(
      0,
      Number(
        jsonLd?.aggregateRating
          ?.ratingCount
      ) || 0
    )

  const description =
    clean(
      jsonLd?.description ||
      $('.description, .content, #content, .describe')
        .first()
        .text() ||
      $('meta[name="description"]')
        .attr('content'),
      800
    )

  let version =
    clean(
      jsonLd?.version,
      100
    )

  let android =
    clean(
      jsonLd?.operatingSystem,
      100
    )

  let category =
    clean(
      jsonLd?.applicationSubCategory ||
      jsonLd?.applicationCategory,
      100
    )

  $('.additional-info li, .additional-item, .info-item')
    .each(
      (_, el) => {
        const text =
          clean(
            $(el).text(),
            300
          )

        if (
          /Versi/i.test(text)
        ) {
          version =
            clean(
              text.replace(
                /Versi Terbaru/i,
                ''
              ),
              100
            ) || version
        } else if (
          /Perlu Android/i
            .test(text)
        ) {
          android =
            clean(
              text.replace(
                /Perlu Android versi/i,
                ''
              ),
              100
            ) || android
        } else if (
          /Kategori/i
            .test(text)
        ) {
          category =
            clean(
              text.replace(
                /Kategori/i,
                ''
              ),
              100
            ) || category
        }
      }
    )

  const packageName =
    clean(
      new URL(item.url)
        .pathname
        .split('/')
        .filter(Boolean)
        .pop(),
      160
    )

  let downloadPageUrl =
    $('a[href*="/download"]')
      .first()
      .attr('href') ||
    `${item.url.replace(/\/$/, '')}/download`

  downloadPageUrl =
    assertHost(
      absoluteUrl(
        downloadPageUrl,
        APKPURE_BASE
      ),
      [
        'apkpure.com'
      ]
    )

  return {
    ...item,
    title,
    developer,
    icon,
    rating,
    ratingCount,
    description,
    packageName,
    version:
      version || 'Terbaru',
    android:
      android || '',
    category:
      category || '',
    size: '',
    fileType: '',
    downloadPageUrl
  }
}

async function detailUptodown(
  item
) {
  const url =
    assertHost(
      item.url,
      [
        'uptodown.com'
      ]
    )

  const html =
    await fetchText(url)

  const $ =
    cheerio.load(html)

  const jsonLd =
    parseJsonLd(html)

  const title =
    clean(
      jsonLd?.name ||
      $('h1').first().text() ||
      item.title,
      180
    )

  let developer =
    clean(
      jsonLd?.author?.name ||
      $('#author-link, .author')
        .first()
        .text() ||
      item.developer,
      120
    )

  const icon =
    safeRemoteUrl(
      (
        typeof jsonLd?.image ===
          'string'
          ? jsonLd.image
          : jsonLd?.image?.url
      ) ||
      $('img.app_card_img, figure img')
        .first()
        .attr('src') ||
      item.icon
    )

  const rating =
    parseRating(
      jsonLd?.aggregateRating
        ?.ratingValue ||
      $('.stars, .rating, .score')
        .first()
        .text()
    )

  const ratingCount =
    Math.max(
      0,
      Number(
        jsonLd?.aggregateRating
          ?.ratingCount
      ) || 0
    )

  const description =
    clean(
      jsonLd?.description ||
      jsonLd?.review?.reviewBody ||
      $('.description, #content, .content')
        .first()
        .text(),
      800
    )

  let packageName = ''
  let version =
    clean(
      jsonLd?.softwareVersion,
      100
    )
  let android =
    clean(
      jsonLd?.operatingSystem,
      100
    )
  let category =
    clean(
      Array.isArray(
        jsonLd?.applicationCategory
      )
        ? jsonLd.applicationCategory[0]
        : jsonLd?.applicationCategory,
      100
    )
  let size = ''
  let fileType = ''

  $('#technical-information tr')
    .each(
      (_, el) => {
        const rowText =
          clean(
            $(el).text(),
            300
          )

        const value =
          clean(
            $(el)
              .find('td')
              .last()
              .text(),
            180
          )

        if (
          /Nama Paket/i.test(rowText) &&
          value
        ) {
          packageName = value
        } else if (
          /Pengembang/i.test(rowText) &&
          value
        ) {
          developer = value
        } else if (
          /Kategori/i.test(rowText) &&
          value
        ) {
          category = value
        } else if (
          /Ukuran/i.test(rowText) &&
          value
        ) {
          size = value
        } else if (
          /Jenis file/i.test(rowText) &&
          value
        ) {
          fileType = value
        } else if (
          /Versi/i.test(rowText) &&
          value
        ) {
          version = value
        }
      }
    )

  return {
    ...item,
    title,
    developer,
    icon,
    rating,
    ratingCount,
    description,
    // Do not fall back to Uptodown slug: unknown means unknown.
    packageName:
      clean(
        packageName,
        160
      ),
    version:
      version || 'Terbaru',
    android,
    category,
    size,
    fileType:
      clean(
        fileType,
        40
      ),
    downloadPageUrl:
      `${new URL(url).origin}/android/dw`
  }
}

export async function getOriginalAppDetail(
  item
) {
  if (
    item?.provider ===
    'apkpure'
  ) {
    return detailApkPure(item)
  }

  if (
    item?.provider ===
    'uptodown'
  ) {
    return detailUptodown(item)
  }

  throw new Error(
    'APP_PROVIDER_UNKNOWN'
  )
}

function filenameFromDisposition(
  disposition
) {
  const text =
    String(disposition || '')

  const utf =
    text.match(
      /filename\*=UTF-8''([^;]+)/i
    )?.[1]

  if (utf) {
    try {
      return decodeURIComponent(
        utf.trim()
      )
    } catch {}
  }

  return (
    text.match(
      /filename=["']?([^"';]+)["']?/i
    )?.[1] ||
    ''
  ).trim()
}

function safeFilename(
  value,
  fallback =
    'NEXA-App.apk'
) {
  const result =
    clean(value, 200)
      .replace(
        /[\\/:*?"<>|\u0000-\u001f\u007f]+/g,
        '_'
      )
      .trim()

  return result || fallback
}

function ensureExtension(
  filename,
  fileType
) {
  const type =
    /xapk/i.test(
      String(fileType || '')
    )
      ? 'xapk'
      : 'apk'

  let name =
    safeFilename(
      filename,
      `NEXA-App.${type}`
    )

  if (
    !/\.(apk|xapk)$/i
      .test(name)
  ) {
    name += `.${type}`
  }

  return {
    filename: name,
    fileType:
      type.toUpperCase()
  }
}

async function resolveApkPureDownload(
  detail
) {
  const page =
    assertHost(
      detail.downloadPageUrl,
      [
        'apkpure.com'
      ]
    )

  const html =
    await fetchApkPureHtml(page)

  const $ =
    cheerio.load(html)

  const button =
    $('a.download-start-btn, a[href*="d.apkpure.com/b/"]')
      .first()

  const direct =
    button.attr('href') || ''

  if (!direct) {
    throw new Error(
      'APKPURE_DIRECT_NOT_FOUND'
    )
  }

  const url =
    assertHost(
      direct,
      [
        'apkpure.com',
        'apkpure.net'
      ]
    )

  const text =
    clean(
      button.text(),
      300
    )

  const size =
    text.match(
      /\(([^)]+(?:B|KB|MB|GB|TB)[^)]*)\)/i
    )?.[1] ||
    detail.size ||
    ''

  const fileType =
    /XAPK/i.test(text)
      ? 'XAPK'
      : 'APK'

  const rawName =
    decodeURIComponent(
      new URL(url)
        .pathname
        .split('/')
        .pop() ||
      ''
    )

  const named =
    ensureExtension(
      rawName ||
      `${detail.title}-${detail.version}`,
      fileType
    )

  return {
    url,
    filename:
      named.filename,
    fileType:
      named.fileType,
    size,
    headers: {
      'User-Agent': UA,
      Referer:
        `${APKPURE_BASE}/`,
      Accept: '*/*'
    }
  }
}

async function resolveUptodownDownload(
  detail
) {
  const source =
    assertHost(
      detail.url,
      [
        'uptodown.com'
      ]
    )

  const origin =
    new URL(source).origin

  const page =
    `${origin}/android/dw`

  const html =
    await fetchText(page)

  const $ =
    cheerio.load(html)

  const button =
    $('#detail-download-button')
      .first()

  const appId =
    clean(
      button.attr('data-app-id'),
      80
    )

  const fileId =
    clean(
      button.attr('data-file-id') ||
      button.attr('data-download-version'),
      100
    )

  const onlyXapk =
    clean(
      button.attr('data-only-xapk') ||
      '0',
      10
    )

  const siteKey =
    clean(
      $('#download-turnstile-widget')
        .attr('data-sitekey'),
      200
    )

  if (
    !appId ||
    !fileId ||
    !siteKey
  ) {
    throw new Error(
      'UPTODOWN_DOWNLOAD_METADATA_MISSING'
    )
  }

  const cf =
    await getCloudflareHelper()

  if (
    typeof cf.turnstileMin !==
    'function'
  ) {
    throw new Error(
      'HAIDARCF_TURNSTILE_UNAVAILABLE'
    )
  }

  const solved =
    await cf.turnstileMin({
      url: page,
      siteKey
    })

  const token =
    clean(
      solved?.token,
      5000
    )

  if (!token) {
    throw new Error(
      'UPTODOWN_TURNSTILE_FAILED'
    )
  }

  const controller =
    new AbortController()

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      HTML_TIMEOUT
    )

  let data

  try {
    const response =
      await fetch(
        `${origin}/ajax/app/${encodeURIComponent(appId)}/file/${encodeURIComponent(fileId)}/download-url`,
        {
          method: 'POST',
          headers: {
            'User-Agent': UA,
            'Content-Type':
              'application/json',
            'X-Requested-With':
              'XMLHttpRequest',
            Referer: page,
            Accept:
              'application/json'
          },
          body:
            JSON.stringify({
              token,
              onlyXapk
            }),
          signal:
            controller.signal
        }
      )

    const text =
      await response.text()

    try {
      data = JSON.parse(text)
    } catch {
      throw new Error(
        'UPTODOWN_BAD_JSON'
      )
    }

    if (!response.ok) {
      throw new Error(
        `UPTODOWN_AJAX_HTTP_${response.status}`
      )
    }
  } finally {
    clearTimeout(timer)
  }

  const part =
    clean(
      data?.data?.downloadURL,
      5000
    )

  if (
    !data?.success ||
    !part
  ) {
    throw new Error(
      'UPTODOWN_DIRECT_NOT_FOUND'
    )
  }

  const url =
    assertHost(
      `https://dw.uptodown.com/dwn/${part}`,
      [
        'uptodown.com'
      ]
    )

  const buttonText =
    clean(
      button.text(),
      300
    )

  const size =
    buttonText.match(
      /([0-9.,]+\s*(?:B|KB|MB|GB|TB))/i
    )?.[1] ||
    detail.size ||
    ''

  const fileType =
    onlyXapk === '1' ||
    /XAPK/i.test(
      detail.fileType
    )
      ? 'XAPK'
      : 'APK'

  const named =
    ensureExtension(
      `${detail.title}-${detail.version}`,
      fileType
    )

  return {
    url,
    filename:
      named.filename,
    fileType:
      named.fileType,
    size,
    headers: {
      'User-Agent': UA,
      Referer:
        `${UPTODOWN_BASE}/`,
      Accept: '*/*'
    }
  }
}

export async function resolveOriginalAppDownload(
  detail
) {
  if (
    detail?.provider ===
    'apkpure'
  ) {
    return resolveApkPureDownload(
      detail
    )
  }

  if (
    detail?.provider ===
    'uptodown'
  ) {
    return resolveUptodownDownload(
      detail
    )
  }

  throw new Error(
    'APP_PROVIDER_UNKNOWN'
  )
}

export function parseSizeBytes(
  value
) {
  const raw =
    clean(value, 100)
      .replace(',', '.')

  const match =
    raw.match(
      /([\d.]+)\s*(B|KB|MB|GB|TB)\b/i
    )

  if (!match) {
    return null
  }

  const number =
    Number(match[1])

  if (
    !Number.isFinite(number) ||
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
    match[2].toUpperCase()
  ]

  return (
    number *
    1024 ** power
  )
}

function createSizeGuard() {
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
        MAX_APP_DOWNLOAD_BYTES
      ) {
        callback(
          new Error(
            'APP_FILE_TOO_LARGE'
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

async function validateDownloadedFile({
  filePath,
  expectedBytes
}) {
  const info =
    await stat(filePath)

  const actualBytes =
    Number(info.size || 0)

  if (!actualBytes) {
    throw new Error(
      'APP_FILE_EMPTY'
    )
  }

  if (
    actualBytes >
    MAX_APP_DOWNLOAD_BYTES
  ) {
    throw new Error(
      'APP_FILE_TOO_LARGE'
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
    text.includes('<!doctype html') ||
    text.includes('<html')
  ) {
    throw new Error(
      'APP_FILE_IS_HTML'
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
        'APP_SIZE_MISMATCH'
      ),
      {
        expectedBytes,
        actualBytes
      }
    )
  }

  return actualBytes
}

export async function downloadOriginalAppToTemp(
  resolved
) {
  const declaredBytes =
    parseSizeBytes(
      resolved?.size
    )

  if (
    declaredBytes &&
    declaredBytes >
    MAX_APP_DOWNLOAD_BYTES
  ) {
    throw new Error(
      'APP_FILE_TOO_LARGE'
    )
  }

  const dir =
    await mkdtemp(
      join(
        tmpdir(),
        'nexa-app-'
      )
    )

  const named =
    ensureExtension(
      resolved?.filename,
      resolved?.fileType
    )

  const filePath =
    join(
      dir,
      named.filename
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

  const controller =
    new AbortController()

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      DOWNLOAD_TIMEOUT
    )

  try {
    const response =
      await fetch(
        resolved.url,
        {
          redirect: 'follow',
          headers:
            resolved.headers || {},
          signal:
            controller.signal
        }
      )

    if (!response.ok) {
      throw new Error(
        `APP_CDN_HTTP_${response.status}`
      )
    }

    if (!response.body) {
      throw new Error(
        'APP_CDN_EMPTY_BODY'
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
      MAX_APP_DOWNLOAD_BYTES
    ) {
      throw new Error(
        'APP_FILE_TOO_LARGE'
      )
    }

    const disposition =
      response.headers.get(
        'content-disposition'
      )

    const responseName =
      filenameFromDisposition(
        disposition
      )

    const finalNamed =
      ensureExtension(
        responseName ||
        named.filename,
        resolved.fileType
      )

    const finalPath =
      finalNamed.filename ===
      named.filename
        ? filePath
        : join(
            dir,
            finalNamed.filename
          )

    await pipeline(
      Readable.fromWeb(
        response.body
      ),
      createSizeGuard(),
      createWriteStream(
        finalPath,
        {
          flags: 'wx'
        }
      )
    )

    const actualBytes =
      await validateDownloadedFile({
        filePath:
          finalPath,
        expectedBytes:
          declaredBytes ||
          contentLength ||
          null
      })

    return {
      filePath:
        finalPath,
      filename:
        finalNamed.filename,
      fileType:
        finalNamed.fileType,
      actualBytes,
      cleanup
    }
  } catch (error) {
    await cleanup()
    throw error
  } finally {
    clearTimeout(timer)
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

  if (size < 1024) {
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
    let index = 1;
    index < units.length &&
    current >= 1024;
    index += 1
  ) {
    current /= 1024
    unit = units[index]
  }

  return `${current.toFixed(2)} ${unit}`
}
