// NEXA PIN IKYY CAROUSEL V2
import {
  AIRich,
  Button,
  Carousel
} from '@rexxhayanasi/elaina-baileys'

import {
  readFileSync
} from 'node:fs'

import {
  randomBytes
} from 'node:crypto'

import {
  getProfileJid
} from '../lib/profile.js'

const API_URL =
  'https://api.zyvor.my.id/api/search/pinterest'

const SESSION_TTL =
  10 * 60 * 1000

const MAX_RESULTS =
  10

const sessions =
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

function numberText(
  value
) {
  const num =
    Number(value)

  if (
    !Number.isFinite(num) ||
    num < 0
  ) {
    return '-'
  }

  return new Intl
    .NumberFormat(
      'id-ID'
    )
    .format(num)
}

function ownerKey(
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
    .trim()
    .toLowerCase()
}

function cleanupSessions() {
  const now =
    Date.now()

  for (
    const [id, session]
    of sessions
  ) {
    if (
      now -
      session.createdAt >
      SESSION_TTL
    ) {
      sessions.delete(id)
    }
  }
}

function makeSession({
  owner,
  query,
  items,
  prefix
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
    items,
    prefix,
    createdAt:
      Date.now()
  }

  sessions.set(
    id,
    session
  )

  return session
}

function getSession({
  id,
  owner
}) {
  cleanupSessions()

  const session =
    sessions.get(
      String(id || '')
    )

  if (
    !session ||
    session.owner !==
      owner
  ) {
    return null
  }

  return session
}

function readLocalSecret() {
  try {
    const rawKey =
      cleanText(
        readFileSync(
          new URL(
            '../database/ikyy.key',
            import.meta.url
          ),
          'utf8'
        ),
        500
      )

    if (rawKey) {
      return rawKey
    }
  } catch {}

  try {
    const raw =
      readFileSync(
        new URL(
          '../database/secrets.json',
          import.meta.url
        ),
        'utf8'
      )

    const json =
      JSON.parse(raw)

    return cleanText(
      json?.ikyyApiKey ||
      json?.ikyy?.apiKey ||
      '',
      500
    )
  } catch {
    return ''
  }
}

function getApiKey(
  config
) {
  return (
    cleanText(
      process.env
        .IKYY_API_KEY ||
      process.env
        .NEXA_IKYY_API_KEY ||
      '',
      500
    ) ||
    cleanText(
      config?.apiKeys
        ?.ikyy ||
      config?.ikyyApiKey ||
      '',
      500
    ) ||
    readLocalSecret()
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
      url.protocol !==
        'https:' &&
      url.protocol !==
        'http:'
    ) {
      return ''
    }

    return url.href
  } catch {
    return ''
  }
}

function normalizeItem(
  item
) {
  const imageUrl =
    safeHttpUrl(
      item?.image
    )

  if (!imageUrl) {
    return null
  }

  return {
    id:
      cleanText(
        item?.index,
        100
      ),

    title:
      cleanText(
        item?.title ||
        'Pinterest Image',
        160
      ),

    imageUrl,

    source:
      safeHttpUrl(
        item?.pinUrl
      ),

    username:
      cleanText(
        item?.username,
        100
      ),

    name:
      cleanText(
        item?.fullName,
        120
      ),

    followers:
      null
  }
}

async function searchPinterest(
  query
) {
  const url =
    new URL(
      API_URL
    )

  url.searchParams.set(
    'query',
    query
  )

  url.searchParams.set(
    'limit',
    String(MAX_RESULTS)
  )

  const controller =
    new AbortController()

  const timer =
    setTimeout(
      () => {
        controller.abort()
      },
      30_000
    )

  try {
    const response =
      await fetch(
        url,
        {
          method:
            'GET',

          headers: {
            Accept:
              'application/json'
          },

          signal:
            controller.signal
        }
      )

    let json

    try {
      json =
        await response.json()
    } catch {
      throw new Error(
        `PINTEREST_BAD_JSON_${response.status}`
      )
    }

    if (
      !response.ok ||
      json?.status !==
        true
    ) {
      throw new Error(
        cleanText(
          json?.message ||
          json?.error ||
          `PINTEREST_HTTP_${response.status}`,
          180
        ) ||
        'PINTEREST_API_FAILED'
      )
    }

    const items =
      Array.isArray(
        json?.result?.items
      )
        ? json.result.items
            .map(
              normalizeItem
            )
            .filter(Boolean)
            .slice(
              0,
              MAX_RESULTS
            )
        : []

    return {
      query:
        cleanText(
          json?.result?.query ||
          query,
          120
        ),

      count:
        Number(
          json?.result?.total
        ) || items.length,

      items
    }
  } catch (
    error
  ) {
    if (
      error?.name ===
      'AbortError'
    ) {
      throw new Error(
        'PINTEREST_API_TIMEOUT'
      )
    }

    throw error
  } finally {
    clearTimeout(
      timer
    )
  }
}

