// NEXA_INVESTMENT_FOUNDATION_V1
import {
  formatNexium,
  getInvestmentMarket
} from '../lib/investment.js'

import {
  prepareInvestmentUser
} from '../lib/investmentUx.js'

function trendIcon(
  current,
  previous
) {
  if (current > previous) {
    return '▲'
  }

  if (current < previous) {
    return '▼'
  }

  return '•'
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

      const market =
        getInvestmentMarket()

      const lines =
        market
          .map(
            asset =>
              `${asset.icon} *${asset.name}*\n` +
              `   ${formatNexium(asset.price)} NX  ${trendIcon(asset.price, asset.previousPrice)}`
          )
          .join(
            '\n\n'
          )

      const text =
        '📈 *NEXA • MARKET*\n' +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        lines +
        '\n\n' +
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
