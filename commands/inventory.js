import {
  resolveProfileJid
} from '../lib/profile.js'

import {
  sendRpgInventoryPanel
} from '../lib/rpg/panels.js'

export default {
  name: 'inventory',
  aliases: ['inv'],
  category: 'RPG',
  description: 'Membuka inventory RPG interaktif',
  usage: '.inventory',

  async run({
    sock,
    msg,
    jid
  }) {
    const userJid =
      await resolveProfileJid(
        sock,
        msg,
        jid
      )

    return sendRpgInventoryPanel({
      sock,
      msg,
      jid,
      userJid
    })
  }
}
