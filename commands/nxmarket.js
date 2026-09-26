// NEXA_INVESTMENT_FOUNDATION_V1
// NEXA_INVESTMENT_TRADING_V2
import {
  formatNexium,
  getInvestmentMarket,
  refreshInvestmentMarketIfDue
} from '../lib/investment.js'

import {
  prepareInvestmentUser
} from '../lib/investmentUx.js'

function trend(
  current,
  previous
) {
  if (!previous) {
    return {
      icon: '•',
      text: '0.00%'
    }
  }

  const percent =
    (
      (
        current -
        previous
      ) /
      previous
    ) * 100

  if (percent > 0) {
    return {
      icon: '▲',
      text:
        `+${percent.toFixed(2)}%`
    }
  }

  if (percent < 0) {
    return {
      icon: '▼',
      text:
        `${percent.toFixed(2)}%`
    }
  }

  return {
    icon: '•',
    text: '0.00%'
  }
}

function untilText(
  timestamp
) {
  const seconds =
    Math.max(
      0,
      Math.ceil(
        (
          timestamp -
          Date.now()
        ) /
        1000
      )
    )

  const minutes =
    Math.floor(
      seconds /
      60
    )

  const remain =
    seconds % 60

  return `${minutes}m ${remain}s`
}

export default {
  name:
    'nxmarket',

  aliases: [
    'nxharga'
  ],

  category:
    'INVESTMENT',

  description:
    'Lihat harga pasar Nexa Investment',

  usage:
    '.nxmarket',

  async run({
    sock,
    msg,
    jid,
    isOwner
  }) {
    try {
      const {
        account
      } =
        await prepareInvestmentUser({
          sock,
          msg,
          jid,
          isOwner
        })

      const clock =
        refreshInvestmentMarketIfDue()

      const market =
        getInvestmentMarket({
          refresh: false
        })

      const lines =
        market
          .map(
            asset => {
              const move =
                trend(
                  asset.price,
                  asset.previousPrice
                )

              return (
                `${asset.icon} *${asset.name}*\n` +
                `   ${formatNexium(asset.price)} NX  ${move.icon} ${move.text}`
              )
            }
          )
          .join(
            '\n\n'
          )

      const text =
        '📈 *NEXA • MARKET*\n' +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        lines +
        '\n\n' +
        `⏱ Update berikutnya: *${untilText(clock.nextUpdateAt)}*\n` +
        `💠 Saldo: *${formatNexium(account.nexium)} NX*`

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
        '[NXMARKET]',
        error?.message ||
        error
      )

      return sock.sendMessage(
        jid,
        {
          text:
            '⚠️ Market Nexa belum bisa dibuka.'
        },
        {
          quoted:
            msg
        }
      )
    }
  }
}
