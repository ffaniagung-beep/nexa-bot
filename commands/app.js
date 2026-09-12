// NEXA ORIGINAL APP COMMAND V1
import {
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
  searchOriginalApps,
  getOriginalAppDetail,
  resolveOriginalAppDownload,
  downloadOriginalAppToTemp,
  parseSizeBytes,
  MAX_APP_DOWNLOAD_BYTES,
  formatBytes
} from '../lib/appProviders.js'

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

import {
  getProfileJid
} from '../lib/profile.js'

const SESSION_TTL =
  15 * 60 * 1000

const CARDS_PER_PAGE =
  8

const UPLOAD_TIMEOUT =
  20 * 60 * 1000

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
    createdAt: now(),
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

function buttonId(
  prefix,
  action,
  sessionId,
  value = ''
) {
  return [
    `${prefix}app`,
    action,
    sessionId,
    value
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
    provider ===
    'apkpure'
  ) {
    return '🟢'
  }

  if (
    provider ===
    'uptodown'
  ) {
    return '🔵'
  }

  return '📦'
}

function providerText(
  providers
) {
  const ok =
    (providers || [])
      .filter(item => item.ok)

  return (
    `${ok.length}/${(providers || []).length || 2} sumber aktif` +
    (
      ok.length
        ? ` • ${ok.map(item => item.label).join(', ')}`
        : ''
    )
  )
}

function searchBody(
  item
) {
  const lines = [
    `*${clean(item.title || 'Aplikasi', 120)}*`,
    '',
    `${providerIcon(item.provider)} Source: ${clean(item.providerLabel, 40)}`
  ]

  if (item.developer) {
    lines.push(
      `👤 ${clean(item.developer, 90)}`
    )
  }

  if (
    Number.isFinite(
      item.rating
    )
  ) {
    lines.push(
      `⭐ ${item.rating}`
    )
  }

  if (item.description) {
    lines.push(
      `📝 ${clean(item.description, 150)}`
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
        '[APP] card image:',
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
    'APP_CARD_MEDIA_MISSING'
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

  const pages =
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
      pages - 1
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

  const cards = []

  for (
    let index = start;
    index < end;
    index += 1
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

  if (pages > 1) {
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
      page <
      pages - 1
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
          `${start + 1}–${end} dari ${total}`,
        replies
      })
    )
  }

  const carousel =
    new Carousel(sock)
      .setBody(
        `✦ *NEXA • APP*\n\n` +
        `⌕ “${clean(session.query, 80)}”\n` +
        `Hasil ${start + 1}–${end} dari ${total}\n` +
        `${providerText(session.providers)}`
      )
      .setFooter(
        'APK/XAPK original • APKPure + Uptodown'
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
    await getOriginalAppDetail(
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
    `*${clean(detail.title || 'Aplikasi', 120)}*`,
    '',
    `${providerIcon(detail.provider)} Source: ${clean(detail.providerLabel, 40)}`
  ]

  if (detail.version) {
    lines.push(
      `🏷 Versi: ${clean(detail.version, 80)}`
    )
  }

  if (detail.packageName) {
    lines.push(
      `📱 Package: ${clean(detail.packageName, 120)}`
    )
  }

  if (detail.developer) {
    lines.push(
      `👤 Developer: ${clean(detail.developer, 100)}`
    )
  }

  if (detail.category) {
    lines.push(
      `🗂 Kategori: ${clean(detail.category, 80)}`
    )
  }

  if (detail.android) {
    lines.push(
      `🤖 Android: ${clean(detail.android, 80)}`
    )
  }

  if (detail.size) {
    lines.push(
      `📦 Ukuran: ${clean(detail.size, 60)}`
    )
  }

  if (detail.fileType) {
    lines.push(
      `🧩 File: ${clean(detail.fileType, 30)}`
    )
  }

  if (
    Number.isFinite(
      detail.rating
    )
  ) {
    lines.push(
      `⭐ Rating: ${detail.rating}` +
      (
        detail.ratingCount
          ? ` (${detail.ratingCount})`
          : ''
      )
    )
  }

  if (detail.description) {
    lines.push(
      '',
      clean(
        detail.description,
        480
      )
    )
  }

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
        session.items[index]
          ?.icon ||
        fallbackImage
      )
      .setTitle(
        'NEXA • APP'
      )
      .setBody(
        detailBody(detail)
      )
      .setFooter(
        'Original app • bukan MOD'
      )

  message =
    message.addReply(
      '⬇ Download',
      buttonId(
        config.prefix,
        '__download',
        session.id,
        index
      )
    )

  await message.send(jid)
}

function feeText(
  job
) {
  if (job?.access?.owner) {
    return 'Gratis • Owner 👑'
  }

  if (job?.access?.premium) {
    return `${job.cost} Limit • Premium ⭐`
  }

  return `${job?.cost || 0} Limit`
}

function mimeFor(
  downloaded
) {
  if (
    String(
      downloaded?.fileType || ''
    ).toUpperCase() ===
    'APK'
  ) {
    return 'application/vnd.android.package-archive'
  }

  return 'application/zip'
}

