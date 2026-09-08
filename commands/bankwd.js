import {
  withdrawRpgMoney
} from '../lib/rpg/core.js'

import {
  getRpgJid,
  rpgNum
} from '../lib/rpg/ui.js'

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
    args
  }) {
    const amount =
      args?.[0]

    if (!amount) {
      return sock.sendMessage(
        jid,
        {
          text:
            '🏦 Gunakan:\n' +
            '*.bankwd 2000*\n' +
            '*.bankwd all*'
        },
        {
          quoted: msg
        }
      )
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

    if (
      !result.success
    ) {
      const text =
        result.reason ===
          'INSUFFICIENT_BANK'
          ? (
              `❌ Saldo Bank kurang.\n` +
              `Tersedia: *${rpgNum(
                result.available
              )}*`
            )
          : result.reason ===
              'EMPTY'
            ? '😭 Bank kamu kosong.'
            : '❌ Nominal tidak valid.'

      return sock.sendMessage(
        jid,
        {
          text
        },
        {
          quoted: msg
        }
      )
    }

    return sock.sendMessage(
      jid,
      {
        text:
          `✅ *WITHDRAW BERHASIL*\n\n` +
          `💸 Withdraw: *${rpgNum(result.amount)}*\n` +
          `💼 Dompet: *${rpgNum(result.profile.money)}*\n` +
          `🏦 Bank: *${rpgNum(result.profile.bankMoney)}*`
      },
      {
        quoted: msg
      }
    )
  }
}
