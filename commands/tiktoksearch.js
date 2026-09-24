// NEXA_TIKTOK_SEARCH_BROWSER_V2
// Browser-first TikTok search.
// Download button delegates to the existing .tiktok command.
// Does NOT solve/bypass CAPTCHA: if TikTok challenges the browser, it fails cleanly.

import {
  Button,
  Carousel
} from '@rexxhayanasi/elaina-baileys'

import {
  existsSync,
  readFileSync
} from 'node:fs'

import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium'
import * as cheerio from 'cheerio'

const MAX_RESULTS = 8
const SEARCH_TIMEOUT_MS = 28_000
const API_WAIT_MS = 10_000
const OEMBED_TIMEOUT_MS = 7_000
const CACHE_TTL_MS = 2 * 60 * 1000

const DESKTOP_UA =
  'Mozilla/5.0 (X11; Linux x86_64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/153.0.0.0 Safari/537.36'

const cache = new Map()

let browserPromise = null

let fallbackImage = null

try {
  fallbackImage = readFileSync(
    new URL(
      '../media/menu.jpg',
      import.meta.url
    )
  )
} catch {}

function cleanText(
  value,
  max = 500
) {
  return String(
    value ?? ''
  )
    .replace(
      /\s+/g,
      ' '
    )
    .trim()
    .slice(
      0,
      max
    )
}

function compactNumber(
  value
) {
  const number = Number(value)

  if (
    !Number.isFinite(number) ||
    number < 0
  ) {
    return '-'
  }

  return new Intl.NumberFormat(
    'id-ID',
    {
      notation: 'compact',
      maximumFractionDigits: 1
    }
  ).format(number)
}

