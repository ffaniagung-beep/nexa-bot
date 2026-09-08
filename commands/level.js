import {
  ensureUser,
  getRequiredExp
} from '../lib/userdb.js'

import {
  getProfileJid
} from '../lib/profile.js'

export default {
  name: 'level',

  aliases: [
    'lvl',
    'exp'
  ],

  category: 'PROFILE',

  description:
    'Melihat level dan EXP',

  usage:
    '.level',

  async run({
    sock,
    msg,
    jid
  }) {
    const userJid =
      getProfileJid(
        msg,
        jid
      )

    const user =
      ensureUser(
        userJid
      )

    const need =
      getRequiredExp(
        user.level
      )

    const percent =
      Math.min(
        100,
        Math.floor(
          (
            user.exp /
            need
          ) * 100
        )
      )

    const filled =
      Math.floor(
        percent / 10
      )

    const bar =
      '■'.repeat(filled) +
      '□'.repeat(
        10 - filled
      )

    const text =
      `🧬 *LEVEL NEXA*\n\n` +
      `Level : *${user.level}*\n` +
      `EXP   : *${user.exp}/${need}*\n` +
      `${bar} ${percent}%`

    await sock.sendMessage(
      jid,
      {
        text
      },
      {
        quoted: msg
      }
    )
  }
}
