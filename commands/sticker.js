import {
  getMediaSource,
  downloadMedia,
  imageToSticker,
  videoToSticker
} from '../lib/maker.js'

import {
  acquireMaker
} from '../lib/maker-runtime.js'

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

const STICKER_COST = 2
const STICKER_PREMIUM_COST = 1

async function react(
  sock,
  jid,
  msg,
  text
) {
  try {
    await sock.sendMessage(
      jid,
      {
        react: {
          text,
          key:
            msg.key
        }
      }
    )
  } catch {}
}

export default {
  name: 'sticker',

  aliases: [
    's',
    'stiker'
  ],

  category: 'MAKER',

  description:
    'Mengubah foto/video menjadi sticker',

  usage:
    '.sticker',

  async run({
    sock,
    msg,
    jid
  }) {
    const source =
      getMediaSource(
        msg
      )

    if (
      !source ||
      ![
        'image',
        'video'
      ].includes(
        source.type
      )
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            `🖼️ *STICKER MAKER*\n\n` +
            `Reply foto atau video dengan *.sticker*.\n` +
            `Video maksimal diproses sekitar *6 detik*.\n\n` +
            `🎟 Free: ${STICKER_COST} Limit • Premium: ${STICKER_PREMIUM_COST} • Owner: gratis.`
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
            '⏳ Dua proses maker sedang berjalan. Coba lagi setelah selesai.'
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
          STICKER_COST,
        premiumCost:
          STICKER_PREMIUM_COST,
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

    await react(
      sock,
      jid,
      msg,
      '⏳'
    )

    let result
    let delivered = false

    try {
      const buffer =
        await downloadMedia(
          source
        )

      result =
        source.type ===
        'image'
          ? await imageToSticker(
              buffer
            )
          : await videoToSticker(
              buffer
            )

      await sock.sendMessage(
        jid,
        {
          sticker:
            result.buffer
        },
        {
          quoted: msg
        }
      )

      delivered = true

      await react(
        sock,
        jid,
        msg,
        '✅'
      )
    } catch (err) {
      console.error(
        '🖼️ Sticker error:',
        err
      )

      const refund =
        !delivered
          ? refundBilledJob(
              job,
              'sticker_failed'
            )
          : {
              refunded: false
            }

      await react(
        sock,
        jid,
        msg,
        '❌'
      )

      await sock.sendMessage(
        jid,
        {
          text:
            `⚠️ Gagal membuat sticker.\n` +
            (
              refund.refunded
                ? `🎟 ${refund.cost} Limit dikembalikan.\n`
                : ''
            ) +
            `Pastikan medianya foto atau video yang valid.`
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