function safeHttpUrl(
  value
) {
  try {
    const url = new URL(
      String(value || '')
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

    return url.href
  } catch {
    return ''
  }
}

function firstUrl(
  ...values
) {
  for (
    const value
    of values
  ) {
    if (
      typeof value ===
      'string'
    ) {
      const url =
        safeHttpUrl(value)

      if (url) {
        return url
      }

      continue
    }

    if (
      Array.isArray(value)
    ) {
      for (
        const item
        of value
      ) {
        const url =
          safeHttpUrl(item)

        if (url) {
          return url
        }
      }
    }
  }

  return ''
}

function normalizeAuthor(
  value
) {
  const source =
    value &&
    typeof value ===
      'object'
      ? value
      : {}

  return {
    username:
      cleanText(
        source.uniqueId ||
        source.unique_id ||
        source.username ||
        source.handle ||
        '',
        80
      ).replace(
        /^@+/,
        ''
      ),

    nickname:
      cleanText(
        source.nickname ||
        source.nickName ||
        source.name ||
        '',
        100
      )
  }
}

function slideCover(
  item
) {
  const images =
    item?.imagePost?.images ||
    item?.image_post_info?.images ||
    item?.images ||
    []

  const first =
    Array.isArray(images)
      ? images[0]
      : null

  return firstUrl(
    first?.imageURL?.urlList,
    first?.displayImage?.urlList,
    first?.ownerWatermarkImage?.urlList,
    first?.image_url?.url_list,
    first?.display_image?.url_list,
    first?.url_list
  )
}

function postUrl({
  id,
  username,
  photo
}) {
  if (
    !id ||
    !username
  ) {
    return ''
  }

  return (
    `https://www.tiktok.com/@${encodeURIComponent(username)}/` +
    `${photo ? 'photo' : 'video'}/${id}`
  )
}

function normalizeTikTokItem(
  raw
) {
  if (
    !raw ||
    typeof raw !==
      'object'
  ) {
    return null
  }

  const item =
    raw.itemStruct ||
    raw.item ||
    raw.awemeInfo ||
    raw.aweme_info ||
    raw

  const id =
    cleanText(
      item.id ||
      item.itemId ||
      item.item_id ||
      item.awemeId ||
      item.aweme_id ||
      '',
      40
    )

  if (
    !/^\d{8,}$/.test(id)
  ) {
    return null
  }

  const author =
    normalizeAuthor(
      item.author ||
      item.authorInfo ||
      item.author_info
    )

  const photo =
    Boolean(
      item.imagePost ||
      item.image_post_info ||
      item.images
    )

  const url =
    safeHttpUrl(
      item.shareUrl ||
      item.share_url ||
      item.webVideoUrl ||
      item.url ||
      ''
    ) ||
    postUrl({
      id,
      username:
        author.username,
      photo
    })

  if (!url) {
    return null
  }

  const video =
    item.video ||
    {}

  const stats =
    item.stats ||
    item.statistics ||
    item.statsV2 ||
    {}

  return {
    id,
    url,

    type:
      photo
        ? 'slide'
        : 'video',

    username:
      author.username,

    nickname:
      author.nickname,

    caption:
      cleanText(
        item.desc ||
        item.description ||
        item.title ||
        '',
        260
      ),

    thumbnail:
      firstUrl(
        slideCover(item),
        video.cover,
        video.originCover,
        video.dynamicCover,
        video.coverUrl,
        video.coverUrlList,
        video.cover?.url_list,
        item.cover,
        item.thumbnail,
        item.thumbnailUrl
      ),

    views:
      Number(
        stats.playCount ??
        stats.play_count ??
        stats.viewCount ??
        stats.view_count ??
        NaN
      ),

    likes:
      Number(
        stats.diggCount ??
        stats.digg_count ??
        stats.likeCount ??
        stats.like_count ??
        NaN
      ),

    comments:
      Number(
        stats.commentCount ??
        stats.comment_count ??
        NaN
      )
  }
}

function uniqueItems(
  values
) {
  const seen =
    new Set()

  const result =
    []

  for (
    const raw
    of values
  ) {
    const item =
      normalizeTikTokItem(raw)

    if (
      !item ||
      seen.has(item.id)
    ) {
      continue
    }

    seen.add(item.id)
    result.push(item)

    if (
      result.length >=
      MAX_RESULTS
    ) {
      break
    }
  }

  return result
}

function collectFromJson(
  root
) {
  const rawItems =
    []

  const seenObjects =
    new WeakSet()

  function visit(
    value,
    depth = 0
  ) {
    if (
      !value ||
      depth > 18 ||
      rawItems.length >=
        MAX_RESULTS * 5
    ) {
      return
    }

    if (
      typeof value !==
      'object'
    ) {
      return
    }

    if (
      seenObjects.has(value)
    ) {
      return
    }

    seenObjects.add(value)

    if (
      value.itemStruct ||
      value.awemeInfo ||
      value.aweme_info ||
      (
        value.id &&
        (
          value.video ||
          value.imagePost ||
          value.image_post_info
        )
      )
    ) {
      rawItems.push(value)
    }

    if (
      Array.isArray(value)
    ) {
      for (
        const child
        of value
      ) {
        visit(
          child,
          depth + 1
        )
      }

      return
    }

    for (
      const child
      of Object.values(value)
    ) {
      visit(
        child,
        depth + 1
      )
    }
  }

  visit(root)

  return uniqueItems(
    rawItems
  )
}

function cacheKey(
  query
) {
  return cleanText(
    query,
    120
  ).toLowerCase()
}

function readCache(
  query
) {
  const key =
    cacheKey(query)

  const entry =
    cache.get(key)

  if (!entry) {
    return null
  }

  if (
    Date.now() -
      entry.createdAt >
    CACHE_TTL_MS
  ) {
    cache.delete(key)
    return null
  }

  return {
    ...entry.value,
    cached: true
  }
}

function writeCache(
  query,
  value
) {
  cache.set(
    cacheKey(query),
    {
      value,
      createdAt:
        Date.now()
    }
  )
}

function looksBlockedText(
  value
) {
  const text =
    String(value || '')
      .toLowerCase()

  return (
    text.includes(
      'secsdk-captcha'
    ) ||
    text.includes(
      'verify to continue'
    ) ||
    text.includes(
      'captcha'
    ) ||
    text.includes(
      'too many requests'
    ) ||
    text.includes(
      'access denied'
    )
  )
}

function browserCandidates() {
  return [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    process.env.CHROMIUM_PATH,
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ]
    .filter(Boolean)
    .filter(
      path =>
        existsSync(path)
    )
}

async function chromiumExecutable() {
  const local =
    browserCandidates()[0]

  if (local) {
    return {
      path: local,
      source:
        'system'
    }
  }

  try {
    const path =
      await chromium.executablePath()

    if (
      path &&
      existsSync(path)
    ) {
      return {
        path,
        source:
          'sparticuz'
      }
    }
  } catch (
    error
  ) {
    throw new Error(
      'TIKTOK_BROWSER_BINARY:' +
      cleanText(
        error?.message ||
        error,
        300
      )
    )
  }

  throw new Error(
    'TIKTOK_BROWSER_BINARY_NOT_FOUND'
  )
}

async function getBrowser() {
  if (
    browserPromise
  ) {
    return browserPromise
  }

  browserPromise =
    (
      async () => {
        const executable =
          await chromiumExecutable()

        const args =
          [
            ...chromium.args,
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--lang=id-ID'
          ]

        const browser =
          await puppeteer.launch({
            executablePath:
              executable.path,

            args:
              [...new Set(args)],

            headless:
              'shell',

            defaultViewport: {
              width: 1365,
              height: 900,
              deviceScaleFactor: 1
            }
          })

        console.log(
          '[TIKTOK_SEARCH] browser ready:',
          executable.source
        )

        browser.once(
          'disconnected',
          () => {
            browserPromise = null
          }
        )

        return browser
      }
    )()
      .catch(
        error => {
          browserPromise = null
          throw new Error(
            'TIKTOK_BROWSER_LAUNCH:' +
            cleanText(
              error?.message ||
              error,
              400
            )
          )
        }
      )

  return browserPromise
}

async function wait(
  ms
) {
  await new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  )
}

