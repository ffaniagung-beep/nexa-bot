// NEXA PREMIUM HD+ AI V3
import {
  Button
} from '@rexxhayanasi/elaina-baileys'

import {
  readFile
} from 'node:fs/promises'

import {
  randomBytes
} from 'node:crypto'

import {
  acquireMaker,
  react,
  stage,
  failureText
} from '../lib/maker-runtime.js'

import {
  getMediaSource,
  downloadMedia
} from '../lib/maker-media.js'

import {
  enhancePhotoPlusAI
} from '../lib/hdplus-ai.js'

import {
  beginBilledJob,
  refundBilledJob
} from '../lib/jobBilling.js'

import {
  resourceBusyText
} from '../lib/resourceGate.js'

import {
  sendLimitEmpty
} from '../lib/limitGate.js'

import {
  getProfileJid
} from '../lib/profile.js'

const HDPLUS_COST = 4

const HDPLUS_SESSION_TTL =
  5 * 60 * 1000

const hdplusSessions =
  new Map()

const hdplusByOwner =
  new Map()

function cleanKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function ownerKey(
  msg,
  jid
) {
  return cleanKey(
    getProfileJid(
      msg,
      jid
    ) ||
    msg?.key?.participantAlt ||
    msg?.key?.participant ||
    jid
  )
}

function prettyBytes(value) {
  const bytes =
    Number(value) || 0

  if (
    bytes >=
    1024 * 1024
  ) {
    return (
      `${(
        bytes /
        1024 /
        1024
      ).toFixed(2)} MB`
    )
  }

  return (
    `${Math.max(
      1,
      Math.round(
        bytes / 1024
      )
    )} KB`
  )
}

function outputSizeText(
  result
) {
  if (
    result?.width &&
    result?.height
  ) {
    return (
      `${result.width}×${result.height}`
    )
  }

  return '-'
}

function parseOptions(args) {
  const clean =
    (args || [])
      .map(value =>
        String(value || '')
          .trim()
          .toLowerCase()
      )

  return {
    scale:
      clean.includes('x4') ||
      clean.includes('4x')
        ? 4
        : 2,
    mode:
      clean.includes('photo') ||
      clean.includes('foto')
        ? 'photo'
        : 'anime'
  }
}

function actionId(
  prefix,
  token,
  action
) {
  return (
    `${prefix}hd+ ` +
    `__deliver ` +
    `${token} ` +
    `${action}`
  )
}

async function destroySession(
  token
) {
  const key =
    String(token || '')

  const session =
    hdplusSessions.get(
      key
    )

  if (!session) {
    return false
  }

  hdplusSessions.delete(
    key
  )

  if (
    hdplusByOwner.get(
      session.owner
    ) === key
  ) {
    hdplusByOwner.delete(
      session.owner
    )
  }

  clearTimeout(
    session.timer
  )

  try {
    await session.cleanup?.()
  } catch {}

  return true
}

function createSession({
  owner,
  jid,
  result,
  prefix
}) {
  const old =
    hdplusByOwner.get(
      owner
    )

  if (old) {
    void destroySession(
      old
    )
  }

  let token

  do {
    token =
      randomBytes(8)
        .toString('hex')
  } while (
    hdplusSessions.has(
      token
    )
  )

  const session = {
    token,
    owner,
    jid:
      cleanKey(jid),
    path:
      result.path,
    cleanup:
      result.cleanup,
    width:
      result.width,
    height:
      result.height,
    fileSize:
      result.fileSize,
    scale:
      result.scale,
    mode:
      result.mode,
    model:
      result.model,
    prefix,
    sending: false,
    createdAt:
      Date.now(),
    timer: null
  }

  session.timer =
    setTimeout(
      () => {
        void destroySession(
          token
        )
      },
      HDPLUS_SESSION_TTL
    )

  session.timer.unref?.()

  hdplusSessions.set(
    token,
    session
  )

  hdplusByOwner.set(
    owner,
    token
  )

  return session
}

function getSession({
  token,
  owner,
  jid
}) {
  const session =
    hdplusSessions.get(
      String(token || '')
    )

  if (!session) {
    return null
  }

  if (
    session.owner !==
      cleanKey(owner) ||
    session.jid !==
      cleanKey(jid)
  ) {
    return null
  }

  if (
    Date.now() -
      session.createdAt >
    HDPLUS_SESSION_TTL
  ) {
    void destroySession(
      session.token
    )

    return null
  }

  return session
}

