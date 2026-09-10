// NEXA APK AGGREGATOR V1
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

import {
  searchAllApk,
  getApkDetail,
  resolveApkDownload,
  downloadApkToTemp,
  formatBytes
} from '../lib/apkProviders.js'

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

function clean(
  value,
  max = 500
) {
  return String(
    value ?? ''
  )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
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
  ).toLowerCase()
}

function cleanupSessions() {
  const time = now()

  for (
    const [id, session]
    of sessions
  ) {
    if (
      time - session.createdAt >
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
  page,
  items,
  providers
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
    page,
    items,
    providers,
    createdAt:
      now(),
    details:
      new Map()
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
    session.owner !== owner
  ) {
    return null
  }

  session.createdAt = now()

  return session
}

function getLatestSession(
  owner
) {
  const id =
    latestByUser.get(owner)

  if (!id) {
    return null
  }

  return getSession({
    id,
    owner
  })
}

// Keep internal actions on the legacy .apkmody alias.
// index.js already recognizes `.apkmody __...` as trusted carousel actions.
function buttonId(
  prefix,
  action,
  sessionId,
  value = '',
  extra = ''
) {
  return [
    `${prefix}apkmody`,
    action,
    sessionId,
    value,
    extra
  ]
    .filter(
      part =>
        String(part).length
    )
    .join(' ')
}

function providerIcon(
  provider
) {
  if (
    provider === 'APKMODY'
  ) {
    return '🟣'
  }

  if (
    provider === 'AN1'
  ) {
    return '🔵'
  }

  if (
    provider === 'LiteAPKs'
  ) {
    return '🟠'
  }

  return '🌐'
}

function searchBody(
  item
) {
  const lines = [
    `*${clean(item?.title || 'APK', 100)}*`,
    '',
    `${providerIcon(item?.providerLabel)} ${clean(item?.providerLabel || '-', 40)}`
  ]

  if (item?.version) {
    lines.push(
      `🏷 ${clean(item.version, 80)}`
    )
  }

  if (item?.size) {
    lines.push(
      `📦 ${clean(item.size, 60)}`
    )
  }

  if (item?.mod) {
    lines.push(
      `⚡ ${clean(item.mod, 120)}`
    )
  }

  if (
    Number.isFinite(
      item?.rating
    )
  ) {
    lines.push(
      `⭐ ${item.rating}`
    )
  }

  if (
    item?.developer &&
    lines.length < 7
  ) {
    lines.push(
      `👤 ${clean(item.developer, 80)}`
    )
  }

  return lines.join('\n')
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
      return await build(image)
    } catch (error) {
      console.warn(
        '[APK] card image:',
        error?.message ||
        error
      )
    }
  }

  if (fallbackImage) {
    return build(
      fallbackImage
    )
  }

  throw new Error(
    'APK_CARD_MEDIA_MISSING'
  )
}