function extractApiItems(
  payload
) {
  if (
    !payload ||
    typeof payload !==
      'object'
  ) {
    return []
  }

  const candidates = [
    ...(Array.isArray(payload.item_list)
      ? payload.item_list
      : []),

    ...(Array.isArray(payload.itemList)
      ? payload.itemList
      : []),

    ...(Array.isArray(payload.data)
      ? payload.data
      : [])
  ]

  const normalized =
    uniqueItems(candidates)

  if (
    normalized.length
  ) {
    return normalized
  }

  return collectFromJson(
    payload
  )
}

async function domItems(
  page
) {
  const raw =
    await page.$$eval(
      'a[href*="/video/"], a[href*="/photo/"]',
      anchors => {
        const out = []
        const seen =
          new Set()

        for (
          const anchor
          of anchors
        ) {
          const href =
            anchor.href

          if (
            !href ||
            seen.has(href)
          ) {
            continue
          }

          const match =
            href.match(
              /\/@([^/]+)\/(video|photo)\/(\d{8,})/
            )

          if (!match) {
            continue
          }

          seen.add(href)

          const card =
            anchor.closest(
              'div'
            ) ||
            anchor.parentElement

          const image =
            anchor.querySelector(
              'img'
            ) ||
            card?.querySelector(
              'img'
            )

          const text =
            (
              card?.innerText ||
              anchor.innerText ||
              image?.alt ||
              ''
            )
              .replace(
                /\s+/g,
                ' '
              )
              .trim()

          out.push({
            id:
              match[3],

            shareUrl:
              href,

            author: {
              uniqueId:
                decodeURIComponent(
                  match[1]
                )
            },

            desc:
              text,

            imagePost:
              match[2] ===
                'photo'
                ? {
                    images: []
                  }
                : undefined,

            thumbnail:
              image?.currentSrc ||
              image?.src ||
              ''
          })

          if (
            out.length >=
            12
          ) {
            break
          }
        }

        return out
      }
    )

  return uniqueItems(raw)
}

