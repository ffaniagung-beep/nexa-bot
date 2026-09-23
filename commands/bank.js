import {
  getRpgProfile
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
  name: 'bank',
  aliases: [],
  category: 'RPG',
  description: 'Melihat saldo RPG Bank',
  usage: '.bank',

  async run({
    sock,
    msg,
    jid,
    config
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

    const body =
      `💵 Dompet *${rpgNum(p.money)}*\n` +
      `🏦 Bank *${rpgNum(p.bankMoney)}*\n\n` +
      `🔐 Money di Bank aman dari sistem pencurian RPG.\n\n` +
      `Deposit: *${rpgCommand(config, 'bankdepo', '<nominal/all>')}*\n` +
      `Withdraw: *${rpgCommand(config, 'bankwd', '<nominal/all>')}*`

    return sendRpgQuickPanel({
      sock,
      msg,
      jid,
      title:
        '🏦 NEXA • RPG BANK',
      body,
      actions: [
        {
          text: '💵 Deposit',
          id: rpgCommand(config, 'bankdepo')
        },
        {
          text: '💸 Withdraw',
          id: rpgCommand(config, 'bankwd')
        },
        {
          text: '👤 Profile',
          id: rpgCommand(config, 'rpg')
        },
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
}
