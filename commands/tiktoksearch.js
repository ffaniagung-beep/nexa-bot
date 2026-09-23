// NEXA_TIKTOK_SEARCH_WEB_V1
// Direct scrape: https://www.tiktok.com/search?q=...
// Search only. Download button delegates to the existing .tiktok command.

import {
  Button,
  Carousel
} from '@rexxhayanasi/elaina-baileys'

import {
  readFileSync
} from 'node:fs'

import * as cheerio from 'cheerio'

const MAX_RESULTS =
  8

const SEARCH_TIMEOUT_MS =
  20_000

const OEMBED_TIMEOUT_MS =
  8_000

const CACHE_TTL_MS =
  2 * 60 * 1000

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/131.0.0.0 Safari/537.36'

const cache =
  new Map()

let fallbackImage =
  null

try {
  fallbackImage =
    readFileSync(
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
  const number =
    Number(value)

  if (
    !Number.isFinite(
      number
    ) ||
    number < 0
  ) {
    return '-'
  }

  return new Intl.NumberFormat(
    'id-ID',
    {
      notation:
        'compact',
      maximumFractionDigits:
        1
    }
  ).format(
    number
  )
}

function safeHttpUrl(
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

    return url.href
  } catch {
    return ''
  }
}

function urlList(
  value
) {
  if (
    !Array.isArray(
      value
    )
  ) {
    return []
  }

  return value
    .map(
      safeHttpUrl
    )
    .filter(
      Boolean
    )
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
        safeHttpUrl(
          value
        )

      if (url) {
        return url
      }

      continue
    }

    for (
      const item
      of urlList(value)
    ) {
      return item
    }
  }

  return ''
}

function normalizeAuthor(
  value
) {
  if (
    !value ||
    typeof value !==
      'object'
  ) {
    return {
      username:
        '',
      nickname:
        ''
    }
  }

  return {
    username:
      cleanText(
        value.uniqueId ||
        value.unique_id ||
        value.username ||
        value.handle ||
        '',
        80
      ).replace(
        /^@+/,
        ''
      ),

    nickname:
      cleanText(
        value.nickname ||
        value.nickName ||
        value.name ||
        '',
        100
      )
  }
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

function slideCover(
  item
) {
  const first =
    Array.isArray(
      item
        ?.imagePost
        ?.images
    )
      ? item.imagePost.images[0]
      : null

  return firstUrl(
    first
      ?.imageURL
      ?.urlList,
    first
      ?.displayImage
      ?.urlList,
    first
      ?.ownerWatermarkImage
      ?.urlList
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
    !/^\d{8,}$/.test(
      id
    )
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
      item.url ||
      item.webVideoUrl ||
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

  const thumbnail =
    firstUrl(
      slideCover(item),
      video
        ?.cover,
      video
        ?.originCover,
      video
        ?.dynamicCover,
      video
        ?.coverUrl,
      video
        ?.coverUrlList,
      item
        ?.cover,
      item
        ?.thumbnail,
      item
        ?.thumbnailUrl
    )

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

    thumbnail,

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

function collectFromJson(
  root
) {
  const result =
    []

  const seenIds =
    new Set()

  const seenObjects =
    new WeakSet()

  function visit(
    value,
    depth = 0
  ) {
    if (
      !value ||
      depth > 18 ||
      result.length >=
        MAX_RESULTS
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
      seenObjects.has(
        value
      )
    ) {
      return
    }

    seenObjects.add(
      value
    )

    const normalized =
      normalizeTikTokItem(
        value
      )

    if (
      normalized &&
      !seenIds.has(
        normalized.id
      )
    ) {
      seenIds.add(
        normalized.id
      )

      result.push(
        normalized
      )

      if (
        result.length >=
        MAX_RESULTS
      ) {
        return
      }
    }

    if (
      Array.isArray(
        value
      )
    ) {
      for (
        const child
        of value
      ) {
        visit(
          child,
          depth + 1
        )

        if (
          result.length >=
          MAX_RESULTS
        ) {
          return
        }
      }

      return
    }

    for (
      const child
      of Object.values(
        value
      )
    ) {
      visit(
        child,
        depth + 1
      )

      if (
        result.length >=
        MAX_RESULTS
      ) {
        return
      }
    }
  }

  visit(root)

  return result
}

function decodeHtmlJson(
  raw
) {
  if (!raw) {
    return null
  }

  const text =
    String(raw)
      .trim()

  if (!text) {
    return null
  }

  try {
    return JSON.parse(
      text
    )
  } catch {
    return null
  }
}

function parseEmbeddedResults(
  html
) {
  const $ =
    cheerio.load(
      String(
        html || ''
      )
    )

  const selectors = [
    'script#__UNIVERSAL_DATA_FOR_REHYDRATION__',
    'script#SIGI_STATE',
    'script#__NEXT_DATA__',
    'script[type="application/json"]'
  ]

  const seen =
    new Set()

  const items =
    []

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
          $(element)
            .html()

        if (
          !raw ||
          seen.has(raw)
        ) {
          return
        }

        seen.add(raw)

        const json =
          decodeHtmlJson(
            raw
          )

        if (!json) {
          return
        }

        for (
          const item
          of collectFromJson(
            json
          )
        ) {
          if (
            items.some(
              existing =>
                existing.id ===
                item.id
            )
          ) {
            continue
          }

          items.push(
            item
          )

          if (
            items.length >=
            MAX_RESULTS
          ) {
            break
          }
        }
      }
    )

    if (
      items.length >=
      MAX_RESULTS
    ) {
      break
    }
  }

  return items
}

