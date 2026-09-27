// NEXA_INVESTMENT_GROUP_NEWS_V41
import {
  formatInvestmentGroupNews,
  getInvestmentGroupNewsState,
  getLatestInvestmentGroupNews
} from '../lib/investmentGroupNews.js'

import {
  prepareInvestmentUser
} from '../lib/investmentUx.js'

function formatEta(targetAt) {
  const seconds = Math.max(
    0,
    Math.ceil(
      (
        Number(targetAt) -
        Date.now()
      ) /
      1000
    )
  )

  if (seconds < 60) return `${seconds}s`

  const minutes = Math.floor(seconds / 60)

  if (minutes < 60) return `${minutes}m`

  const hours = Math.floor(minutes / 60)
  return `${hours}j ${minutes % 60}m`
}

function formatAge(createdAt) {
  const seconds = Math.max(
    0,
    Math.floor(
      (
        Date.now() -
        Number(createdAt)
      ) /
      1000
    )
  )

  if (seconds < 60) return 'baru saja'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} menit lalu`

  return `${Math.floor(minutes / 60)} jam lalu`
}

export default {
  name: 'nxnews',

  aliases: [
    'nxberita',
    'nxevent'
  ],

  category: 'INVESTMENT',

  description:
    'Lihat event Investment terakhir di grup ini',

  usage:
    '.nxnews',

  groupOnly:
    true,

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

      const state =
        getInvestmentGroupNewsState(jid)

      const news =
        getLatestInvestmentGroupNews(jid)

      if (!news) {
        const eta =
          state?.nextEventAt
            ? formatEta(state.nextEventAt)
            : 'acak'

        return sock.sendMessage(
          jid,
          {
            text:
              '📰 *NEXA • LOCAL MARKET NEWS*\n' +
              '━━━━━━━━━━━━━━━━━━\n\n' +
              'Belum ada event otomatis di grup ini.\n\n' +
              `⏳ Perkiraan event pertama: *${eta}*\n` +
              '🎲 Jadwal setiap grup berbeda dan berubah secara acak.\n\n' +
              '🌐 Harga tetap memakai satu Nexa Market global.'
          },
          {
            quoted: msg
          }
        )
      }

      const next =
        state?.nextEventAt
          ? formatEta(state.nextEventAt)
          : 'acak'

      return sock.sendMessage(
        jid,
        {
          text:
            `${formatInvestmentGroupNews(news)}\n\n` +
            `🕒 Terjadi: *${formatAge(news.createdAt)}*\n` +
            `🎲 Event grup berikutnya: *~${next}*`
        },
        {
          quoted: msg
        }
      )
    } catch (error) {
      console.error(
        '[NXNEWS]',
        error?.message || error
      )

      return sock.sendMessage(
        jid,
        {
          text:
            '⚠️ *NEXA • LOCAL MARKET NEWS*\n\n' +
            'Berita grup belum berhasil dibuka.'
        },
        {
          quoted: msg
        }
      )
    }
  }
}