async function searchTikTokBrowser(
  query
) {
  const browser =
    await getBrowser()

  const page =
    await browser.newPage()

  const apiPayloads =
    []

  let apiResponseSeen =
    false

  const onResponse =
    async response => {
      const url =
        response.url()

      if (
        !url.includes(
          '/api/search/'
        )
      ) {
        return
      }

      apiResponseSeen = true

      if (
        response.status() !==
        200
      ) {
        return
      }

      try {
        const type =
          response.headers()[
            'content-type'
          ] ||
          ''

        if (
          !type.includes(
            'json'
          )
        ) {
          return
        }

        const payload =
          await response.json()

        const items =
          extractApiItems(
            payload
          )

        if (
          items.length
        ) {
          apiPayloads.push(
            ...items
          )
        }
      } catch {}
    }

  page.on(
    'response',
    onResponse
  )

  try {
    await page.setUserAgent(
      DESKTOP_UA
    )

    await page.setExtraHTTPHeaders({
      'Accept-Language':
        'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
    })

    await page.setRequestInterception(
      true
    )

    page.on(
      'request',
      request => {
        const type =
          request.resourceType()

        if (
          [
            'media',
            'font'
          ].includes(type)
        ) {
          request.abort()
          return
        }

        request.continue()
      }
    )

    const searchUrl =
      'https://www.tiktok.com/search?q=' +
      encodeURIComponent(query)

    await page.goto(
      searchUrl,
      {
        waitUntil:
          'domcontentloaded',
        timeout:
          SEARCH_TIMEOUT_MS
      }
    )

    const firstProbe =
      await page.evaluate(
        () => ({
          title:
            document.title,
          body:
            document.body
              ?.innerText
              ?.slice(
                0,
                2500
              ) ||
            '',
          html:
            document.documentElement
              ?.innerHTML
              ?.slice(
                0,
                8000
              ) ||
            ''
        })
      )

    if (
      looksBlockedText(
        `${firstProbe.title}\n${firstProbe.body}\n${firstProbe.html}`
      )
    ) {
      throw new Error(
        'TIKTOK_BROWSER_CHALLENGE'
      )
    }

    const started =
      Date.now()

    let items =
      uniqueItems(
        apiPayloads
      )

    while (
      !items.length &&
      Date.now() -
        started <
        API_WAIT_MS
    ) {
      await wait(750)

      items =
        uniqueItems(
          apiPayloads
        )

      if (
        items.length
      ) {
        break
      }

      const fromDom =
        await domItems(page)

      if (
        fromDom.length
      ) {
        return {
          items:
            fromDom,
          strategy:
            'browser-dom',
          apiResponseSeen
        }
      }
    }

    if (
      items.length
    ) {
      return {
        items,
        strategy:
          'browser-api',
        apiResponseSeen
      }
    }

    const fromDom =
      await domItems(page)

    if (
      fromDom.length
    ) {
      return {
        items:
          fromDom,
        strategy:
          'browser-dom',
        apiResponseSeen
      }
    }

    throw new Error(
      apiResponseSeen
        ? 'TIKTOK_BROWSER_API_EMPTY'
        : 'TIKTOK_BROWSER_NO_RESULTS'
    )
  } catch (
    error
  ) {
    if (
      String(
        error?.name ||
        ''
      ) ===
      'TimeoutError'
    ) {
      throw new Error(
        'TIKTOK_BROWSER_TIMEOUT'
      )
    }

    throw error
  } finally {
    page.off(
      'response',
      onResponse
    )

    await page.close()
      .catch(
        () => {}
      )
  }
}

function searchHeaders() {
  return {
    'User-Agent':
      DESKTOP_UA,

    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',

    'Accept-Language':
      'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',

    'Cache-Control':
      'no-cache',

    Pragma:
      'no-cache',

    Referer:
      'https://www.tiktok.com/'
  }
}

async function fetchWithTimeout(
  url,
  {
    timeoutMs,
    headers
  }
) {
  const controller =
    new AbortController()

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      timeoutMs
    )

  try {
    return await fetch(
      url,
      {
        redirect:
          'follow',
        headers,
        signal:
          controller.signal
      }
    )
  } finally {
    clearTimeout(timer)
  }
}

function parseEmbeddedResults(
  html
) {
  const $ =
    cheerio.load(
      String(html || '')
    )

  const selectors = [
    'script#__UNIVERSAL_DATA_FOR_REHYDRATION__',
    'script#SIGI_STATE',
    'script#__NEXT_DATA__',
    'script[type="application/json"]'
  ]

  const items =
    []

  const seenScripts =
    new Set()

  for (
    const selector
    of selectors
  ) {
    $(
      selector
    ).each(
      (
        _,
        element
      ) => {
        if (
          items.length >=
          MAX_RESULTS
        ) {
          return
        }

        const raw =
          $(element).html()

        if (
          !raw ||
          seenScripts.has(raw)
        ) {
          return
        }

        seenScripts.add(raw)

        try {
          const json =
            JSON.parse(
              raw
            )

          items.push(
            ...collectFromJson(
              json
            )
          )
        } catch {}
      }
    )
  }

  return uniqueItems(items)
}

