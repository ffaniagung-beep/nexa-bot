import {
  payCrimeFine
} from '../lib/rpg/crime.js'

import {
  resolveProfileJid
} from '../lib/profile.js'

import {
  rpgCommand,
  sendRpgQuickPanel
} from '../lib/rpg/uxV2.js'

function num(
  value
) {
  return Number(
    value || 0
  ).toLocaleString(
    'id-ID'
  )
}

export default {
  name:
    'payfine',

  aliases: [
    'bayardenda'
  ],

  category:
    'RPG',

  description:
    'Membayar denda dan menghapus Wanted',

  usage:
    '.payfine',

  async run({
    sock,
    msg,
    jid,
    config
  }) {
    const userJid =
      await resolveProfileJid(
        sock,
        msg,
        jid
      )

    const r =
      payCrimeFine(
        userJid
      )

    if (
      r.reason ===
      'NO_WANTED'
    ) {
      return sendRpgQuickPanel({
        sock,
        msg,
        jid,
        title:
          '😇 NAMA SUDAH BERSIH',
        body:
          'Wanted kamu sudah *0/5*. Belum perlu bayar apa-apa.',
        actions: [
          {
            text: '🚨 Wanted',
            id: rpgCommand(config, 'wanted')
          },
          {
            text: '⚔️ RPG Hub',
            id: rpgCommand(config, 'menu', 'rpg')
          }
        ]
      })
    }

    if (
      r.reason ===
      'MONEY_LOW'
    ) {
      return sendRpgQuickPanel({
        sock,
        msg,
        jid,
        title:
          '💸 MONEY KURANG',
        body:
          `Denda *${num(r.fine)}*\n` +
          `Wallet *${num(r.money)}*\n` +
          `Kurang *${num(r.missing)}*\n\n` +
          `🏦 Uang Bank tidak ditarik otomatis.`,
        actions: [
          {
            text: '🏦 Bank',
            id: rpgCommand(config, 'bank')
          },
          {
            text: '🚨 Wanted',
            id: rpgCommand(config, 'wanted')
          }
        ]
      })
    }

    if (!r.success) {
      return sock.sendMessage(
        jid,
        {
          text:
            '❌ Denda gagal dibayar.'
        },
        {
          quoted:
            msg
        }
      )
    }

    return sendRpgQuickPanel({
      sock,
      msg,
      jid,
      title:
        '✅ DENDA DIBAYAR',
      body:
        `🚨 Wanted *${r.oldWanted}/5 → 0/5*\n` +
        `💵 Dibayar *${num(r.paid)} Money*\n` +
        `💼 Sisa *${num(r.money)}*\n\n` +
        `Nama lu bersih lagi 😇`,
      actions: [
        {
          text: '🚨 Wanted',
          id: rpgCommand(config, 'wanted')
        },
        {
          text: '🏦 Bank',
          id: rpgCommand(config, 'bank')
        },
        {
          text: '⚔️ RPG Hub',
          id: rpgCommand(config, 'menu', 'rpg')
        }
      ]
    })
  }
}
