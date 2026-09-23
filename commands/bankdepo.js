import {
  depositRpgMoney
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
  name: 'bankdepo',
  aliases: [],
  category: 'RPG',
  description: 'Deposit Money ke RPG Bank',
  usage: '.bankdepo <nominal/all>',

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
          '🏦 RPG BANK • DEPOSIT',
        body:
          `Kirim nominal yang mau disimpan.\n\n` +
          `Contoh:\n` +
          `*${rpgCommand(config, 'bankdepo', '5000')}*\n` +
          `*${rpgCommand(config, 'bankdepo', 'all')}*`,
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
      depositRpgMoney(
        userJid,
        amount
      )

    if (!result.success) {
      const body =
        result.reason ===
          'INSUFFICIENT_WALLET'
          ? (
              `Money di dompet kurang.\n` +
              `Tersedia: *${rpgNum(result.available)}*`
            )
          : result.reason ===
              'EMPTY'
            ? 'Dompet kamu kosong.'
            : 'Nominal tidak valid.'

      return sendRpgQuickPanel({
        sock,
        msg,
        jid,
        title:
          '❌ DEPOSIT GAGAL',
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
        '✅ DEPOSIT BERHASIL',
      body:
        `💵 Deposit *${rpgNum(result.amount)}*\n` +
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