function parseLinkFallback(
  html
) {
  const source =
    String(html || '')
      .replace(
        /\\u002F/gi,
        '/'
      )
      .replace(
        /\\\//g,
        '/'
      )

  const raw =
    []

  const regex =
    /https?:\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9._-]+)\/(video|photo)\/(\d{8,})/gi

  let match

  while (
    (
      match =
        regex.exec(source)
    ) &&
    raw.length <
      MAX_RESULTS * 2
  ) {
    raw.push({
      id:
        match[3],

      shareUrl:
        match[0],

      author: {
        uniqueId:
          match[1]
      },

      imagePost:
        match[2] ===
          'photo'
          ? {
              images: []
            }
          : undefined
    })
  }

  return uniqueItems(raw)
}

async function searchTikTokWebFallback(
  query
) {
  let response

  try {
    response =
      await fetchWithTimeout(
        'https://www.tiktok.com/search?q=' +
        encodeURIComponent(query),
        {
          timeoutMs:
            SEARCH_TIMEOUT_MS,
          headers:
            searchHeaders()
        }
      )
  } catch (
    error
  ) {
    if (
      error?.name ===
      'AbortError'
    ) {
      throw new Error(
        'TIKTOK_SEARCH_TIMEOUT'
      )
    }

    throw error
  }

  if (
    response.status ===
      403 ||
    response.status ===
      429
  ) {
    throw new Error(
      `TIKTOK_SEARCH_BLOCKED_${response.status}`
    )
  }

  if (!response.ok) {
    throw new Error(
      `TIKTOK_SEARCH_HTTP_${response.status}`
    )
  }

  const html =
    await response.text()

  if (
    looksBlockedText(html)
  ) {
    throw new Error(
      'TIKTOK_SEARCH_CHALLENGE'
    )
  }

  let items =
    parseEmbeddedResults(
      html
    )

  let strategy =
    'direct-embedded-json'

  if (
    !items.length
  ) {
    items =
      parseLinkFallback(
        html
      )

    strategy =
      'direct-html-links'
  }

  if (
    !items.length
  ) {
    throw new Error(
      'TIKTOK_SEARCH_PARSE_EMPTY'
    )
  }

  return {
    items,
    strategy
  }
}

async function enrichWithOEmbed(
  item
) {
  if (
    item.thumbnail &&
    item.caption &&
    item.username
  ) {
    return item
  }

  try {
    const response =
      await fetchWithTimeout(
        'https://www.tiktok.com/oembed?url=' +
        encodeURIComponent(
          item.url
        ),
        {
          timeoutMs:
            OEMBED_TIMEOUT_MS,

          headers: {
            'User-Agent':
              DESKTOP_UA,

            Accept:
              'application/json,text/plain,*/*'
          }
        }
      )

    if (
      !response.ok
    ) {
      return item
    }

    const json =
      await response.json()

    return {
      ...item,

      thumbnail:
        item.thumbnail ||
        safeHttpUrl(
          json?.thumbnail_url
        ),

      caption:
        item.caption ||
        cleanText(
          json?.title ||
          '',
          260
        ),

      username:
        item.username ||
        cleanText(
          json?.author_unique_id ||
          json?.author_name ||
          '',
          80
        ).replace(
          /^@+/,
          ''
        ),

      nickname:
        item.nickname ||
        cleanText(
          json?.author_name ||
          '',
          100
        )
    }
  } catch {
    return item
  }
}

async function searchTikTokSmart(
  query
) {
  const cached =
    readCache(query)

  if (cached) {
    return cached
  }

  let browserError =
    null

  try {
    const browserResult =
      await searchTikTokBrowser(
        query
      )

    const enriched =
      await Promise.all(
        browserResult.items
          .slice(
            0,
            MAX_RESULTS
          )
          .map(
            enrichWithOEmbed
          )
      )

    const result = {
      query:
        cleanText(
          query,
          120
        ),

      items:
        enriched,

      strategy:
        browserResult.strategy,

      cached:
        false
    }

    writeCache(
      query,
      result
    )

    return result
  } catch (
    error
  ) {
    browserError =
      error

    console.warn(
      '[TIKTOK_SEARCH] browser mode:',
      error?.message ||
      error
    )
  }

  try {
    const direct =
      await searchTikTokWebFallback(
        query
      )

    const enriched =
      await Promise.all(
        direct.items
          .slice(
            0,
            MAX_RESULTS
          )
          .map(
            enrichWithOEmbed
          )
      )

    const result = {
      query:
        cleanText(
          query,
          120
        ),

      items:
        enriched,

      strategy:
        direct.strategy,

      cached:
        false
    }

    writeCache(
      query,
      result
    )

    return result
  } catch (
    directError
  ) {
    const error =
      new Error(
        'TIKTOK_SEARCH_ALL_METHODS_FAILED'
      )

    error.browserError =
      browserError

    error.directError =
      directError

    throw error
  }
}

