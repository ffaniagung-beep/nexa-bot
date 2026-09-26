// NEXA_INVESTMENT_TRADING_V2
import {
  buyInvestmentAsset,
  formatNexium
} from '../lib/investment.js'

import {
  prepareInvestmentUser
} from '../lib/investmentUx.js'

function errorText(
  error,
  prefix
) {
  const code =
    String(
      error?.message || ''
    )

  if (code === 'NX_ASSET_NOT_FOUND') {
    return (
      'Aset tidak ditemukan.\n' +
      'Pilihan: *iron, gold, diamond, nexium crystal, rhodium*.'
    )
  }

  if (
    code === 'NX_INVALID_QUANTITY' ||
    code === 'NX_NOTHING_AVAILABLE'
  ) {
    return (
      `Jumlah tidak valid.\n` +
      `Contoh: *${prefix}nxbuy iron 2* atau *${prefix}nxbuy iron all*.`
    )
  }

  if (code === 'NX_INSUFFICIENT_NEXIUM') {
    return 'Nexium Coin kamu tidak cukup untuk pembelian ini.'
  }

  if (code === 'NX_AMOUNT_TOO_LARGE') {
    return 'Jumlah transaksi terlalu besar.'
  }

  return 'Pembelian belum berhasil diproses.'
}

export default {
  name:
    'nxbuy',

  aliases: [
    'nxbeli'
  ],

  category:
    'INVESTMENT',

  description:
    'Beli aset dengan Nexium Coin',

  usage:
    '.nxbuy <aset> <jumlah>',

  async run({
    sock,
    msg,
    jid,
    args,
    config,
    isOwner
  }) {
    const prefix =
      config?.prefix ||
      '.'

    try {
      const prepared =
        await prepareInvestmentUser({
          sock,
          msg,
          jid,
          isOwner
        })

      if (
        !Array.isArray(args) ||
        args.length < 2
      ) {
        throw new Error(
          'NX_INVALID_QUANTITY'
        )
      }

      const quantity =
        args[args.length - 1]

      const asset =
        args
          .slice(
            0,
            -1
          )
          .join(
            ' '
          )

      const result =
        buyInvestmentAsset(
          prepared.userJid,
          asset,
          quantity,
          {
            isOwner
          }
        )

      const text =
        '🛒 *NEXA • BUY*\n' +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        `${result.asset.icon} Aset: *${result.asset.name}*\n` +
        `📦 Jumlah: *${formatNexium(result.quantity)}*\n` +
        `🏷 Harga: *${formatNexium(result.unitPrice)} NX / unit*\n` +
        `💸 Total: *${formatNexium(result.total)} NX*\n\n` +
        `💠 Saldo: *${formatNexium(result.balance)} NX*\n` +
        `📊 Dimiliki: *${formatNexium(result.holding)}*`

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
      return sock.sendMessage(
        jid,
        {
          text:
            '⚠️ *NEXA • BUY*\n\n' +
            errorText(
              error,
              prefix
            )
        },
        {
          quoted:
            msg
        }
      )
    }
  }
}
