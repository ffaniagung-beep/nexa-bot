// NEXA_INVESTMENT_NEWS_V4
import {
  getLatestMarketNews,
  refreshInvestmentMarketIfDue
} from '../lib/investment.js'

import {
  prepareInvestmentUser
} from '../lib/investmentUx.js'

function effectText(news) {
  const percent =
    (
      Math.abs(
        Number(
          news?.effectRate
        ) || 0
      ) * 100
    ).toFixed(2)

  const arrow =
    news?.direction > 0
      ? '▲'
      : '▼'

  const mood =
    news?.direction > 0
      ? 'Bullish'
      : 'Bearish'

  return (
    `${arrow} *${mood}* • ` +
    `${news?.direction > 0 ? '+' : '-'}${percent}% modifier/tick`
  )
}

function statusText(news) {
  if (news?.active) {
    const minutes =
      Math.max(
        1,
        Number(
          news.ticksRemaining
        ) || 1
      ) * 5

    return (
      `🟢 Aktif • ${news.ticksRemaining} tick tersisa ` +
      `(~${minutes} menit)`
    )
  }

  return '⚪ Selesai • efek sudah tidak aktif'
}

export default {
  name:
    'nxnews',

  aliases: [
    'nxberita',
    'nxevent'
  ],

  category:
    'INVESTMENT',

  description:
    'Lihat berita dan event Nexa Market',

  usage:
    '.nxnews',

  async run({
    sock,
    msg,
    jid,
    isOwner
  }) {
    try {
      await prepareInvestmentUser({
        sock,
        msg,
        jid,
        isOwner
      })

      const clock =
        refreshInvestmentMarketIfDue()

      const news =
        getLatestMarketNews({
          refresh:
            false
        })

      if (!news) {
        return sock.sendMessage(
          jid,
          {
            text:
              '📰 *NEXA • MARKET NEWS*\n' +
              '━━━━━━━━━━━━━━━━━━\n\n' +
              'Market masih tenang. Belum ada event tercatat.\n\n' +
              'Event pertama akan muncul pada tick market berikutnya.\n' +
              '🎮 Berita ini sepenuhnya fiktif di dalam Nexa.'
          },
          {
            quoted:
              msg
          }
        )
      }

      const target =
        news.assetKey
          ? `${news.assetIcon} ${news.assetName}`
          : '🌐 Semua aset'

      const nextSeconds =
        Math.max(
          0,
          Math.ceil(
            (
              clock.nextUpdateAt -
              Date.now()
            ) /
            1000
          )
        )

      const text =
        '📰 *NEXA • MARKET NEWS*\n' +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        `*${news.title}*\n` +
        `${news.body}\n\n` +
        `🎯 Target: *${target}*\n` +
        `📊 Sentimen: ${effectText(news)}\n` +
        `⏳ Status: ${statusText(news)}\n` +
        `🕒 Tick berikutnya: *${Math.floor(nextSeconds / 60)}m ${nextSeconds % 60}s*\n\n` +
        '🎮 *Catatan:* berita dan market ini sepenuhnya fiktif dalam Nexa.'

      return sock.sendMessage(
        jid,
        {
          text
        },
        {
          quoted:
            msg
        }
      )
    } catch (error) {
      console.error(
        '[NXNEWS]',
        error?.message ||
        error
      )

      return sock.sendMessage(
        jid,
        {
          text:
            '⚠️ *NEXA • MARKET NEWS*\n\n' +
            'Berita market belum berhasil dibuka.'
        },
        {
          quoted:
            msg
        }
      )
    }
  }
}
