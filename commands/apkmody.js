// NEXA APKMODY CAROUSEL V1
import {
  Button,
  Carousel
} from '@rexxhayanasi/elaina-baileys'

import {
  canUseLimit,
  chargeLimit,
  sendLimitEmpty
} from '../lib/limitGate.js'

import {
  addLimit
} from '../lib/userdb.js'

import {
  getProfileJid
} from '../lib/profile.js'

import {
  readFileSync
} from 'node:fs'

import {
  randomBytes
} from 'node:crypto'

const API_URL =
  'https://api.alwayscodex.eu.cc/api/downloader/apkmody'

const APKMODY_HOME =
  'https://apkmody.mobi'

const SESSION_TTL =
  15 * 60 * 1000

const CARDS_PER_PAGE =
  8

const DOWNLOAD_COST =
  3

const sessions =
  new Map()

const latestByUser =
  new Map()

const downloadLocks =
  new Set()

let fallbackImage = null

try {
  fallbackImage =
    readFileSync(
      new URL(
        '../media/menu.jpg',
        import.meta.url
      )
    )
} catch {}

function now() {
  return Date.now()
}

function cleanText(
  value,
  max = 500
) {
  return String(
    value || ''
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

function userKey(
  msg,
  jid
) {
  return String(
    getProfileJid(
      msg,
      jid
    ) ||
    msg?.key?.participantAlt ||
    msg?.key?.participant ||
    jid ||
    ''
  )
    .toLowerCase()
}

function cleanupSessions() {
  const time =
    now()

  for (
    const [id, session]
    of sessions
  ) {
    if (
      time -
      session.createdAt >
      SESSION_TTL
    ) {
      sessions.delete(id)

      if (
        latestByUser.get(
          session.owner
        ) === id
      ) {
        latestByUser.delete(
          session.owner
        )
      }
    }
  }
}

function makeSession({
  owner,
  query,
  apiPage,
  items
}) {
  cleanupSessions()

  let id

  do {
    id =
      randomBytes(5)
        .toString('hex')
  } while (
    sessions.has(id)
  )

  const session = {
    id,
    owner,
    query,
    apiPage,
    items,
    createdAt:
      now(),
    selectedIndex:
      null,
    detail:
      null
  }

  sessions.set(
    id,
    session
  )

  latestByUser.set(
    owner,
    id
  )

  return session
}

function getSession({
  id,
  owner
}) {
  cleanupSessions()

  const session =
    sessions.get(id)

  if (
    !session ||
    session.owner !==
      owner
  ) {
    return null
  }

  return session
}

function getLatestSession(
  owner
) {
  cleanupSessions()

  const id =
    latestByUser.get(
      owner
    )

  if (!id) {
    return null
  }

  return getSession({
    id,
    owner
  })
}

function buttonId(
  prefix,
  action,
  sessionId,
  value = ''
) {
  return [
    `${prefix}apkmody`,
    action,
    sessionId,
    value
  ]
    .filter(
      part =>
        String(part)
          .length
    )
    .join(' ')
}

function resolveMediaUrl(
  value,
  source
) {
  const raw =
    String(
      value || ''
    )
      .trim()

  if (!raw) {
    return null
  }

  try {
    return new URL(
      raw,
      source ||
      APKMODY_HOME
    ).href
  } catch {
    return null
  }
}

function safeDownloadUrl(
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
      url.protocol !==
        'https:' &&
      url.protocol !==
        'http:'
    ) {
      return null
    }

    const host =
      url.hostname
        .toLowerCase()

    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host.endsWith('.local')
    ) {
      return null
    }

    return url.href
  } catch {
    return null
  }
}

async function apiRequest(
  action,
  payload = {}
) {
  const controller =
    new AbortController()

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      35_000
    )

  try {
    const response =
      await fetch(
        API_URL,
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
            JSON.stringify({
              action,
              ...payload
            }),

          signal:
            controller.signal
        }
      )

    let data

    try {
      data =
        await response.json()
    } catch {
      throw new Error(
        `API_BAD_JSON_${response.status}`
      )
    }

    if (
      !response.ok ||
      data?.status !==
        true ||
      !data?.result
    ) {
      const message =
        cleanText(
          data?.message ||
          data?.error ||
          `API_HTTP_${response.status}`,
          180
        )

      throw new Error(
        message ||
        'API_FAILED'
      )
    }

    return data.result
  } catch (error) {
    if (
      error?.name ===
      'AbortError'
    ) {
      throw new Error(
        'API_TIMEOUT'
      )
    }

    throw error
  } finally {
    clearTimeout(
      timer
    )
  }
}