function normalizeEscapedHtml(
  html
) {
  return String(
    html || ''
  )
    .replace(
      /\\u002F/gi,
      '/'
    )
    .replace(
      /\\u0026/gi,
      '&'
    )
    .replace(
      /\\\//g,
      '/'
    )
}

function parseLinkFallback(
  html
) {
  const source =
    normalizeEscapedHtml(
      html
    )

  const result =
    []

  const seen =
    new Set()

  const patterns = [
    /https?:\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9._-]+)\/(video|photo)\/(\d{8,})/gi,
    /\/@([A-Za-z0-9._-]+)\/(video|photo)\/(\d{8,})/gi
  ]

  for (
    const pattern
    of patterns
  ) {
    let match

    while (
      (
        match =
          pattern.exec(
            source
          )
      ) &&
      result.length <
        MAX_RESULTS
    ) {
      const username =
        cleanText(
          match[1],
          80
        )

      const type =
        match[2]
          .toLowerCase()

      const id =
        match[3]

      if (
        seen.has(
          id
        )
      ) {
        continue
      }

      seen.add(id)

      result.push({
        id,
        url:
          postUrl({
            id,
            username,
            photo:
              type ===
              'photo'
          }),

        type:
          type ===
          'photo'
            ? 'slide'
            : 'video',

        username,
        nickname:
          '',
        caption:
          '',
        thumbnail:
          '',
        views:
          NaN,
        likes:
          NaN,
        comments:
          NaN
      })
    }

    if (
      result.length >=
      MAX_RESULTS
    ) {
      break
    }
  }

  return result
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
      'https://www.tiktok.com/',

    'Sec-Fetch-Dest':
      'document',

    'Sec-Fetch-Mode':
      'navigate',

    'Sec-Fetch-Site':
      'same-origin',

    'Upgrade-Insecure-Requests':
      '1'
  }
}

function looksBlocked(
  html
) {
  const text =
    String(
      html || ''
    )
      .toLowerCase()

  return (
    text.includes(
      'secsdk-captcha'
    ) ||
    text.includes(
      'captcha'
    ) ||
    text.includes(
      'verify to continue'
    ) ||
    text.includes(
      'too many requests'
    ) ||
    text.includes(
      'access denied'
    )
  )
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
    clearTimeout(
      timer
    )
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
    const endpoint =
      'https://www.tiktok.com/oembed?url=' +
      encodeURIComponent(
        item.url
      )

    const response =
      await fetchWithTimeout(
        endpoint,
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

    if (!response.ok) {
      return item
    }

    const json =
      await response.json()

    return {
      ...item,

      thumbnail:
        item.thumbnail ||
        safeHttpUrl(
          json
            ?.thumbnail_url
        ),

      caption:
        item.caption ||
        cleanText(
          json
            ?.title ||
          '',
          260
        ),

      username:
        item.username ||
        cleanText(
          json
            ?.author_unique_id ||
          json
            ?.author_name ||
          '',
          80
        ).replace(
          /^@+/,
          ''
        ),

      nickname:
        item.nickname ||
        cleanText(
          json
            ?.author_name ||
          '',
          100
        )
    }
  } catch {
    return item
  }
}

function cacheKey(
  query
) {
  return cleanText(
    query,
    120
  )
    .toLowerCase()
}

