// NEXA_INVESTMENT_SOCIAL_V3
import {
  formatNexium,
  transferNexium
} from '../lib/investment.js'

import {
  prepareInvestmentUser
} from '../lib/investmentUx.js'

function getContextInfo(msg) {
  const m =
    msg?.message ||
    {}

  return (
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo ||
    m.documentMessage?.contextInfo ||
    {}
  )
}

function resolveTargetJid(msg) {
  const context =
    getContextInfo(
      msg
    )

  const mentioned =
    Array.isArray(
      context?.mentionedJid
    )
      ? context.mentionedJid
      : []

  return (
    mentioned[0] ||
    context?.participantAlt ||
    context?.participant ||
    null
  )
}

function errorText(
  error,
  prefix
) {
  const code =
    String(
      error?.message ||
      ''
    )

  if (
    code ===
    'NX_TARGET_NOT_REGISTERED'
  ) {
    return (
      'Target belum terdaftar di Nexa.\n' +
      `Minta dia melakukan *${prefix}register nama.umur* dulu.`
    )
  }

  if (
    code ===
    'NX_CANNOT_GIVE_SELF'
  ) {
    return 'Nggak bisa transfer Nexium ke diri sendiri 😭🗿'
  }

  if (
    code ===
    'NX_INSUFFICIENT_NEXIUM'
  ) {
    return 'Nexium Coin kamu tidak cukup.'
  }

  if (
    code ===
    'NX_INVALID_QUANTITY' ||
    code ===
    'NX_NOTHING_AVAILABLE'
  ) {
    return (
      'Jumlah/target transfer tidak valid.\n' +
      `Contoh: *${prefix}nxgive @user 100*\n` +
      `Atau reply pesan user: *${prefix}nxgive 100*\n` +
      'Bisa juga pakai *all*.'
    )
  }

  if (
    code ===
    'NX_AMOUNT_TOO_LARGE'
  ) {
    return 'Saldo penerima terlalu besar untuk menerima jumlah itu.'
  }

  return 'Transfer Nexium belum berhasil diproses.'
}

export default {
  name:
    'nxgive',

  aliases: [
    'nxtransfer',
    'nxkirim'
  ],

  category:
    'INVESTMENT',

  description:
    'Kirim Nexium Coin ke player lain',

  usage:
    '.nxgive <tag/reply> <jumlah>',

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

      const targetJid =
        resolveTargetJid(
          msg
        )

      if (!targetJid) {
        throw new Error(
          'NX_INVALID_QUANTITY'
        )
      }

      const amount =
        Array.isArray(args) &&
        args.length
          ? args[
              args.length - 1
            ]
          : ''

      const result =
        transferNexium(
          prepared.userJid,
          targetJid,
          amount
        )

      const targetNumber =
        String(
          targetJid
        )
          .split('@')[0]
          .replace(
            /\D/g,
            ''
          )

      const targetLabel =
        targetNumber
          ? `@${targetNumber}`
          : (
              result.targetName ||
              'Player'
            )

      const activation =
        result.targetCreated
          ? (
              '\n🎁 Akun Investment penerima baru aktif ' +
              'dan mendapat starter *500 NX*.'
            )
          : ''

      const text =
        '💸 *NEXA • NX GIVE*\n' +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        `👤 Ke: *${targetLabel}*\n` +
        `💠 Dikirim: *${formatNexium(result.amount)} NX*\n\n` +
        `💳 Saldo kamu: *${formatNexium(result.senderBalance)} NX*\n` +
        `📥 Saldo penerima: *${formatNexium(result.targetBalance)} NX*` +
        activation

      return sock.sendMessage(
        jid,
        {
          text,
          mentions:
            targetNumber
              ? [targetJid]
              : []
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
            '⚠️ *NEXA • NX GIVE*\n\n' +
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
