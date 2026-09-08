import fs from 'fs'
import path from 'path'

import {
  sendHtmlApp
} from '@rexxhayanasi/elaina-baileys'

const GAME_FILE =
  path.resolve(
    './arcade/snake.html'
  )

export default {
  name: 'snake',

  aliases: [
    'snack',
    'ular'
  ],

  category: 'MINI GAME',

  description:
    'Main Snake langsung di WhatsApp Android',

  usage:
    '.snake',

  async run({
    sock,
    msg,
    jid
  }) {
    if (
      !fs.existsSync(
        GAME_FILE
      )
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            '❌ File Snake tidak ditemukan.'
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
            '🐍 NEXA SNAKE • Android Only',

          trustedSources: [
            'nexa.local'
          ],

          height:
            500
        }
      )
    } catch (err) {
      console.error(
        '🐍 Snake HTML:',
        err
      )

      await sock.sendMessage(
        jid,
        {
          text:
            `❌ *NEXA SNAKE ERROR*\n\n` +
            `${err?.message || err}`
        },
        {
          quoted: msg
        }
      )
    }
  }
}
