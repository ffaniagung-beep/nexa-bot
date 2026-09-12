import {
  createBratSticker
} from '../lib/brat.js'

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

const BRAT_COST = 2
const BRAT_PREMIUM_COST = 1

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
  name: 'brat',

  aliases: [
    'bratsticker'
  ],

  category: 'MAKER',

  description:
    'Membuat sticker teks bergaya BRAT',

  usage:
    '.brat <teks>',

  async run({
    sock,
    msg,
    jid,
    args,
    config
  }) {
    const text =
      args
        .join(' ')
        .trim()

    if (!text) {
      return sock.sendMessage(
        jid,
        {
          text:
            `🟢 *BRAT STICKER*\n\n` +
            `Gunakan:\n` +
            `*${config.prefix}brat <teks>*\n\n` +
            `🎟 Free: ${BRAT_COST} Limit • Premium: ${BRAT_PREMIUM_COST} • Owner: gratis.`
        },
        {
          quoted: msg
        }
      )
    }

    if (
      text.length >
      120
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            `⚠️ Teks BRAT maksimal *120 karakter*.`
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
          BRAT_COST,
        premiumCost:
          BRAT_PREMIUM_COST,
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
      result =
        await createBratSticker(
          text
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
        '🟢 Brat error:',
        err
      )

      const refund =
        !delivered
          ? refundBilledJob(
              job,
              'brat_failed'
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
            `⚠️ Gagal membuat BRAT sticker.\n` +
            (
              refund.refunded
                ? `🎟 ${refund.cost} Limit dikembalikan.\n`
                : ''
            ) +
            `Kalau error menyebut *drawtext*, FFmpeg server mungkin tidak punya filter teks.`
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