function formatDate(
  value
) {
  if (!value) {
    return '-'
  }

  const date =
    new Date(value)

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return cleanText(
      value,
      60
    )
  }

  return new Intl.DateTimeFormat(
    'id-ID',
    {
      day:
        '2-digit',
      month:
        'short',
      year:
        'numeric'
    }
  ).format(date)
}

function appBody(
  item
) {
  const title =
    cleanText(
      item?.title ||
      'Tanpa judul',
      90
    )

  const version =
    cleanText(
      item?.version ||
      '-',
      150
    )

  return (
    `*${title}*\n\n` +
    `🏷 ${version}`
  )
}

async function makeCard({
  sock,
  image,
  body,
  replies = []
}) {
  const build =
    async media => {
      let card =
        new Button(sock)
          .setImage(media)
          .setBody(body)

      for (
        const reply
        of replies
      ) {
        card =
          card.addReply(
            reply.text,
            reply.id
          )
      }

      return card.toCard()
    }

  if (image) {
    try {
      return await build(
        image
      )
    } catch (
      err
    ) {
      console.error(
        '[APKMODY] Card image fallback:',
        err?.message ||
        err
      )
    }
  }

  if (fallbackImage) {
    return build(
      fallbackImage
    )
  }

  return build(
    `${APKMODY_HOME}/static/img/default.png`
  )
}

async function sendSearchCarousel({
  sock,
  jid,
  config,
  session,
  slice = 0
}) {
  const total =
    session.items.length

  const totalSlices =
    Math.max(
      1,
      Math.ceil(
        total /
        CARDS_PER_PAGE
      )
    )

  const page =
    Math.min(
      Math.max(
        0,
        Number(slice) ||
        0
      ),
      totalSlices - 1
    )

  const start =
    page *
    CARDS_PER_PAGE

  const end =
    Math.min(
      start +
      CARDS_PER_PAGE,
      total
    )

  const visible =
    session.items.slice(
      start,
      end
    )

  const cards = []

  for (
    let offset = 0;
    offset <
      visible.length;
    offset += 1
  ) {
    const item =
      visible[offset]

    const index =
      start +
      offset

    const image =
      resolveMediaUrl(
        item?.cover,
        item?.url
      )

    const card =
      await makeCard({
        sock,
        image,
        body:
          appBody(item),
        replies: [
          {
            text:
              '🔎 Detail',
            id:
              buttonId(
                config.prefix,
                '__detail',
                session.id,
                index
              )
          },
          {
            text:
              '⬇ Download',
            id:
              buttonId(
                config.prefix,
                '__download',
                session.id,
                index
              )
          }
        ]
      })

    cards.push(card)
  }

  if (
    totalSlices >
    1
  ) {
    const navReplies = []

    if (
      page >
      0
    ) {
      navReplies.push({
        text:
          '← Sebelumnya',
        id:
          buttonId(
            config.prefix,
            '__slice',
            session.id,
            page - 1
          )
      })
    }

    if (
      page <
      totalSlices - 1
    ) {
      navReplies.push({
        text:
          'Berikutnya →',
        id:
          buttonId(
            config.prefix,
            '__slice',
            session.id,
            page + 1
          )
      })
    }

    const navCard =
      await makeCard({
        sock,
        image:
          fallbackImage ||
          `${APKMODY_HOME}/static/img/default.png`,
        body:
          `*Hasil lainnya*\n\n` +
          `${start + 1}–${end} dari ${total}\n` +
          `Geser atau pindah halaman.`,
        replies:
          navReplies
      })

    cards.push(
      navCard
    )
  }

  const carousel =
    new Carousel(sock)
      .setBody(
        `✦ *NEXA • APKMODY*\n\n` +
        `⌕ “${cleanText(session.query, 80)}”\n` +
        `Hasil ${start + 1}–${end} dari ${total} • API page ${session.apiPage}`
      )
      .setFooter(
        'Geser kanan / kiri • pilih action di card'
      )
      .addCard(
        cards
      )

  await carousel.send(
    jid
  )
}

