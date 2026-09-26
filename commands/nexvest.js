// NEXA_INVESTMENT_FOUNDATION_V1
// NEXA_INVESTMENT_TRADING_V2
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
        '*TRADING*\n' +
        '• *.nxmarket* — lihat harga aset\n' +
        '• *.nxbuy <aset> <jumlah>* — beli aset\n' +
        '• *.nxsell <aset> <jumlah>* — jual aset\n' +
        '• *.nxwallet* — saldo & kepemilikan\n\n' +
        'Contoh: *.nxbuy iron 2*\n' +
        'Gunakan *all* untuk jumlah maksimum.\n\n' +
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
            'Investment belum bisa dibuka. Coba lagi setelah bot direstart.'
        },
        {
          quoted:
            msg
        }
      )
    }
  }
}