function cardBody(
  item,
  index
) {
  const title =
    item.caption ||
    (
      item.type ===
        'slide'
        ? 'TikTok Photo / Slide'
        : 'TikTok Video'
    )

  const author =
    item.username
      ? `@${item.username}`
      : (
          item.nickname ||
          'Unknown'
        )

  return (
    `*${index + 1}. ${cleanText(title, 120)}*\n\n` +
    `👤 ${cleanText(author, 90)}\n` +
    `${item.type === 'slide' ? '🖼️ Slide' : '🎬 Video'}\n` +
    `♥ ${compactNumber(item.likes)}  •  ` +
    `💬 ${compactNumber(item.comments)}  •  ` +
    `▶ ${compactNumber(item.views)}`
  )
}

function downloadId(
  prefix,
  item
) {
  return (
    `${prefix}tiktok ` +
    item.url
  )
}

function linkId(
  prefix,
  item
) {
  return (
    `${prefix}tiktoksearch __link ` +
    item.url
  )
}

async function makeCard({
  sock,
  item,
  index,
  prefix
}) {
  const build =
    async media => {
      const card =
        new Button(sock)
          .setImage(media)
          .setBody(
            cardBody(
              item,
              index
            )
          )
          .addReply(
            '⬇ Download',
            downloadId(
              prefix,
              item
            )
          )
          .addReply(
            '🔗 Link TikTok',
            linkId(
              prefix,
              item
            )
          )

      return card.toCard()
    }

  if (
    item.thumbnail
  ) {
    try {
      return await build(
        item.thumbnail
      )
    } catch (
      error
    ) {
      console.warn(
        '[TIKTOK_SEARCH] thumbnail fallback:',
        error?.message ||
        error
      )
    }
  }

  if (
    fallbackImage
  ) {
    return build(
      fallbackImage
    )
  }

  throw new Error(
    'TIKTOK_SEARCH_CARD_MEDIA_MISSING'
  )
}

async function sendCarousel({
  sock,
  jid,
  result,
  prefix
}) {
  const cards = []

  for (
    let index = 0;
    index <
      result.items.length;
    index++
  ) {
    cards.push(
      await makeCard({
        sock,
        item:
          result.items[index],
        index,
        prefix
      })
    )
  }

  const carousel =
    new Carousel(sock)
      .setBody(
        `✦ *NEXA • TIKTOK SEARCH*\n\n` +
        `🔎 “${cleanText(result.query, 80)}”\n` +
        `📦 ${result.items.length} hasil ditemukan`
      )
      .setFooter(
        `Geser hasil • Download → TikTok Smart V3 • ${result.strategy}` +
        (
          result.cached
            ? ' • cache'
            : ''
        )
      )
      .addCard(cards)

  await carousel.send(
    jid
  )
}

function helpText(
  prefix
) {
  return (
    `✦ *NEXA • TIKTOK SEARCH*\n\n` +
    `Cari TikTok dengan browser-session, lalu tampilkan hasil sebagai carousel.\n\n` +
    `Contoh:\n` +
    `*${prefix}tiktoksearch Elaina*\n\n` +
    `Button *Download* tetap memakai downloader TikTok NEXA yang sudah ada.`
  )
}

