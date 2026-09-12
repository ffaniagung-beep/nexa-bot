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
  enhancePhoto
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

const HD_COST = 6
const HD_PREMIUM_COST = 3

export default {
  name: 'hd',
  aliases: [
    'enhance',
    'upscale'
  ],
  category: 'MAKER',
  description:
    'Perjelas foto, upscale hingga 2x (maks. sisi 4096 px)',
  usage: '.hd',

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

    if (
      source?.type !==
      'image'
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            `✨ Reply foto dengan ${(config?.prefix || '.')}hd.\n` +
            `Upscale hingga 2x, maksimal sisi 4096 px.\n` +
            `🎟 Free: ${HD_COST} Limit • Premium: ${HD_PREMIUM_COST} • Owner: gratis.`
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
            '⏳ Dua proses gambar sedang berjalan. Coba lagi setelah selesai.'
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
          HD_COST,
        premiumCost:
          HD_PREMIUM_COST,
        globalLimit: 2,
        perOwnerLimit: 1,
        ttlMs:
          5 * 60 * 1000
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
              'proses maker'
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
      '✨'
    )

    try {
      const buffer =
        await stage(
          'hd/download',
          () =>
            downloadMedia(
              source,
              sock
            )
        )

      result =
        await stage(
          'hd/convert',
          () =>
            enhancePhoto(
              buffer
            )
        )

      await stage(
        'hd/send',
        () =>
          sock.sendMessage(
            jid,
            {
              document:
                result.buffer,
              mimetype:
                'image/jpeg',
              fileName:
                `NEXA-HD-${Date.now()}.jpg`,
              caption:
                `✨ HD selesai\n` +
                `Denoise + sharpen, upscale hingga 2x (maks. sisi 4096 px).\n` +
                `🎟 Biaya: ${job.cost ? `${job.cost} Limit` : 'Gratis • Owner 👑'}`
            },
            {
              quoted: msg,
              mediaUploadTimeoutMs:
                30000
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
              'hd_failed'
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
            `⚠️ HD gagal (${err.makerStage || 'hd'}).\n` +
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
        await result
          ?.cleanup?.()
      } catch {}

      job.release()
      localRelease()
    }
  }
}
