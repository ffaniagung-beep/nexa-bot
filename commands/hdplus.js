// NEXA_PREMIUM_HDPLUS_V1
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
    'HD Premium hingga 4x, maks. sisi 6144 px',

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
            '✨ Premium HD+\n' +
            '• Denoise lebih halus\n' +
            '• Sharpen lebih kuat\n' +
            '• Upscale hingga 4x\n' +
            '• Maksimal sisi 6144 px\n\n' +
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
            '⏳ Proses gambar sedang penuh. Coba lagi setelah job sebelumnya selesai.'
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
              document:
                result.buffer,

              mimetype:
                'image/jpeg',

              fileName:
                `NEXA-HDPLUS-${Date.now()}.jpg`,

              caption:
                '💎 *NEXA • HD+ PREMIUM*\n\n' +
                '✅ Enhance selesai.\n' +
                '✨ Denoise + sharpen premium\n' +
                '🔍 Upscale hingga 4x (maks. sisi 6144 px)\n' +
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