function friendlyMethodError(
  error
) {
  const code =
    String(
      error?.message ||
      ''
    )

  if (
    /TIKTOK_BROWSER_(BINARY|LAUNCH)/
      .test(code)
  ) {
    return (
      'browser Chromium gagal dinyalakan di container'
    )
  }

  if (
    /TIKTOK_BROWSER_CHALLENGE/
      .test(code)
  ) {
    return (
      'browser mendapat challenge dari TikTok'
    )
  }

  if (
    /TIKTOK_BROWSER_TIMEOUT/
      .test(code)
  ) {
    return (
      'browser timeout saat membuka TikTok'
    )
  }

  if (
    /TIKTOK_BROWSER_(API_EMPTY|NO_RESULTS)/
      .test(code)
  ) {
    return (
      'browser terbuka, tapi hasil search tidak terbaca'
    )
  }

  if (
    /TIKTOK_SEARCH_BLOCKED_(403|429)|TIKTOK_SEARCH_CHALLENGE/
      .test(code)
  ) {
    return (
      'fallback HTTP ditolak TikTok'
    )
  }

  if (
    /TIKTOK_SEARCH_PARSE_EMPTY/
      .test(code)
  ) {
    return (
      'fallback HTTP tidak menemukan data hasil'
    )
  }

  if (
    /TIKTOK_SEARCH_TIMEOUT/
      .test(code)
  ) {
    return (
      'fallback HTTP timeout'
    )
  }

  return cleanText(
    code ||
    'unknown error',
    160
  )
}

function errorText(
  error
) {
  if (
    error?.message ===
    'TIKTOK_SEARCH_CARD_MEDIA_MISSING'
  ) {
    return (
      'Hasil ditemukan, tapi thumbnail untuk carousel tidak tersedia.'
    )
  }

  if (
    error?.message ===
    'TIKTOK_SEARCH_ALL_METHODS_FAILED'
  ) {
    const browser =
      friendlyMethodError(
        error.browserError
      )

    const direct =
      friendlyMethodError(
        error.directError
      )

    return (
      `TikTok Search belum tembus dari server ini 😭🗿\n\n` +
      `🌐 Browser: ${browser}\n` +
      `📡 Direct fallback: ${direct}\n\n` +
      `Downloader *.tiktok* tetap aman dan tidak terpengaruh.`
    )
  }

  return (
    'TikTok Search sedang bermasalah. Coba lagi beberapa saat.'
  )
}

export default {
  name:
    'tiktoksearch',

  aliases: [
    'ttsearch',
    'tsearch'
  ],

  category:
    'SEARCH',

  description:
    'Cari TikTok via browser-session + carousel',

  usage:
    '.tiktoksearch <query>',

  async run({
    sock,
    msg,
    jid,
    args,
    config
  }) {
    const prefix =
      config?.prefix ||
      '.'

    const first =
      String(
        args?.[0] ||
        ''
      )
        .trim()
        .toLowerCase()

    if (
      first ===
      '__link'
    ) {
      const url =
        safeHttpUrl(
          args?.[1]
        )

      if (
        !url ||
        !/tiktok\.com/i.test(
          url
        )
      ) {
        await sock.sendMessage(
          jid,
          {
            text:
              '⚠️ Link TikTok tidak valid.'
          },
          {
            quoted:
              msg
          }
        )

        return
      }

      await sock.sendMessage(
        jid,
        {
          text:
            `✦ *NEXA • TIKTOK SEARCH*\n\n` +
            `🔗 ${url}`
        },
        {
          quoted:
            msg
        }
      )

      return
    }

    const query =
      args
        .join(' ')
        .trim()

    if (!query) {
      await sock.sendMessage(
        jid,
        {
          text:
            helpText(prefix)
        },
        {
          quoted:
            msg
        }
      )

      return
    }

    await sock.sendMessage(
      jid,
      {
        text:
          `✦ *NEXA • TIKTOK SEARCH V2*\n\n` +
          `🌐 Membuka browser TikTok...\n` +
          `🔎 Mencari *${cleanText(query, 80)}*`
      },
      {
        quoted:
          msg
      }
    )

    try {
      const result =
        await searchTikTokSmart(
          query
        )

      console.log(
        '[TIKTOK_SEARCH]',
        result.strategy,
        result.items.length,
        JSON.stringify(
          result.query
        )
      )

      await sendCarousel({
        sock,
        jid,
        result,
        prefix
      })
    } catch (
      error
    ) {
      console.error(
        '[TIKTOK_SEARCH]',
        error?.message ||
        error,

        error?.browserError?.message ||
        '',

        error?.directError?.message ||
        ''
      )

      await sock.sendMessage(
        jid,
        {
          text:
            `⚠️ *NEXA • TIKTOK SEARCH V2*\n\n` +
            errorText(error)
        },
        {
          quoted:
            msg
        }
      )
    }
  }
}
