import {
  depositRpgMoney
} from '../lib/rpg/core.js'

import {
  getRpgJid,
  rpgNum
} from '../lib/rpg/ui.js'

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
            '*.bankdepo 5000*\n' +
            '*.bankdepo all*'
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
      depositRpgMoney(
        userJid,
        amount
      )

    if (
      !result.success
    ) {
      const text =
        result.reason ===
          'INSUFFICIENT_WALLET'
          ? (
              `❌ Money di dompet kurang.\n` +
              `Tersedia: *${rpgNum(
                result.available
              )}*`
            )
          : result.reason ===
              'EMPTY'
            ? '😭 Dompet kamu kosong.'
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
          `✅ *DEPOSIT BERHASIL*\n\n` +
          `💵 Deposit: *${rpgNum(result.amount)}*\n` +
          `💼 Dompet: *${rpgNum(result.profile.money)}*\n` +
          `🏦 Bank: *${rpgNum(result.profile.bankMoney)}*`
      },
      {
        quoted: msg
      }
    )
  }
}
