// NEXA_PREMIUM_HDPLUS_V2
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
  enhancePhotoPlus
} from '../lib/hd.js'

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

const HDPLUS_COST = 4

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
    'HD+ Premium anime-style, lebih tajam dan lebih besar',

  usage:
    '.hd+',

  async run({
    sock,
    msg,
    jid,
    config
  }) {
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
            `💎 Reply foto dengan *${config?.prefix || '.'}hd+*.\n\n` +
            '✨ HD+ Premium\n' +
            '• Anime4K-style enhance\n' +
            '• Sharpen lebih kuat\n' +
            '• Upscale adaptif hingga 4x\n' +
            '• Dikirim langsung sebagai gambar\n\n' +
            `🎟 Premium: ${HDPLUS_COST} Limit • Owner: gratis 👑`
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
        normalCost: HDPLUS_COST,
        premiumCost: HDPLUS_COST,
        globalLimit: 1,
        perOwnerLimit: 1,
        ttlMs:
          7 * 60 * 1000
      })

    if (!job.ok) {
      localRelease()

      if (job.reason === 'LIMIT') {
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

    let result
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
          'hdplus/enhance',
          () =>
            enhancePhotoPlus(
              buffer
            )
        )

      await stage(
        'hdplus/send',
        () =>
          sock.sendMessage(
            jid,
            {
              image:
                result.buffer,

              mimetype:
                'image/jpeg',

              caption:
                '💎 *NEXA • HD+ PREMIUM*\n\n' +
                '✅ Enhance selesai.\n' +
                '🎨 Mode: *Anime4K-style local enhance*\n' +
                '🔍 Upscale adaptif hingga *4x*\n' +
                '📨 Dikirim langsung sebagai gambar\n' +
                '⚠️ Catatan: WhatsApp bisa tetap mengompres sedikit.\n' +
                `🎟 Biaya: ${
                  job.cost
                    ? `${job.cost} Limit`
                    : 'Gratis • Owner 👑'
                }`
            },
            {
              quoted: msg,
              mediaUploadTimeoutMs:
                60000
            }
          )
      )

      delivered = true

      react(
        sock,
        jid,
        msg,
        '✅'
      )
    } catch (err) {
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
      try {
        await result?.cleanup?.()
      } catch {}

      job.release()
      localRelease()
    }
  }
}