function actionId(
  prefix,
  action,
  sessionId,
  index
) {
  return (
    `${prefix}pin ` +
    `${action} ` +
    `${sessionId} ` +
    `${index}`
  )
}

function cardBody(
  item,
  index
) {
  const displayName =
    item.name ||
    item.username ||
    'Unknown'

  const username =
    item.username
      ? `@${item.username}`
      : '-'

  return (
    `*${index + 1}. ${item.title}*\n\n` +
    `👤 ${displayName}\n` +
    `🏷 ${username}\n` +
    `👥 ${numberText(item.followers)} followers`
  )
}

async function buildCard({
  sock,
  item,
  index,
  prefix,
  sessionId
}) {
  const build =
    async media => {
      return new Button(
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
          '🖼 Kirim Gambar',
          actionId(
            prefix,
            '__send',
            sessionId,
            index
          )
        )
        .addReply(
          '🔗 Sumber',
          actionId(
            prefix,
            '__source',
            sessionId,
            index
          )
        )
        .toCard()
    }

  try {
    return await build(
      item.imageUrl
    )
  } catch (
    error
  ) {
    console.error(
      '[PINTEREST] Card image fallback:',
      error?.message ||
      error
    )

    if (
      fallbackImage
    ) {
      return build(
        fallbackImage
      )
    }

    throw error
  }
}

async function startRichStatus({
  sock,
  msg,
  jid,
  query
}) {
  try {
    const rich =
      new AIRich(sock)
        .setTitle(
          '✦ NEXA • PINTEREST'
        )
        .setFooter(
          'NEXA Search • AIRich'
        )
        .addText(
          `⌕ *${cleanText(query, 80)}*`,
          {
            id:
              'query'
          }
        )
        .addText(
          '⏳ Mencari gambar Pinterest...',
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
  } catch (
    error
  ) {
    console.warn(
      '[PINTEREST] AIRich start fallback:',
      error?.message ||
      error
    )

    return null
  }
}

async function updateRichStatus(
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
  } catch (
    error
  ) {
    console.warn(
      '[PINTEREST] AIRich edit fallback:',
      error?.message ||
      error
    )

    return false
  }
}

