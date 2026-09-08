import {
  getRpgProfile
} from '../lib/rpg/core.js'

import {
  getRpgJid,
  rpgNum
} from '../lib/rpg/ui.js'

export default {
  name: 'bank',
  aliases: [],
  category: 'RPG',
  description: 'Melihat saldo RPG Bank',
  usage: '.bank',

  async run({
    sock,
    msg,
    jid
  }) {
    const userJid =
      await getRpgJid({
        sock,
        msg,
        jid
      })

    const p =
      getRpgProfile(
        userJid
      )

    return sock.sendMessage(
      jid,
      {
        text:
          `╭━━〔 🏦 *NEXA RPG BANK* 〕━━╮\n` +
          `│\n` +
          `│ 💵 Dompet : *${rpgNum(p.money)}*\n` +
          `│ 🏦 Bank   : *${rpgNum(p.bankMoney)}*\n` +
          `│\n` +
          `│ 🔐 Money di Bank aman\n` +
          `│ dari sistem pencurian RPG.\n` +
          `│\n` +
          `╰━━━━━━━━━━━━━━━━╯\n\n` +
          `💵 *.bankdepo <nominal/all>*\n` +
          `💸 *.bankwd <nominal/all>*`
      },
      {
        quoted: msg
      }
    )
  }
}