async function downloadItem({
  sock,
  msg,
  jid,
  session,
  index
}) {
  const lockKey =
    session.owner

  if (
    downloadLocks.has(
      lockKey
    )
  ) {
    return sock.sendMessage(
      jid,
      {
        text:
          `✦ *NEXA • APP*\n\n` +
          `⏳ Satu file masih diproses. Tunggu sampai selesai.`
      },
      msg
        ? { quoted: msg }
        : undefined
    )
  }

  downloadLocks.add(
    lockKey
  )

  let downloaded = null
  let job = null
  let delivered = false

  try {
    const detail =
      await ensureDetail(
        session,
        index
      )

    const resolved =
      await resolveOriginalAppDownload(
        detail
      )

    const declaredBytes =
      parseSizeBytes(
        resolved.size ||
        detail.size
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

    const normalCost =
      getDownloadLimitCost(
        declaredBytes,
        {
          premium: false
        }
      )

    const premiumCost =
      getDownloadLimitCost(
        declaredBytes,
        {
          premium: true
        }
      )

    job =
      beginBilledJob({
        msg,
        jid,
        kind: 'download',
        normalCost,
        premiumCost,
        globalLimit: 2,
        perOwnerLimit: 1,
        ttlMs:
          30 * 60 * 1000
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
            `✦ *NEXA • APP*\n\n` +
            resourceBusyText(
              job.busy,
              'download besar'
            )
        },
        msg
          ? { quoted: msg }
          : undefined
      )

      return
    }

    ensureDiskHeadroom(
      declaredBytes ||
      MAX_APP_DOWNLOAD_BYTES
    )

    await sock.sendMessage(
      jid,
      {
        text:
          `✦ *NEXA • APP*\n\n` +
          `⬇ *Menyiapkan file original...*\n\n` +
          `📱 ${clean(detail.title, 120)}\n` +
          `🏷 ${clean(detail.version || 'Terbaru', 80)}\n` +
          `📦 ${clean(resolved.size || detail.size || '-', 60)}\n` +
          `🧩 ${clean(resolved.fileType || detail.fileType || 'APK', 30)}\n` +
          `${providerIcon(detail.provider)} ${clean(detail.providerLabel, 40)}\n` +
          `🎟 Biaya awal: ${feeText(job)}\n\n` +
          `Biaya final menyesuaikan ukuran file aktual.`
      },
      msg
        ? { quoted: msg }
        : undefined
    )

    downloaded =
      await downloadOriginalAppToTemp(
        resolved
      )

    if (
      downloaded.actualBytes >
      MAX_APP_DOWNLOAD_BYTES
    ) {
      throw new Error(
        'APP_FILE_TOO_LARGE'
      )
    }

    ensureDiskHeadroom(
      downloaded.actualBytes
    )

    const finalNormal =
      getDownloadLimitCost(
        downloaded.actualBytes,
        {
          premium: false
        }
      )

    const finalPremium =
      getDownloadLimitCost(
        downloaded.actualBytes,
        {
          premium: true
        }
      )

    const finalCost =
      job.access?.owner
        ? 0
        : job.access?.premium
          ? finalPremium
          : finalNormal

    const adjusted =
      adjustBilledJob(
        job,
        finalCost
      )

    if (!adjusted.success) {
      throw new Error(
        'APP_LIMIT_CHANGED'
      )
    }

    await sock.sendMessage(
      jid,
      {
        document: {
          url:
            downloaded.filePath
        },
        mimetype:
          mimeFor(downloaded),
        fileName:
          downloaded.filename,
        caption:
          `✦ *NEXA • APP*\n\n` +
          `📱 ${clean(detail.title, 120)}\n` +
          `🏷 ${clean(detail.version || 'Terbaru', 80)}\n` +
          `📦 ${formatBytes(downloaded.actualBytes)}\n` +
          `🧩 ${clean(downloaded.fileType, 20)}\n` +
          `${providerIcon(detail.provider)} Source: ${clean(detail.providerLabel, 40)}\n` +
          `🎟 Biaya: ${feeText(job)}\n\n` +
          `File original • bukan MOD.`
      },
      {
        quoted: msg,
        mediaUploadTimeoutMs:
          UPLOAD_TIMEOUT
      }
    )

    delivered = true
  } catch (error) {
    console.error(
      '[APP]',
      error
    )

    const refund =
      job &&
      !delivered
        ? refundBilledJob(
            job,
            'app_download_failed'
          )
        : {
            refunded: false
          }

    const code =
      String(
        error?.message ||
        error ||
        ''
      )

    let reason =
      'Terjadi error saat memproses aplikasi.'

    if (
      /APP_FILE_TOO_LARGE/i
        .test(code)
    ) {
      reason =
        'File lebih dari *1 GB*, jadi NEXA menolaknya demi keamanan server.'
    } else if (
      /SERVER_DISK_LOW/i
        .test(code)
    ) {
      const available =
        formatResourceBytes(
          error?.availableBytes
        )

      const needed =
        formatResourceBytes(
          error?.neededBytes
        )

      reason =
        `Storage server sedang kurang aman untuk job ini.\n` +
        `Tersedia: *${available}* • Dibutuhkan aman: *${needed}*.`
    } else if (
      /APP_LIMIT_CHANGED/i
        .test(code)
    ) {
      reason =
        'Ukuran aktual file masuk tier biaya lebih tinggi, tapi Limit kamu tidak cukup.'
    } else if (
      /HAIDARCF_NOT_INSTALLED/i
        .test(code)
    ) {
      reason =
        'Dependency *haidarcf* belum terpasang di server.'
    } else if (
      /UPTODOWN_DOWNLOAD_METADATA_MISSING|UPTODOWN_TURNSTILE_FAILED|UPTODOWN_DIRECT_NOT_FOUND|APKPURE_DIRECT_NOT_FOUND/i
        .test(code)
    ) {
      reason =
        'Provider sedang berubah atau tidak memberi direct download yang valid. Coba card/provider lain.'
    } else if (
      /APP_FILE_IS_HTML|APP_SIZE_MISMATCH/i
        .test(code)
    ) {
      reason =
        'Provider mengembalikan halaman/berkas yang tidak sesuai. NEXA membatalkan pengiriman.'
    } else if (
      /TIMEOUT|AbortError|fetch failed|ECONN|ENOTFOUND|APP_HTTP_|APP_CDN_HTTP_/i
        .test(code)
    ) {
      reason =
        'Koneksi ke provider/CDN sedang bermasalah.'
    }

    await sock.sendMessage(
      jid,
      {
        text:
          `⚠️ *NEXA • APP*\n\n` +
          `${reason}` +
          (
            refund.refunded
              ? `\n🎟 ${refund.cost} Limit dikembalikan.`
              : ''
          )
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
        '[APP] cleanup:',
        cleanupError
      )
    }

    try {
      job?.release?.()
    } catch {}

    downloadLocks.delete(
      lockKey
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
        `✦ *NEXA • APP*\n\n` +
        `⌕ Sedang mencari *${clean(query, 80)}*...\n` +
        `NEXA menyisir APKPure dan Uptodown.`
    },
    {
      quoted: msg
    }
  )

  const result =
    await searchOriginalApps(
      query,
      page
    )

  if (!result.items.length) {
    const healthy =
      result.providers.some(
        item => item.ok
      )

    const failed =
      result.providers
        .filter(item => !item.ok)
        .map(item => item.label)

    const extra =
      failed.length
        ? `\n⚠️ Gagal: ${failed.join(', ')}`
        : ''

    await sock.sendMessage(
      jid,
      {
        text:
          `✦ *NEXA • APP*\n\n` +
          (
            healthy
              ? `Tidak menemukan aplikasi untuk *${clean(query, 80)}*.`
              : 'Semua provider sedang gagal diakses.'
          ) +
          extra
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
    `✦ *NEXA • APP*\n\n` +
    `Cari aplikasi Android original dari APKPure + Uptodown.\n\n` +
    `*${prefix}app <nama aplikasi>*\n` +
    `Contoh: *${prefix}app whatsapp*\n\n` +
    `Search/detail gratis. Limit dipotong saat download:\n` +
    `• ≤100 MB: 3 Limit • Premium 2\n` +
    `• ≤300 MB: 5 Limit • Premium 3\n` +
    `• ≤600 MB: 8 Limit • Premium 4\n` +
    `• ≤1 GB: 15 Limit • Premium 8\n` +
    `• Owner: gratis\n\n` +
    `🛡 Maksimum file: 1 GB\n` +
    `🧩 APK dan XAPK dipertahankan sesuai tipe aslinya.`
  )
}

export default {
  name:
    'app',

  aliases: [
    'apps',
    'apkori',
    'originalapk'
  ],

  category:
    'DOWNLOADER',

  description:
    'Cari dan download APK/XAPK original dari APKPure dan Uptodown',

  usage:
    '.app <query>',

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

        await downloadItem({
          sock,
          msg,
          jid,
          session,
          index:
            Number(args[2])
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
          await downloadItem({
            sock,
            msg,
            jid,
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
        '[APP]',
        error
      )

      let text =
        'Terjadi error saat memproses aplikasi.'

      if (
        error?.message ===
        'SESSION_EXPIRED'
      ) {
        text =
          `Hasil ini sudah kedaluwarsa. Cari ulang dengan *${prefix}app <nama>*.`
      } else if (
        error?.message ===
        'NO_PREVIOUS_SEARCH'
      ) {
        text =
          `Belum ada pencarian aktif. Gunakan *${prefix}app <nama>*.`
      } else if (
        error?.message ===
        'SEARCH_ITEM_INVALID'
      ) {
        text =
          'Pilihan tidak ditemukan. Coba card lain.'
      } else if (
        /HAIDARCF_NOT_INSTALLED/i
          .test(
            error?.message || ''
          )
      ) {
        text =
          'Dependency *haidarcf* belum terpasang. Jalankan npm install di project.'
      }

      await sock.sendMessage(
        jid,
        {
          text:
            `⚠️ *NEXA • APP*\n\n` +
            text
        },
        {
          quoted: msg
        }
      )
    }
  }
}
