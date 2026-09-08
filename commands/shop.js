import {
  openShop
} from '../lib/shop.js'

import {
  getProfileJid
} from '../lib/profile.js'

export default {
  name:
    'shop',

  aliases: [
    'store',
    'toko'
  ],

  category:
    'GAME',

  description:
    'Membuka NEXA Shop',

  usage:
    '.shop',

  async run({
    sock,
    msg,
    jid,
    isOwner
  }) {
    const userJid =
      getProfileJid(
        msg,
        jid
      )

    try {
      await openShop({
        sock,
        msg,
        jid,
        userJid,
        isOwner
      })
    } catch (err) {
      console.error(
        '🛒 SHOP:',
        err
      )

      await sock.sendMessage(
        jid,
        {
          text:
            '⚠️ Gagal membuka NEXA Shop.'
        },
        {
          quoted: msg
        }
      )
    }
  }
}