function providersText(
  providers
) {
  const ok =
    (providers || [])
      .filter(x => x.ok)

  return (
    `${ok.length}/${(providers || []).length || 3} sumber aktif` +
    (
      ok.length
        ? ` • ${ok.map(x => x.label).join(', ')}`
        : ''
    )
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
        Number(slice) || 0
      ),
      totalSlices - 1
    )

  const start =
    page * CARDS_PER_PAGE

  const end =
    Math.min(
      start + CARDS_PER_PAGE,
      total
    )

  const cards = []

  for (
    let index = start;
    index < end;
    index++
  ) {
    const item =
      session.items[index]

    cards.push(
      await makeCard({
        sock,
        image:
          item.icon,
        body:
          searchBody(item),
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
    )
  }

  if (
    totalSlices > 1
  ) {
    const replies = []

    if (page > 0) {
      replies.push({
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
      page < totalSlices - 1
    ) {
      replies.push({
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

    cards.push(
      await makeCard({
        sock,
        image:
          fallbackImage,
        body:
          `*Hasil lainnya*\n\n` +
          `${start + 1}–${end} dari ${total}\n` +
          `Geser atau pindah halaman.`,
        replies
      })
    )
  }

  const carousel =
    new Carousel(sock)
      .setBody(
        `✦ *NEXA • APK*\n\n` +
        `⌕ “${clean(session.query, 80)}”\n` +
        `Hasil ${start + 1}–${end} dari ${total}\n` +
        `${providersText(session.providers)}`
      )
      .setFooter(
        'Geser kanan / kiri • sumber tertera di tiap card'
      )
      .addCard(cards)

  await carousel.send(jid)
}

async function ensureDetail(
  session,
  index
) {
  if (
    !Number.isInteger(index) ||
    !session.items[index]
  ) {
    throw new Error(
      'SEARCH_ITEM_INVALID'
    )
  }

  if (
    session.details.has(index)
  ) {
    return session.details.get(
      index
    )
  }

  const detail =
    await getApkDetail(
      session.items[index]
    )

  session.details.set(
    index,
    detail
  )

  session.createdAt = now()

  return detail
}

function detailBody(
  detail
) {
  const lines = [
    `*${clean(detail.title || 'APK', 120)}*`,
    '',
    `${providerIcon(detail.providerLabel)} Source: ${clean(detail.providerLabel, 50)}`
  ]

  if (detail.version) {
    lines.push(
      `🏷 Version: ${clean(detail.version, 80)}`
    )
  }

  if (detail.mod) {
    lines.push(
      `⚡ MOD: ${clean(detail.mod, 180)}`
    )
  }

  if (detail.size) {
    lines.push(
      `📦 Size: ${clean(detail.size, 60)}`
    )
  }

  if (detail.package) {
    lines.push(
      `📱 Package: ${clean(detail.package, 120)}`
    )
  }

  if (detail.android) {
    lines.push(
      `🤖 Android: ${clean(detail.android, 80)}`
    )
  }

  if (detail.updated) {
    lines.push(
      `🗓 Updated: ${clean(detail.updated, 100)}`
    )
  }

  if (detail.developer) {
    lines.push(
      `👤 Developer: ${clean(detail.developer, 100)}`
    )
  }

  if (
    Number.isFinite(
      detail.rating
    )
  ) {
    lines.push(
      `⭐ Rating: ${detail.rating}`
    )
  }

  lines.push(
    `📥 File: ${detail.downloads.length} opsi`
  )

  return lines.join('\n')
}

async function sendDetail({
  sock,
  jid,
  config,
  session,
  index
}) {
  const detail =
    await ensureDetail(
      session,
      index
    )

  let message =
    new Button(sock)
      .setImage(
        detail.icon ||
        session.items[index]?.icon ||
        fallbackImage
      )
      .setTitle(
        'NEXA • APK'
      )
      .setBody(
        detailBody(detail)
      )
      .setFooter(
        'Data berasal dari provider yang tertera'
      )

  if (
    detail.downloads.length === 1
  ) {
    message =
      message.addReply(
        '⬇ Download',
        buttonId(
          config.prefix,
          '__optdl',
          session.id,
          index,
          0
        )
      )
  } else if (
    detail.downloads.length > 1
  ) {
    message =
      message.addReply(
        '📦 Pilih File',
        buttonId(
          config.prefix,
          '__options',
          session.id,
          index
        )
      )
  }

  await message.send(jid)
}

async function sendOptions({
  sock,
  jid,
  config,
  session,
  index
}) {
  const detail =
    await ensureDetail(
      session,
      index
    )

  if (!detail.downloads.length) {
    throw new Error(
      'DOWNLOAD_FILE_NOT_FOUND'
    )
  }

  if (
    detail.downloads.length === 1
  ) {
    return downloadOption({
      sock,
      jid,
      config,
      session,
      index,
      optionIndex: 0,
      msg: null
    })
  }

  const cards = []

  for (
    let i = 0;
    i < detail.downloads.length;
    i++
  ) {
    const option =
      detail.downloads[i]

    cards.push(
      await makeCard({
        sock,
        image:
          detail.icon ||
          session.items[index]?.icon ||
          fallbackImage,
        body:
          `*${clean(option.name || `File ${i + 1}`, 140)}*\n\n` +
          `${providerIcon(detail.providerLabel)} ${clean(detail.providerLabel, 50)}\n` +
          `📦 ${clean(option.size || detail.size || '-', 70)}`,
        replies: [
          {
            text:
              '⬇ Download',
            id:
              buttonId(
                config.prefix,
                '__optdl',
                session.id,
                index,
                i
              )
          }
        ]
      })
    )
  }

  const carousel =
    new Carousel(sock)
      .setBody(
        `✦ *NEXA • PILIH FILE*\n\n` +
        `${clean(detail.title, 100)}\n` +
        `${detail.downloads.length} opsi tersedia`
      )
      .setFooter(
        'Geser lalu pilih file yang ingin diunduh'
      )
      .addCard(cards)

  await carousel.send(jid)
}

function feeText(
  access
) {
  if (access?.owner) {
    return 'Gratis • Owner 👑'
  }

  if (access?.premium) {
    return 'Gratis • Premium ⭐'
  }

  return `${DOWNLOAD_COST} Limit`
}

function mimeFor(
  resolved
) {
  const name =
    String(
      resolved?.filename || ''
    ).toLowerCase()

  if (
    name.endsWith('.apk')
  ) {
    return 'application/vnd.android.package-archive'
  }

  if (
    name.endsWith('.zip') ||
    name.endsWith('.xapk') ||
    name.endsWith('.apks')
  ) {
    return 'application/zip'
  }

  return (
    resolved?.mimetype ||
    'application/octet-stream'
  )
}

async function downloadOption({
  sock,
  msg,
  jid,
  session,
  index,
  optionIndex
}) {
  const lockKey =
    session.owner

  if (
    downloadLocks.has(lockKey)
  ) {
    await sock.sendMessage(
      jid,
      {
        text:
          `✦ *NEXA • APK*\n\n` +
          `⏳ Satu file masih diproses. Tunggu sampai selesai.`
      },
      msg
        ? { quoted: msg }
        : undefined
    )

    return
  }

  downloadLocks.add(lockKey)

  let downloaded = null
  let charged = false
  let access = null

  try {
    const detail =
      await ensureDetail(
        session,
        index
      )

    const option =
      detail.downloads[
        optionIndex
      ]

    if (!option) {
      throw new Error(
        'DOWNLOAD_FILE_NOT_FOUND'
      )
    }

    access =
      canUseLimit({
        msg,
        jid,
        cost:
          DOWNLOAD_COST
      })

    if (!access.allowed) {
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
          `✦ *NEXA • APK*\n\n` +
          `⬇ *Menyiapkan paket...*\n\n` +
          `📱 ${clean(detail.title, 120)}\n` +
          `🏷 ${clean(detail.version || 'Latest', 80)}\n` +
          `📦 ${clean(option.size || detail.size || '-', 60)}\n` +
          `${providerIcon(detail.providerLabel)} ${clean(detail.providerLabel, 50)}\n` +
          `🎟 Biaya: ${feeText(access)}\n\n` +
          `NEXA sedang mengambil file dari provider.`
      },
      msg
        ? { quoted: msg }
        : undefined
    )

    const resolved =
      await resolveApkDownload(
        detail,
        optionIndex
      )

    downloaded =
      await downloadApkToTemp(
        resolved
      )

    const payment =
      chargeLimit({
        msg,
        jid,
        cost:
          DOWNLOAD_COST
      })

    if (!payment.success) {
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

    await sock.sendMessage(
      jid,
      {
        document: {
          url:
            downloaded.filePath
        },
        fileName:
          downloaded.filename,
        mimetype:
          mimeFor(resolved),
        caption:
          `✦ *NEXA • APK*\n\n` +
          `✓ *Paket berhasil disiapkan*\n\n` +
          `📱 ${clean(detail.title, 120)}\n` +
          `🏷 ${clean(detail.version || 'Latest', 80)}\n` +
          `⚡ ${clean(detail.mod || 'Original / Free', 180)}\n` +
          `📦 ${formatBytes(downloaded.actualBytes)}\n` +
          `${providerIcon(detail.providerLabel)} ${clean(detail.providerLabel, 50)}\n` +
          `🎟 ${access.unlimited ? 'Gratis' : `-${DOWNLOAD_COST} Limit`}\n\n` +
          `⚠️ APK berasal dari pihak ketiga. Periksa sumber dan izin aplikasi sebelum memasang.`
      },
      {
        ...(msg
          ? { quoted: msg }
          : {}),
        mediaUploadTimeoutMs:
          20 * 60 * 1000
      }
    )

    console.log(
      `✅ APK download [${detail.providerLabel}]:`,
      detail.title,
      downloaded.filename
    )
  } catch (error) {
    if (
      charged &&
      access?.userJid
    ) {
      try {
        addLimit(
          access.userJid,
          DOWNLOAD_COST
        )
      } catch (refundError) {
        console.error(
          '[APK] Refund gagal:',
          refundError
        )
      }
    }

    console.error(
      '[APK] Download:',
      error
    )

    const refund =
      charged
        ? `\n🎟 ${DOWNLOAD_COST} Limit dikembalikan.`
        : ''

    let reason =
      'File belum berhasil dikirim.'

    const code =
      String(
        error?.message || ''
      )

    if (
      /DIRECT_NOT_FOUND|DOWNLOAD_FILE_NOT_FOUND|OPTION_INVALID/i
        .test(code)
    ) {
      reason =
        'Provider tidak memberikan direct download yang valid.'
    } else if (
      /FILE_IS_HTML|SIZE_MISMATCH/i
        .test(code)
    ) {
      reason =
        'Provider mengembalikan halaman/berkas yang tidak sesuai. NEXA membatalkan pengiriman.'
    } else if (
      /CURL_|TIMEOUT|fetch failed|ECONN|ENOTFOUND/i
        .test(code)
    ) {
      reason =
        'Koneksi ke provider/CDN sedang bermasalah.'
    }

    await sock.sendMessage(
      jid,
      {
        text:
          `⚠️ *NEXA • APK*\n\n` +
          `${reason}${refund}\n` +
          `Coba provider/card lain atau ulangi nanti.`
      },
      msg
        ? { quoted: msg }
        : undefined
    )
  } finally {
    try {
      await downloaded
        ?.cleanup?.()
    } catch (cleanupError) {
      console.error(
        '[APK] cleanup:',
        cleanupError
      )
    }

    downloadLocks.delete(
      lockKey
    )
  }
}

async function downloadFromSearch({
  sock,
  msg,
  jid,
  config,
  session,
  index
}) {
  const detail =
    await ensureDetail(
      session,
      index
    )

  if (!detail.downloads.length) {
    throw new Error(
      'DOWNLOAD_FILE_NOT_FOUND'
    )
  }

  if (
    detail.downloads.length > 1
  ) {
    await sendOptions({
      sock,
      jid,
      config,
      session,
      index
    })
    return
  }

  await downloadOption({
    sock,
    msg,
    jid,
    session,
    index,
    optionIndex: 0
  })
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
        `✦ *NEXA • APK*\n\n` +
        `⌕ Sedang mencari *${clean(query, 80)}*...\n` +
        `NEXA menyisir APKMODY, AN1, dan LiteAPKs.`
    },
    {
      quoted: msg
    }
  )

  const result =
    await searchAllApk(
      query,
      page
    )

  if (!result.items.length) {
    const anyHealthy =
      result.providers.some(
        item => item.ok
      )

    await sock.sendMessage(
      jid,
      {
        text:
          `✦ *NEXA • APK*\n\n` +
          (
            anyHealthy
              ? `Tidak ada hasil untuk *${clean(query, 80)}*.`
              : 'Semua provider sedang gagal dihubungi.'
          ) +
          `\n${providersText(result.providers)}`
      },
      {
        quoted: msg
      }
    )

    return
  }

  const session =
    makeSession({
      owner,
      query,
      page,
      items:
        result.items,
      providers:
        result.providers
    })

  await sendSearchCarousel({
    sock,
    jid,
    config,
    session,
    slice: 0
  })
}

function helpText(
  prefix
) {
  return (
    `✦ *NEXA • APK*\n\n` +
    `Cari APK dari beberapa provider sekaligus.\n\n` +
    `Contoh:\n` +
    `*${prefix}apk CapCut*\n\n` +
    `Alias:\n` +
    `• ${prefix}mod\n` +
    `• ${prefix}apkmody\n\n` +
    `Manual:\n` +
    `• ${prefix}apk detail 1\n` +
    `• ${prefix}apk download 1\n` +
    `• ${prefix}apk page 2\n\n` +
    `Sumber: APKMODY • AN1 • LiteAPKs\n` +
    `🎟 Download: ${DOWNLOAD_COST} Limit\n` +
    `⭐ Premium: gratis\n` +
    `👑 Owner: gratis`
  )
}

export default {
  name:
    'apk',

  aliases: [
    'mod',
    'apkmody',
    'apkmod'
  ],

  category:
    'DOWNLOADER',

  description:
    'Cari dan download APK dari APKMODY, AN1, dan LiteAPKs',

  usage:
    '.apk <query>',

  async run({
    sock,
    msg,
    jid,
    args,
    config
  }) {
    const prefix =
      config?.prefix || '.'

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
        args?.[0] || ''
      ).toLowerCase()

    try {
      if (
        first === '__slice'
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
            Number(args[2]) || 0
        })
        return
      }

      if (
        first === '__detail'
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

        await sendDetail({
          sock,
          jid,
          config,
          session,
          index:
            Number(args[2])
        })
        return
      }

      if (
        first === '__download'
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

        await downloadFromSearch({
          sock,
          msg,
          jid,
          config,
          session,
          index:
            Number(args[2])
        })
        return
      }

      if (
        first === '__options'
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

        await sendOptions({
          sock,
          jid,
          config,
          session,
          index:
            Number(args[2])
        })
        return
      }

      if (
        first === '__optdl'
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

        await downloadOption({
          sock,
          msg,
          jid,
          session,
          index:
            Number(args[2]),
          optionIndex:
            Number(args[3])
        })
        return
      }

      if (
        first === 'page'
      ) {
        const previous =
          getLatestSession(owner)

        if (!previous) {
          throw new Error(
            'NO_PREVIOUS_SEARCH'
          )
        }

        const page =
          Math.max(
            1,
            Number(args[1]) || 1
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
        first === 'detail' ||
        first === 'download'
      ) {
        const session =
          getLatestSession(owner)

        if (!session) {
          throw new Error(
            'NO_PREVIOUS_SEARCH'
          )
        }

        const index =
          Math.max(
            1,
            Number(args[1]) || 1
          ) - 1

        if (
          !session.items[index]
        ) {
          throw new Error(
            'SEARCH_ITEM_INVALID'
          )
        }

        if (
          first === 'detail'
        ) {
          await sendDetail({
            sock,
            jid,
            config,
            session,
            index
          })
        } else {
          await downloadFromSearch({
            sock,
            msg,
            jid,
            config,
            session,
            index
          })
        }
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
              helpText(prefix)
          },
          {
            quoted: msg
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
        page: 1
      })
    } catch (error) {
      console.error(
        '[APK]',
        error
      )

      let text =
        'Terjadi error saat memproses APK.'

      if (
        error?.message ===
          'SESSION_EXPIRED'
      ) {
        text =
          `Hasil ini sudah kedaluwarsa. Cari ulang dengan *${prefix}apk <nama>*.`
      } else if (
        error?.message ===
          'NO_PREVIOUS_SEARCH'
      ) {
        text =
          `Belum ada pencarian aktif. Gunakan *${prefix}apk <nama>*.`
      } else if (
        error?.message ===
          'SEARCH_ITEM_INVALID'
      ) {
        text =
          'Pilihan tidak ditemukan. Coba card lain.'
      } else if (
        /DOWNLOAD_FILE_NOT_FOUND|DIRECT_NOT_FOUND/i
          .test(
            error?.message || ''
          )
      ) {
        text =
          'Provider belum memberikan file download yang valid untuk hasil ini.'
      }

      await sock.sendMessage(
        jid,
        {
          text:
            `⚠️ *NEXA • APK*\n\n` +
            text
        },
        {
          quoted: msg
        }
      )
    }
  }
}