async function fetchDetail(
  session,
  index
) {
  const item =
    session.items[index]

  if (
    !item?.url
  ) {
    throw new Error(
      'SEARCH_ITEM_INVALID'
    )
  }

  const detail =
    await apiRequest(
      'detail',
      {
        url:
          item.url
      }
    )

  session.selectedIndex =
    index

  session.detail =
    detail

  session.createdAt =
    now()

  return detail
}

function detailBody(
  detail
) {
  const download =
    Array.isArray(
      detail?.downloads
    )
      ? detail.downloads[0]
      : null

  const lines = [
    `*${cleanText(detail?.title || 'APK', 100)}*`,
    '',
    `🏷 Version: ${cleanText(detail?.version || '-', 80)}`,
    `⚡ MOD: ${cleanText(detail?.mod || '-', 180)}`,
    `📦 Size: ${cleanText(download?.size || '-', 60)}`,
    `📱 Package: ${cleanText(detail?.package || '-', 150)}`,
    `🗓 Updated: ${formatDate(detail?.updated)}`
  ]

  const historyCount =
    Array.isArray(
      detail?.history
    )
      ? detail.history.length
      : 0

  if (
    historyCount
  ) {
    lines.push(
      `🕘 Versions: ${historyCount}`
    )
  }

  return lines.join(
    '\n'
  )
}

async function sendDetail({
  sock,
  jid,
  config,
  session,
  index
}) {
  const detail =
    await fetchDetail(
      session,
      index
    )

  const image =
    resolveMediaUrl(
      detail?.icon,
      detail?.source
    ) ||
    resolveMediaUrl(
      session.items[index]
        ?.cover,
      session.items[index]
        ?.url
    )

  const message =
    new Button(sock)
      .setImage(
        image ||
        fallbackImage ||
        `${APKMODY_HOME}/static/img/default.png`
      )
      .setTitle(
        'NEXA • APKMODY'
      )
      .setBody(
        detailBody(
          detail
        )
      )
      .setFooter(
        'Pilih action di bawah'
      )
      .addReply(
        '⬇ Download Latest',
        buttonId(
          config.prefix,
          '__download',
          session.id,
          index
        )
      )

  if (
    Array.isArray(
      detail?.history
    ) &&
    detail.history.length
  ) {
    message.addReply(
      '🕘 Version History',
      buttonId(
        config.prefix,
        '__history',
        session.id
      )
    )
  }

  await message.send(
    jid
  )
}

async function ensureDetail(
  session,
  index
) {
  if (
    session.detail &&
    session.selectedIndex ===
      index
  ) {
    return session.detail
  }

  return fetchDetail(
    session,
    index
  )
}

async function sendHistory({
  sock,
  jid,
  config,
  session
}) {
  const index =
    session.selectedIndex

  if (
    index === null ||
    index === undefined
  ) {
    throw new Error(
      'DETAIL_NOT_SELECTED'
    )
  }

  const detail =
    await ensureDetail(
      session,
      index
    )

  const history =
    Array.isArray(
      detail?.history
    )
      ? detail.history
      : []

  if (
    !history.length
  ) {
    await sock.sendMessage(
      jid,
      {
        text:
          `✦ *NEXA • APKMODY*\n\n` +
          `Belum ada version history untuk *${cleanText(detail?.title || 'APK', 100)}*.`
      }
    )

    return
  }

  const image =
    resolveMediaUrl(
      detail?.icon,
      detail?.source
    ) ||
    fallbackImage ||
    `${APKMODY_HOME}/static/img/default.png`

  const cards = []

  for (
    let i = 0;
    i <
      history.length;
    i += 1
  ) {
    const item =
      history[i]

    const card =
      await makeCard({
        sock,
        image,
        body:
          `*${cleanText(item?.version || `Version ${i + 1}`, 80)}*\n\n` +
          `🗓 ${cleanText(item?.date || '-', 80)}\n` +
          `📦 ${cleanText(item?.size || '-', 60)}`,
        replies: [
          {
            text:
              '⬇ Download',
            id:
              buttonId(
                config.prefix,
                '__historydl',
                session.id,
                i
              )
          }
        ]
      })

    cards.push(
      card
    )
  }

  const carousel =
    new Carousel(sock)
      .setBody(
        `✦ *NEXA • VERSION HISTORY*\n\n` +
        `${cleanText(detail?.title || 'APK', 100)}\n` +
        `${history.length} versi tersedia`
      )
      .setFooter(
        'Geser untuk memilih versi'
      )
      .addCard(
        cards
      )

  await carousel.send(
    jid
  )
}

