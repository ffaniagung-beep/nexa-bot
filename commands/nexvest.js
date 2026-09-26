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
    'nexvest',

  aliases: [
    'investment',
    'investasi'
  ],

  category:
    'INVESTMENT',

  description:
    'Pusat investasi virtual Nexa',

  usage:
    '.nexvest',

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

      const portfolio =
        getInvestmentPortfolioValue(
          userJid
        )

      const holdings =
        getInvestmentHoldings(
          userJid
        )

      const owned =
        holdings.filter(
          item =>
            item.quantity > 0
        ).length

      const text =
        '✦ *NEXA • INVESTMENT*\n' +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        `💠 Nexium Coin: *${formatNexium(account.nexium)} NX*\n` +
        `📊 Nilai Portfolio: *${formatNexium(portfolio)} NX*\n` +
        `📦 Aset dimiliki: *${owned}/5*\n\n` +
        'Perintah awal:\n' +
        '• *.nxmarket* — lihat harga aset\n' +
        '• *.nxwallet* — lihat saldo & kepemilikan\n\n' +
        '⛓️ Iron  •  🪙 Gold  •  💎 Diamond\n' +
        '🔷 Nexium Crystal  •  ⚪ Rhodium'

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
        '[INVESTMENT]',
        error?.message ||
        error
      )

      return sock.sendMessage(
        jid,
        {
          text:
            '⚠️ *NEXA • INVESTMENT*\n\n' +
            'Fondasi investasi belum bisa dibuka. Coba lagi setelah bot direstart.'
        },
        {
          quoted:
            msg
        }
      )
    }
  }
}
