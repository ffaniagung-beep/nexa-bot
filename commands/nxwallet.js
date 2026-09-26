// NEXA_INVESTMENT_FOUNDATION_V1
import {
  formatNexium,
  getInvestmentHoldings,
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
            item =>
              `${item.icon} ${item.name}: *${formatNexium(item.quantity)}*`
          )
          .join(
            '\n'
          )

      const text =
        '💠 *NEXA • NX WALLET*\n' +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        `Nexium Coin: *${formatNexium(account.nexium)} NX*\n` +
        `Portfolio: *${formatNexium(portfolio)} NX*\n\n` +
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
