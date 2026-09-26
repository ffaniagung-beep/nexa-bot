// NEXA_INVESTMENT_TRADING_V2
import {
  formatNexium,
  sellInvestmentAsset
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

  if (code === 'NX_INVALID_QUANTITY') {
    return (
      `Jumlah tidak valid.\n` +
      `Contoh: *${prefix}nxsell iron 2* atau *${prefix}nxsell iron all*.`
    )
  }

  if (
    code === 'NX_NOTHING_TO_SELL' ||
    code === 'NX_NOTHING_AVAILABLE'
  ) {
    return 'Kamu belum punya aset itu untuk dijual.'
  }

  if (code === 'NX_NOT_ENOUGH_ASSET') {
    return 'Jumlah aset yang kamu punya tidak cukup.'
  }

  if (code === 'NX_AMOUNT_TOO_LARGE') {
    return 'Jumlah transaksi terlalu besar.'
  }

  return 'Penjualan belum berhasil diproses.'
}

export default {
  name:
    'nxsell',

  aliases: [
    'nxjual'
  ],

  category:
    'INVESTMENT',

  description:
    'Jual aset menjadi Nexium Coin',

  usage:
    '.nxsell <aset> <jumlah>',

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
        sellInvestmentAsset(
          prepared.userJid,
          asset,
          quantity,
          {
            isOwner
          }
        )

      const text =
        '💰 *NEXA • SELL*\n' +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        `${result.asset.icon} Aset: *${result.asset.name}*\n` +
        `📦 Jumlah: *${formatNexium(result.quantity)}*\n` +
        `🏷 Harga: *${formatNexium(result.unitPrice)} NX / unit*\n` +
        `💵 Diterima: *${formatNexium(result.total)} NX*\n\n` +
        `💠 Saldo: *${formatNexium(result.balance)} NX*\n` +
        `📊 Tersisa: *${formatNexium(result.holding)}*`

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
            '⚠️ *NEXA • SELL*\n\n' +
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