function mimeFor(
  file
) {
  const name =
    String(
      file?.fileName ||
      ''
    )
      .toLowerCase()

  if (
    name.endsWith(
      '.apk'
    ) ||
    String(
      file?.type ||
      ''
    )
      .toLowerCase() ===
      'apk'
  ) {
    return 'application/vnd.android.package-archive'
  }

  return 'application/octet-stream'
}

function feeText(
  access
) {
  if (
    access?.owner
  ) {
    return 'Gratis • Owner 👑'
  }

  if (
    access?.premium
  ) {
    return 'Gratis • Premium ⭐'
  }

  return `${DOWNLOAD_COST} Limit`
}

async function downloadPackage({
  sock,
  msg,
  jid,
  session,
  historyIndex = null,
  searchIndex = null
}) {
  const owner =
    session.owner

  if (
    downloadLocks.has(
      owner
    )
  ) {
    await sock.sendMessage(
      jid,
      {
        text:
          `✦ *NEXA • APKMODY*\n\n` +
          `⏳ Satu paket masih diproses.\n` +
          `Tunggu sampai pengiriman sebelumnya selesai.`
      },
      {
        quoted:
          msg
      }
    )

    return
  }

  downloadLocks.add(
    owner
  )

  let charged =
    false

  let access =
    null

  try {
    let detail

    let targetUrl

    if (
      historyIndex !==
      null
    ) {
      if (
        session.selectedIndex ===
          null ||
        session.selectedIndex ===
          undefined
      ) {
        throw new Error(
          'DETAIL_NOT_SELECTED'
        )
      }

      detail =
        await ensureDetail(
          session,
          session.selectedIndex
        )

      const history =
        detail?.history?.[
          historyIndex
        ]

      if (
        !history?.url
      ) {
        throw new Error(
          'HISTORY_ITEM_INVALID'
        )
      }

      targetUrl =
        history.url
    } else {
      const index =
        searchIndex ??
        session.selectedIndex

      if (
        index === null ||
        index === undefined
      ) {
        throw new Error(
          'DETAIL_NOT_SELECTED'
        )
      }

      detail =
        await ensureDetail(
          session,
          index
        )

      targetUrl =
        detail?.source ||
        session.items[index]
          ?.url
    }

    if (!targetUrl) {
      throw new Error(
        'DOWNLOAD_SOURCE_MISSING'
      )
    }

    let result

    try {
      result =
        await apiRequest(
          'download',
          {
            url:
              targetUrl
          }
        )
    } catch (
      apiError
    ) {
      if (
        historyIndex ===
          null &&
        Array.isArray(
          detail?.downloads
        ) &&
        detail.downloads[0]
          ?.url
      ) {
        result = {
          title:
            detail.title,
          version:
            detail.version,
          mod:
            detail.mod,
          downloads:
            detail.downloads
        }
      } else {
        throw apiError
      }
    }

    const file =
      Array.isArray(
        result?.downloads
      )
        ? result.downloads.find(
            item =>
              safeDownloadUrl(
                item?.url
              )
          )
        : null

    if (!file) {
      throw new Error(
        'DOWNLOAD_FILE_NOT_FOUND'
      )
    }

    const fileUrl =
      safeDownloadUrl(
        file.url
      )

    if (!fileUrl) {
      throw new Error(
        'DOWNLOAD_URL_INVALID'
      )
    }

    access =
      canUseLimit({
        msg,
        jid,
        cost:
          DOWNLOAD_COST
      })

    if (
      !access.allowed
    ) {
      await sendLimitEmpty({
        sock,
        msg,
        jid
      })

      return
    }

    const title =
      cleanText(
        result?.title ||
        detail?.title ||
        'APK',
        120
      )

    const version =
      cleanText(
        result?.version ||
        detail?.version ||
        '-',
        80
      )

    const mod =
      cleanText(
        result?.mod ||
        detail?.mod ||
        '-',
        180
      )

    const size =
      cleanText(
        file?.size ||
        '-',
        60
      )

    await sock.sendMessage(
      jid,
      {
        text:
          `✦ *NEXA • APKMODY*\n\n` +
          `⬇ *Menyiapkan paket...*\n\n` +
          `📱 ${title}\n` +
          `🏷 v${version.replace(/^v/i, '')}\n` +
          `📦 ${size}\n` +
          `🎟 Biaya: ${feeText(access)}\n\n` +
          `NEXA sedang menyiapkan APK untuk dikirim.`
      },
      {
        quoted:
          msg
      }
    )

    const payment =
      chargeLimit({
        msg,
        jid,
        cost:
          DOWNLOAD_COST
      })

    if (
      !payment.success
    ) {
      await sendLimitEmpty({
        sock,
        msg,
        jid
      })

      return
    }

    charged =
      Boolean(
        payment.charged
      )

    const fileName =
      cleanText(
        file?.fileName ||
        `${title}-${version}.apk`,
        180
      )
        .replace(
          /[\\/:*?"<>|]+/g,
          '_'
        )

    await sock.sendMessage(
      jid,
      {
        document: {
          url:
            fileUrl
        },

        mimetype:
          mimeFor(
            file
          ),

        fileName,

        caption:
          `✦ *NEXA • APKMODY*\n\n` +
          `✓ *Paket berhasil disiapkan*\n\n` +
          `📱 ${title}\n` +
          `🏷 ${version}\n` +
          `⚡ ${mod}\n` +
          `📦 ${size}\n` +
          `🎟 ${access.unlimited ? 'Gratis' : `-${DOWNLOAD_COST} Limit`}\n\n` +
          `⚠️ APK mod berasal dari pihak ketiga. Pastikan kamu memahami izin dan sumber file sebelum memasang.`
      },
      {
        quoted:
          msg,

        mediaUploadTimeoutMs:
          15 * 60 * 1000
      }
    )

    console.log(
      '✅ APKMODY download:',
      title,
      fileName
    )
  } catch (
    error
  ) {
    if (
      charged &&
      access?.userJid
    ) {
      try {
        addLimit(
          access.userJid,
          DOWNLOAD_COST
        )
      } catch (
        refundError
      ) {
        console.error(
          '[APKMODY] Refund gagal:',
          refundError
        )
      }
    }

    console.error(
      '[APKMODY] Download:',
      error
    )

    const refund =
      charged
        ? `\n🎟 ${DOWNLOAD_COST} Limit dikembalikan.`
        : ''

    const timeout =
      error?.message ===
        'API_TIMEOUT'

    await sock.sendMessage(
      jid,
      {
        text:
          `⚠️ *NEXA • APKMODY*\n\n` +
          (
            timeout
              ? 'Server APKMODY terlalu lama merespons.'
              : 'Paket belum berhasil dikirim.'
          ) +
          `${refund}\n` +
          `Coba lagi beberapa saat nanti.`
      },
      {
        quoted:
          msg
      }
    )
  } finally {
    downloadLocks.delete(
      owner
    )
  }
}

async function searchApps({
  sock,
  msg,
  jid,
  config,
  owner,
  query,
  page = 1
}) {
  await sock.sendMessage(
    jid,
    {
      text:
        `✦ *NEXA • APKMODY*\n\n` +
        `⌕ Sedang mencari *${cleanText(query, 80)}*...\n` +
        `NEXA lagi menyisir katalog. Tunggu sebentar.`
    },
    {
      quoted:
        msg
    }
  )

  const result =
    await apiRequest(
      'search',
      {
        query,
        page:
          String(page)
      }
    )

  const items =
    Array.isArray(
      result?.items
    )
      ? result.items.filter(
          item =>
            item?.title &&
            item?.url
        )
      : []

  if (
    !items.length
  ) {
    await sock.sendMessage(
      jid,
      {
        text:
          `✦ *NEXA • APKMODY*\n\n` +
          `Tidak ada hasil untuk *${cleanText(query, 80)}*.`
      },
      {
        quoted:
          msg
      }
    )

    return
  }

  const session =
    makeSession({
      owner,
      query:
        result?.query ||
        query,
      apiPage:
        result?.page ||
        String(page),
      items
    })

  await sendSearchCarousel({
    sock,
    jid,
    config,
    session,
    slice:
      0
  })
}

function helpText(
  prefix
) {
  return (
    `✦ *NEXA • APKMODY*\n\n` +
    `Cari aplikasi/game lalu geser hasilnya seperti katalog.\n\n` +
    `Contoh:\n` +
    `*${prefix}apkmody Stickman*\n\n` +
    `Manual fallback:\n` +
    `• ${prefix}apkmody detail 1\n` +
    `• ${prefix}apkmody download 1\n` +
    `• ${prefix}apkmody history\n` +
    `• ${prefix}apkmody version 2\n` +
    `• ${prefix}apkmody page 2\n\n` +
    `🎟 Download: ${DOWNLOAD_COST} Limit\n` +
    `⭐ Premium: gratis\n` +
    `👑 Owner: gratis`
  )
}

export default {
  name:
    'apkmody',

  aliases: [
    'apkmod'
  ],

  category:
    'DOWNLOADER',

  description:
    'Cari dan download APKMODY dengan carousel',

  usage:
    '.apkmody <query>',

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

    const owner =
      userKey(
        msg,
        jid
      )

    if (!owner) {
      return
    }

    cleanupSessions()

    const first =
      String(
        args[0] ||
        ''
      )
        .toLowerCase()

    try {
      if (
        first ===
        '__slice'
      ) {
        const session =
          getSession({
            id:
              args[1],
            owner
          })

        if (!session) {
          throw new Error(
            'SESSION_EXPIRED'
          )
        }

        await sendSearchCarousel({
          sock,
          jid,
          config,
          session,
          slice:
            Number(
              args[2]
            ) ||
            0
        })

        return
      }

      if (
        first ===
        '__detail'
      ) {
        const session =
          getSession({
            id:
              args[1],
            owner
          })

        if (!session) {
          throw new Error(
            'SESSION_EXPIRED'
          )
        }

        const index =
          Number(
            args[2]
          )

        if (
          !Number.isInteger(index) ||
          !session.items[index]
        ) {
          throw new Error(
            'SEARCH_ITEM_INVALID'
          )
        }

        await sendDetail({
          sock,
          jid,
          config,
          session,
          index
        })

        return
      }

      if (
        first ===
        '__history'
      ) {
        const session =
          getSession({
            id:
              args[1],
            owner
          })

        if (!session) {
          throw new Error(
            'SESSION_EXPIRED'
          )
        }

        await sendHistory({
          sock,
          jid,
          config,
          session
        })

        return
      }

      if (
        first ===
        '__download'
      ) {
        const session =
          getSession({
            id:
              args[1],
            owner
          })

        if (!session) {
          throw new Error(
            'SESSION_EXPIRED'
          )
        }

        const index =
          Number(
            args[2]
          )

        if (
          !Number.isInteger(index) ||
          !session.items[index]
        ) {
          throw new Error(
            'SEARCH_ITEM_INVALID'
          )
        }

        await downloadPackage({
          sock,
          msg,
          jid,
          session,
          searchIndex:
            index
        })

        return
      }

      if (
        first ===
        '__historydl'
      ) {
        const session =
          getSession({
            id:
              args[1],
            owner
          })

        if (!session) {
          throw new Error(
            'SESSION_EXPIRED'
          )
        }

        const historyIndex =
          Number(
            args[2]
          )

        if (
          !Number.isInteger(
            historyIndex
          )
        ) {
          throw new Error(
            'HISTORY_ITEM_INVALID'
          )
        }

        await downloadPackage({
          sock,
          msg,
          jid,
          session,
          historyIndex
        })

        return
      }

      if (
        first ===
        'page'
      ) {
        const previous =
          getLatestSession(
            owner
          )

        if (!previous) {
          throw new Error(
            'NO_PREVIOUS_SEARCH'
          )
        }

        const page =
          Math.max(
            1,
            Number(
              args[1]
            ) ||
            1
          )

        await searchApps({
          sock,
          msg,
          jid,
          config,
          owner,
          query:
            previous.query,
          page
        })

        return
      }

      if (
        first ===
        'detail'
      ) {
        const session =
          getLatestSession(
            owner
          )

        if (!session) {
          throw new Error(
            'NO_PREVIOUS_SEARCH'
          )
        }

        const index =
          Math.max(
            1,
            Number(
              args[1]
            ) ||
            1
          ) - 1

        if (
          !session.items[index]
        ) {
          throw new Error(
            'SEARCH_ITEM_INVALID'
          )
        }

        await sendDetail({
          sock,
          jid,
          config,
          session,
          index
        })

        return
      }

      if (
        first ===
        'download'
      ) {
        const session =
          getLatestSession(
            owner
          )

        if (!session) {
          throw new Error(
            'NO_PREVIOUS_SEARCH'
          )
        }

        const index =
          args[1]
            ? (
                Math.max(
                  1,
                  Number(
                    args[1]
                  ) ||
                  1
                ) - 1
              )
            : session
                .selectedIndex

        if (
          index ===
            null ||
          index ===
            undefined ||
          !session.items[index]
        ) {
          throw new Error(
            'SEARCH_ITEM_INVALID'
          )
        }

        await downloadPackage({
          sock,
          msg,
          jid,
          session,
          searchIndex:
            index
        })

        return
      }

      if (
        first ===
        'history'
      ) {
        const session =
          getLatestSession(
            owner
          )

        if (!session) {
          throw new Error(
            'NO_PREVIOUS_SEARCH'
          )
        }

        await sendHistory({
          sock,
          jid,
          config,
          session
        })

        return
      }

      if (
        first ===
        'version'
      ) {
        const session =
          getLatestSession(
            owner
          )

        if (!session) {
          throw new Error(
            'NO_PREVIOUS_SEARCH'
          )
        }

        const historyIndex =
          Math.max(
            1,
            Number(
              args[1]
            ) ||
            1
          ) - 1

        await downloadPackage({
          sock,
          msg,
          jid,
          session,
          historyIndex
        })

        return
      }

      const query =
        args.join(' ')
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

      await searchApps({
        sock,
        msg,
        jid,
        config,
        owner,
        query,
        page:
          1
      })
    } catch (
      error
    ) {
      console.error(
        '[APKMODY]',
        error
      )

      let text =
        'Terjadi error saat memproses APKMODY.'

      if (
        error?.message ===
        'SESSION_EXPIRED'
      ) {
        text =
          `Hasil ini sudah kedaluwarsa.\nCari ulang dengan *${prefix}apkmody <nama>*.`
      } else if (
        error?.message ===
        'NO_PREVIOUS_SEARCH'
      ) {
        text =
          `Belum ada pencarian aktif.\nGunakan *${prefix}apkmody <nama>*.`
      } else if (
        error?.message ===
        'SEARCH_ITEM_INVALID' ||
        error?.message ===
        'HISTORY_ITEM_INVALID'
      ) {
        text =
          'Pilihan tidak ditemukan. Coba pilih card lain.'
      } else if (
        error?.message ===
        'DETAIL_NOT_SELECTED'
      ) {
        text =
          'Buka Detail aplikasi dulu sebelum melihat versi.'
      } else if (
        error?.message ===
        'API_TIMEOUT'
      ) {
        text =
          'Server APKMODY terlalu lama merespons. Coba lagi sebentar.'
      }

      await sock.sendMessage(
        jid,
        {
          text:
            `⚠️ *NEXA • APKMODY*\n\n` +
            text
        },
        {
          quoted:
            msg
        }
      )
    }
  }
}