function readCache(
  query
) {
  const key =
    cacheKey(
      query
    )

  const entry =
    cache.get(
      key
    )

  if (!entry) {
    return null
  }

  if (
    Date.now() -
      entry.createdAt >
    CACHE_TTL_MS
  ) {
    cache.delete(
      key
    )

    return null
  }

  return entry.value
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

async function searchTikTokWeb(
  query
) {
  const cached =
    readCache(
      query
    )

  if (cached) {
    return {
      ...cached,
      cached:
        true
    }
  }

  const searchUrl =
    'https://www.tiktok.com/search?q=' +
    encodeURIComponent(
      query
    )

  let response

  try {
    response =
      await fetchWithTimeout(
        searchUrl,
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
    looksBlocked(
      html
    )
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
    'embedded-json'

  if (!items.length) {
    items =
      parseLinkFallback(
        html
      )

    strategy =
      'html-link-fallback'
  }

  if (!items.length) {
    throw new Error(
      'TIKTOK_SEARCH_PARSE_EMPTY'
    )
  }

  const enriched =
    await Promise.all(
      items
        .slice(
          0,
          MAX_RESULTS
        )
        .map(
          enrichWithOEmbed
        )
    )

  const finalItems =
    enriched.filter(
      item =>
        item.url &&
        item.id
    )

  if (!finalItems.length) {
    throw new Error(
      'TIKTOK_SEARCH_PARSE_EMPTY'
    )
  }

  const result = {
    query:
      cleanText(
        query,
        120
      ),

    items:
      finalItems,

    strategy,

    cached:
      false
  }

  writeCache(
    query,
    result
  )

  return result
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

  const stats = [
    `♥ ${compactNumber(item.likes)}`,
    `💬 ${compactNumber(item.comments)}`,
    `▶ ${compactNumber(item.views)}`
  ]

  return (
    `*${index + 1}. ${cleanText(title, 120)}*\n\n` +
    `👤 ${cleanText(author, 90)}\n` +
    `${item.type === 'slide' ? '🖼️ Slide' : '🎬 Video'}\n` +
    stats.join('  •  ')
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
      let card =
        new Button(
          sock
        )
          .setImage(
            media
          )
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
  const cards =
    []

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
    new Carousel(
      sock
    )
      .setBody(
        `✦ *NEXA • TIKTOK SEARCH*\n\n` +
        `🔎 “${cleanText(result.query, 80)}”\n` +
        `📦 ${result.items.length} hasil ditemukan`
      )
      .setFooter(
        `Geser hasil • Download memakai TikTok Smart V3` +
        (
          result.cached
            ? ' • cache'
            : ''
        )
      )
      .addCard(
        cards
      )

  await carousel.send(
    jid
  )
}

function helpText(
  prefix
) {
  return (
    `✦ *NEXA • TIKTOK SEARCH*\n\n` +
    `Cari video TikTok langsung dari web search.\n\n` +
    `Contoh:\n` +
    `*${prefix}tiktoksearch Elaina*\n\n` +
    `Button *Download* diteruskan ke downloader TikTok NEXA yang sudah ada.`
  )
}

function errorText(
  error
) {
  const code =
    String(
      error?.message ||
      ''
    )

  if (
    code ===
    'TIKTOK_SEARCH_TIMEOUT'
  ) {
    return (
      'TikTok Search terlalu lama merespons. Coba lagi sebentar.'
    )
  }

  if (
    /TIKTOK_SEARCH_BLOCKED_(403|429)|TIKTOK_SEARCH_CHALLENGE/
      .test(code)
  ) {
    return (
      'TikTok Search menolak request dari server/VPS saat ini. ' +
      'Downloader `.tiktok` tetap tidak terpengaruh.'
    )
  }

  if (
    code ===
    'TIKTOK_SEARCH_PARSE_EMPTY'
  ) {
    return (
      'Halaman Search terbuka, tapi hasilnya tidak ada di HTML/embedded data yang bisa dibaca. ' +
      'Kemungkinan layout/proteksi TikTok berubah.'
    )
  }

  if (
    code ===
    'TIKTOK_SEARCH_CARD_MEDIA_MISSING'
  ) {
    return (
      'Hasil ditemukan, tapi thumbnail untuk carousel tidak tersedia.'
    )
  }

  if (
    /^TIKTOK_SEARCH_HTTP_/
      .test(code)
  ) {
    return (
      `TikTok Search merespons ${code.replace('TIKTOK_SEARCH_HTTP_', 'HTTP ')}.`
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
    'Cari TikTok via web search dengan carousel',

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
              `⚠️ Link TikTok tidak valid.`
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
            helpText(
              prefix
            )
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
          `🔎 Mencari *${cleanText(query, 80)}* langsung dari TikTok Web...`
      },
      {
        quoted:
          msg
      }
    )

    try {
      const result =
        await searchTikTokWeb(
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
        error
      )

      await sock.sendMessage(
        jid,
        {
          text:
            `⚠️ *NEXA • TIKTOK SEARCH*\n\n` +
            errorText(
              error
            )
        },
        {
          quoted:
            msg
        }
      )
    }
  }
}
