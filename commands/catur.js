import fs from 'fs'
import path from 'path'

import {
  sendHtmlApp
} from '@rexxhayanasi/elaina-baileys'

const GAME_FILE =
  path.resolve('./arcade/chess.html')

export default {
  name: 'catur',

  aliases: [
    'chess'
  ],

  category: 'MINI GAME',

  description:
    'Main catur melawan NEXA AI',

  usage:
    '.catur',

  async run({
    sock,
    msg,
    jid
  }) {
    if (!fs.existsSync(GAME_FILE)) {
      return sock.sendMessage(
        jid,
        {
          text:
            '❌ File NEXA Chess tidak ditemukan.'
        },
        {
          quoted: msg
        }
      )
    }

    const html =
      fs.readFileSync(
        GAME_FILE,
        'utf8'
      )

    try {
      await sendHtmlApp(
        sock,
        jid,
        html,
        {
          title:
            '⚡ NEXA ARCADE',

          label:
            '♟️ NEXA CHESS • Android Only',

          trustedSources: [
            'nexa.local'
          ],

          height: 610
        }
      )
    } catch (err) {
      console.error(
        '♟️ NEXA Chess:',
        err
      )

      await sock.sendMessage(
        jid,
        {
          text:
            `❌ *NEXA CHESS ERROR*\n\n` +
            `${err?.message || err}`
        },
        {
          quoted: msg
        }
      )
    }
  }
}
