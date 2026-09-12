import {
  acquireMaker,
  react,
  stage,
  failureText
} from '../lib/maker-runtime.js'

import {
  getMediaSource,
  downloadMedia,
  stickerToImage
} from '../lib/maker-media.js'

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

const TOIMG_COST = 2
const TOIMG_PREMIUM_COST = 1

export default {
  name: 'toimg',
  aliases: [
    'toimage',
    'sticker2img'
  ],
  category: 'MAKER',
  description:
    'Ubah stiker menjadi gambar (frame pertama untuk animasi)',
  usage: '.toimg',

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
      'sticker'
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            `🖼️ Reply stiker dengan ${config?.prefix || '.'}toimg.\n` +
            `🎟 Free: ${TOIMG_COST} Limit • Premium: ${TOIMG_PREMIUM_COST} • Owner: gratis.`
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
          TOIMG_COST,
        premiumCost:
          TOIMG_PREMIUM_COST,
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
      '⏳'
    )

    try {
      const buffer =
        await stage(
          'toimg/download',
          () =>
            downloadMedia(
              source,
              sock
            )
        )

      result =
        await stage(
          'toimg/convert',
          () =>
            stickerToImage(
              buffer
            )
        )

      await stage(
        'toimg/send',
        () =>
          sock.sendMessage(
            jid,
            {
              image:
                result.buffer,
              mimetype:
                'image/png',
              caption:
                (
                  result.animated
                    ? '🖼️ Frame pertama stiker animasi'
                    : '🖼️ Converted by NEXA'
                ) +
                `\n🎟 Biaya: ${job.cost ? `${job.cost} Limit` : 'Gratis • Owner 👑'}`
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
              'toimg_failed'
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
            `⚠️ ToImg gagal (${err.makerStage || 'toimg'}).\n` +
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
