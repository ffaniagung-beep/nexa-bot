import {
  withdrawRpgMoney
} from '../lib/rpg/core.js'

import {
  getRpgJid,
  rpgNum
} from '../lib/rpg/ui.js'

import {
  rpgCommand,
  sendRpgQuickPanel
} from '../lib/rpg/uxV2.js'

export default {
  name: 'bankwd',
  aliases: [],
  category: 'RPG',
  description: 'Tarik Money dari RPG Bank',
  usage: '.bankwd <nominal/all>',

  async run({
    sock,
    msg,
    jid,
    args,
    config
  }) {
    const amount =
      args?.[0]

    if (!amount) {
      return sendRpgQuickPanel({
        sock,
        msg,
        jid,
        title:
          '🏦 RPG BANK • WITHDRAW',
        body:
          `Kirim nominal yang mau ditarik.\n\n` +
          `Contoh:\n` +
          `*${rpgCommand(config, 'bankwd', '2000')}*\n` +
          `*${rpgCommand(config, 'bankwd', 'all')}*`,
        actions: [
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

    const userJid =
      await getRpgJid({
        sock,
        msg,
        jid
      })

    const result =
      withdrawRpgMoney(
        userJid,
        amount
      )

    if (!result.success) {
      const body =
        result.reason ===
          'INSUFFICIENT_BANK'
          ? (
              `Saldo Bank kurang.\n` +
              `Tersedia: *${rpgNum(result.available)}*`
            )
          : result.reason ===
              'EMPTY'
            ? 'Bank kamu kosong.'
            : 'Nominal tidak valid.'

      return sendRpgQuickPanel({
        sock,
        msg,
        jid,
        title:
          '❌ WITHDRAW GAGAL',
        body,
        actions: [
          {
            text: '🏦 Bank',
            id: rpgCommand(config, 'bank')
          }
        ]
      })
    }

    return sendRpgQuickPanel({
      sock,
      msg,
      jid,
      title:
        '✅ WITHDRAW BERHASIL',
      body:
        `💸 Withdraw *${rpgNum(result.amount)}*\n` +
        `💼 Dompet *${rpgNum(result.profile.money)}*\n` +
        `🏦 Bank *${rpgNum(result.profile.bankMoney)}*`,
      actions: [
        {
          text: '🏦 Bank',
          id: rpgCommand(config, 'bank')
        },
        {
          text: '👤 Profile',
          id: rpgCommand(config, 'rpg')
        },
        {
          text: '⚔️ RPG Hub',
          id: rpgCommand(config, 'menu', 'rpg')
        }
      ]
    })
  }
}