async function sendChoicePanel({
  sock,
  jid,
  msg,
  session
}) {
  const modeLabel =
    session.mode === 'photo'
      ? 'Photo / General'
      : 'Anime / Plus'

  const body =
    '✅ AI upscale selesai.\n\n' +
    `🎨 Model: *${modeLabel}*\n` +
    `🔍 Scale: *${session.scale}x*\n` +
    `📐 Output: *${outputSizeText(session)}*\n` +
    `📦 PNG: *${prettyBytes(session.fileSize)}*\n\n` +
    'Pilih cara pengiriman:\n' +
    '• *Kirim Langsung* → tampil sebagai foto di chat; sumber tetap PNG, tapi WhatsApp bisa memprosesnya.\n' +
    '• *Via Dokumen* → PNG original lewat jalur dokumen.'

  try {
    let panel =
      new Button(sock)
        .setTitle(
          'NEXA • AI HD+ PREMIUM'
        )
        .setBody(body)
        .setFooter(
          'Pilihan berlaku 5 menit • AI tidak diproses ulang'
        )

    panel =
      panel.addReply(
        '🖼️ Kirim Langsung',
        actionId(
          session.prefix,
          session.token,
          'direct'
        )
      )

    panel =
      panel.addReply(
        '📁 Via Dokumen',
        actionId(
          session.prefix,
          session.token,
          'document'
        )
      )

    panel =
      panel.addReply(
        '✖️ Batal',
        actionId(
          session.prefix,
          session.token,
          'cancel'
        )
      )

    await panel.send(
      jid
    )

    return
  } catch (error) {
    console.warn(
      '[HD+] Elaina button fallback:',
      error?.message ||
      error
    )
  }

  await sock.sendMessage(
    jid,
    {
      text:
        `💎 *NEXA • AI HD+ PREMIUM*\n\n` +
        `${body}\n\n` +
        `Jika tombol tidak tampil, kirim salah satu:\n` +
        `• ${actionId(session.prefix, session.token, 'direct')}\n` +
        `• ${actionId(session.prefix, session.token, 'document')}\n` +
        `• ${actionId(session.prefix, session.token, 'cancel')}`
    },
    {
      quoted: msg
    }
  )
}

async function deliverChoice({
  sock,
  msg,
  jid,
  args
}) {
  const owner =
    ownerKey(
      msg,
      jid
    )

  const token =
    String(
      args?.[1] || ''
    )
      .trim()

  const action =
    String(
      args?.[2] || ''
    )
      .trim()
      .toLowerCase()

  const session =
    getSession({
      token,
      owner,
      jid
    })

  if (!session) {
    await sock.sendMessage(
      jid,
      {
        text:
          '⌛ Pilihan HD+ sudah kedaluwarsa atau bukan milikmu. Jalankan *.hd+* lagi.'
      },
      {
        quoted: msg
      }
    )

    return
  }

  if (action === 'cancel') {
    await destroySession(
      session.token
    )

    react(
      sock,
      jid,
      msg,
      '🗑️'
    )

    await sock.sendMessage(
      jid,
      {
        text:
          '🗑️ Hasil HD+ dibatalkan dan file sementara sudah dihapus.'
      },
      {
        quoted: msg
      }
    )

    return
  }

  if (
    ![
      'direct',
      'document'
    ].includes(action)
  ) {
    await sock.sendMessage(
      jid,
      {
        text:
          '⚠️ Pilihan HD+ tidak dikenali.'
      },
      {
        quoted: msg
      }
    )

    return
  }

  if (session.sending) {
    await sock.sendMessage(
      jid,
      {
        text:
          '⏳ Hasil HD+ ini sedang dikirim.'
      },
      {
        quoted: msg
      }
    )

    return
  }

  session.sending = true

  try {
    const buffer =
      await readFile(
        session.path
      )

    if (!buffer.length) {
      throw new Error(
        'HDPLUS_TEMP_EMPTY'
      )
    }

    if (action === 'document') {
      await sock.sendMessage(
        jid,
        {
          document:
            buffer,
          mimetype:
            'image/png',
          fileName:
            'NEXA-HD+.png',
          caption:
            '💎 *NEXA • AI HD+ PREMIUM*\n\n' +
            '📁 Mode: *Dokumen*\n' +
            '🎨 Format: *PNG Original*\n' +
            `📐 Resolusi: *${outputSizeText(session)}*\n` +
            `🔍 AI Upscale: *${session.scale}x*`
        },
        {
          quoted: msg,
          mediaUploadTimeoutMs:
            120000
        }
      )
    } else {
      await sock.sendMessage(
        jid,
        {
          image:
            buffer,
          mimetype:
            'image/png',
          caption:
            '💎 *NEXA • AI HD+ PREMIUM*\n\n' +
            '🖼️ Mode: *Kirim Langsung*\n' +
            '🎨 Sumber hasil: *PNG*\n' +
            `📐 Resolusi AI: *${outputSizeText(session)}*\n` +
            `🔍 AI Upscale: *${session.scale}x*\n\n` +
            '⚠️ WhatsApp dapat tetap memproses gambar saat dikirim sebagai foto.'
        },
        {
          quoted: msg,
          mediaUploadTimeoutMs:
            120000
        }
      )
    }

    react(
      sock,
      jid,
      msg,
      '✅'
    )

    await destroySession(
      session.token
    )
  } catch (error) {
    session.sending = false

    console.error(
      '[HD+] delivery:',
      error?.message ||
      error
    )

    await sock.sendMessage(
      jid,
      {
        text:
          '⚠️ Gagal mengirim hasil HD+. Pilihan masih aktif selama belum kedaluwarsa, jadi coba tekan lagi.'
      },
      {
        quoted: msg
      }
    )
  }
}

