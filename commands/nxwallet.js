// NEXA_INVESTMENT_FOUNDATION_V1
// NEXA_INVESTMENT_TRADING_V2
import {
  formatNexium,
  getInvestmentHoldings,
  getInvestmentMarket,
  getInvestmentPortfolioValue
} from '../lib/investment.js'

import {
  prepareInvestmentUser
} from '../lib/investmentUx.js'

export default {
  name:
    'nxwallet',

  aliases: [
    'nxsaldo'
  ],

  category:
    'INVESTMENT',

  description:
    'Lihat Nexium Coin dan portfolio',

  usage:
    '.nxwallet',

  async run({
    sock,
    msg,
    jid,
    isOwner
  }) {
    try {
      const {
        userJid,
        account
      } =
        await prepareInvestmentUser({
          sock,
          msg,
          jid,
          isOwner
        })

      const market =
        new Map(
          getInvestmentMarket()
            .map(
              asset => [
                asset.key,
                asset.price
              ]
            )
        )

      const holdings =
        getInvestmentHoldings(
          userJid
        )

      const portfolio =
        getInvestmentPortfolioValue(
          userJid
        )

      const assetLines =
        holdings
          .map(
            item => {
              const value =
                item.quantity *
                (
                  market.get(
                    item.key
                  ) || 0
                )

              const avg =
                item.averageBuyPrice > 0
                  ? ` • avg ${formatNexium(item.averageBuyPrice)} NX`
                  : ''

              return (
                `${item.icon} ${item.name}: *${formatNexium(item.quantity)}*` +
                ` • ${formatNexium(value)} NX${avg}`
              )
            }
          )
          .join(
            '\n'
          )

      const totalWealth =
        account.nexium +
        portfolio

      const text =
        '💠 *NEXA • NX WALLET*\n' +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        `Nexium Coin: *${formatNexium(account.nexium)} NX*\n` +
        `Portfolio: *${formatNexium(portfolio)} NX*\n` +
        `Total aset: *${formatNexium(totalWealth)} NX*\n\n` +
        '*ASET*\n' +
        assetLines

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
        '[NXWALLET]',
        error?.message ||
        error
      )

      return sock.sendMessage(
        jid,
        {
          text:
            '⚠️ NX Wallet belum bisa dibuka.'
        },
        {
          quoted:
            msg
        }
      )
    }
  }
}