async function sendCarousel({
  sock,
  jid,
  result,
  session
}) {
  const cards = []

  for (
    let index = 0;
    index <
      session.items.length;
    index += 1
  ) {
    cards.push(
      await buildCard({
        sock,
        item:
          session.items[index],
        index,
        prefix:
          session.prefix,
        sessionId:
          session.id
      })
    )
  }

  const carousel =
    new Carousel(sock)
      .setBody(
        `✦ *NEXA • PINTEREST*\n\n` +
        `⌕ “${cleanText(result.query, 80)}”\n` +
        `Menampilkan ${session.items.length}` +
        (
          result.count >
          session.items.length
            ? ` dari ${result.count}`
            : ''
        ) +
        ` hasil`
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

async function sendSelectedImage({
  sock,
  msg,
  jid,
  item
}) {
  await sock.sendMessage(
    jid,
    {
      image: {
        url:
          item.imageUrl
      },

      caption:
        `✦ *NEXA • PINTEREST*\n\n` +
        `🖼 ${item.title}\n` +
        `👤 ${
          item.name ||
          item.username ||
          'Unknown'
        }\n` +
        (
          item.source
            ? `🔗 ${item.source}`
            : ''
        )
    },
    {
      quoted:
        msg,

      mediaUploadTimeoutMs:
        60_000
    }
  )
}

function helpText(
  prefix
) {
  return (
    `✦ *NEXA • PINTEREST*\n\n` +
    `Cari gambar Pinterest dalam carousel.\n\n` +
    `Contoh:\n` +
    `*${prefix}pin Elaina*\n\n` +
    `Hasil menampilkan gambar, pembuat, followers, ` +
    `serta tombol Kirim Gambar / Sumber.`
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
    'IKYY_API_KEY_MISSING'
  ) {
    return (
      'API key Ikyy belum dikonfigurasi. Simpan private key di database/ikyy.key atau database/secrets.json.'
    )
  }

  if (
    code ===
    'PINTEREST_API_TIMEOUT'
  ) {
    return (
      'API Pinterest terlalu lama merespons. Coba lagi sebentar.'
    )
  }

  if (
    /401|403|apikey|api.?key|unauthorized|forbidden/i
      .test(code)
  ) {
    return (
      'API key Pinterest ditolak atau tidak valid.'
    )
  }

  return (
    'Pinterest search sedang bermasalah. Coba lagi beberapa saat.'
  )
}

export default {
  name:
    'pin',

  aliases: [
    'pinterest',
    'pinterestsearch',
    'pinsearch'
  ],

  category:
    'SEARCH',

  description:
    'Cari gambar Pinterest dengan carousel',

  usage:
    '.pin <query>',

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
      ownerKey(
        msg,
        jid
      )

    if (!owner) {
      return
    }

    cleanupSessions()

    const first =
      String(
        args?.[0] ||
        ''
      )
        .trim()
        .toLowerCase()

    let richStatus =
      null

    try {
      if (
        first ===
          '__send' ||
        first ===
          '__source'
      ) {
        const session =
          getSession({
            id:
              args?.[1],
            owner
          })

        if (!session) {
          throw new Error(
            'PINTEREST_SESSION_EXPIRED'
          )
        }

        const index =
          Number(
            args?.[2]
          )

        if (
          !Number.isInteger(
            index
          ) ||
          !session.items[
            index
          ]
        ) {
          throw new Error(
            'PINTEREST_ITEM_INVALID'
          )
        }

        const item =
          session.items[
            index
          ]

        if (
          first ===
          '__send'
        ) {
          await sendSelectedImage({
            sock,
            msg,
            jid,
            item
          })

          return
        }

        await sock.sendMessage(
          jid,
          {
            text:
              item.source
                ? (
                    `✦ *NEXA • PINTEREST*\n\n` +
                    `📌 ${item.title}\n` +
                    `🔗 ${item.source}`
                  )
                : (
                    `✦ *NEXA • PINTEREST*\n\n` +
                    `Sumber pin tidak tersedia untuk hasil ini.`
                  )
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

      richStatus =
        await startRichStatus({
          sock,
          msg,
          jid,
          query
        })

      if (!richStatus) {
        await sock.sendMessage(
          jid,
          {
            text:
              `✦ *NEXA • PINTEREST*\n\n` +
              `⌕ Mencari *${cleanText(query, 80)}*...`
          },
          {
            quoted:
              msg
          }
        )
      }

      const result =
        await searchPinterest(
          query
        )

      if (
        !result.items.length
      ) {
        const updated =
          await updateRichStatus(
            richStatus,
            `⚠️ Tidak ada hasil untuk *${cleanText(query, 80)}*.`
          )

        if (!updated) {
          await sock.sendMessage(
            jid,
            {
              text:
                `✦ *NEXA • PINTEREST*\n\n` +
                `Tidak ada hasil untuk *${cleanText(query, 80)}*.`
            },
            {
              quoted:
                msg
            }
          )
        }

        return
      }

      await updateRichStatus(
        richStatus,
        `✅ ${result.items.length} hasil ditemukan.\n` +
        `🧩 Menyiapkan carousel...`
      )

      const session =
        makeSession({
          owner,
          query:
            result.query,
          items:
            result.items,
          prefix
        })

      await sendCarousel({
        sock,
        jid,
        result,
        session
      })

      await updateRichStatus(
        richStatus,
        `✅ Selesai • ${session.items.length} hasil siap.\n` +
        `↔️ Geser carousel untuk melihat semuanya.`
      )
    } catch (
      error
    ) {
      console.error(
        '[PINTEREST]',
        error?.message ||
        error
      )

      let text =
        errorText(
          error
        )

      if (
        error?.message ===
        'PINTEREST_SESSION_EXPIRED'
      ) {
        text =
          `Hasil ini sudah kedaluwarsa.\n` +
          `Cari ulang dengan *${prefix}pin <query>*.`
      } else if (
        error?.message ===
        'PINTEREST_ITEM_INVALID'
      ) {
        text =
          'Pilihan gambar tidak ditemukan. Cari ulang lalu pilih card lain.'
      }

      const updated =
        await updateRichStatus(
          richStatus,
          `⚠️ ${text}`
        )

      if (!updated) {
        await sock.sendMessage(
          jid,
          {
            text:
              `⚠️ *NEXA • PINTEREST*\n\n` +
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
}