export default {
  name: 'hd+',

  aliases: [
    'hdplus',
    'enhance+',
    'upscale+'
  ],

  category: 'PREMIUM',

  premiumOnly: true,

  description:
    'AI upscale premium ke PNG dengan pilihan kirim langsung atau dokumen',

  usage:
    '.hd+ [anime/photo] [x2/x4]',

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
        args?.[0] || ''
      )
        .trim()
        .toLowerCase()

    if (first === '__deliver') {
      await deliverChoice({
        sock,
        msg,
        jid,
        args
      })

      return
    }

    const source =
      getMediaSource(
        msg,
        sock
      )

    if (source?.type !== 'image') {
      return sock.sendMessage(
        jid,
        {
          text:
            `💎 Reply foto dengan *${prefix}hd+*.` +
            `\n\n✨ *AI HD+ Premium*` +
            `\n• Real-ESRGAN via fal.ai` +
            `\n• Output AI: PNG` +
            `\n• Default: Anime • 2x` +
            `\n• Opsi: *${prefix}hd+ photo* atau *${prefix}hd+ x4*` +
            `\n• Setelah selesai pilih: langsung / dokumen` +
            `\n\n🎟 Premium: ${HDPLUS_COST} Limit • Owner: gratis 👑`
        },
        {
          quoted: msg
        }
      )
    }

    const localRelease =
      acquireMaker()

    if (!localRelease) {
      return sock.sendMessage(
        jid,
        {
          text:
            '⏳ HD+ sedang penuh. Coba lagi setelah proses sebelumnya selesai.'
        },
        {
          quoted: msg
        }
      )
    }

    const job =
      beginBilledJob({
        msg,
        jid,
        kind: 'maker',
        normalCost:
          HDPLUS_COST,
        premiumCost:
          HDPLUS_COST,
        globalLimit: 1,
        perOwnerLimit: 1,
        ttlMs:
          7 * 60 * 1000
      })

    if (!job.ok) {
      localRelease()

      if (
        job.reason ===
        'LIMIT'
      ) {
        return sendLimitEmpty({
          sock,
          msg,
          jid
        })
      }

      return sock.sendMessage(
        jid,
        {
          text:
            resourceBusyText(
              job.busy,
              'proses HD+'
            )
        },
        {
          quoted: msg
        }
      )
    }

    const options =
      parseOptions(args)

    let result
    let session
    let delivered = false

    react(
      sock,
      jid,
      msg,
      '💎'
    )

    try {
      const buffer =
        await stage(
          'hdplus/download',
          () =>
            downloadMedia(
              source,
              sock
            )
        )

      result =
        await stage(
          'hdplus/zyvor-ai',
          () =>
            enhancePhotoPlusAI(
              buffer,
              options
            )
        )

      session =
        createSession({
          owner:
            cleanKey(
              job.access
                ?.userJid ||
              ownerKey(
                msg,
                jid
              )
            ),
          jid,
          result,
          prefix
        })

      await stage(
        'hdplus/choice',
        () =>
          sendChoicePanel({
            sock,
            jid,
            msg,
            session
          })
      )

      delivered = true

      react(
        sock,
        jid,
        msg,
        '✅'
      )
    } catch (err) {
      if (session) {
        await destroySession(
          session.token
        )
      } else {
        try {
          await result
            ?.cleanup?.()
        } catch {}
      }

      const refund =
        !delivered
          ? refundBilledJob(
              job,
              'hdplus_failed'
            )
          : {
              refunded: false
            }

      react(
        sock,
        jid,
        msg,
        '❌'
      )

      await sock.sendMessage(
        jid,
        {
          text:
            `⚠️ HD+ gagal (${err.makerStage || 'hdplus'}).\n` +
            `${failureText(err)}` +
            (
              refund.refunded
                ? `\n🎟 ${refund.cost} Limit dikembalikan.`
                : ''
            )
        },
        {
          quoted: msg
        }
      )
    } finally {
      job.release()
      localRelease()
    }
  }
}
