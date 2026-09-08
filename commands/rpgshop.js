import {
  resolveProfileJid
} from '../lib/profile.js'

import {
  sendRpgShopPanel
} from '../lib/rpg/panels.js'

export default {
  name: 'rpgshop',
  aliases: ['rstore'],
  category: 'RPG',
  description: 'Membuka RPG Store interaktif',
  usage: '.rpgshop',

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

    return sendRpgShopPanel({
      sock,
      msg,
      jid,
      userJid
    })
  }
}
