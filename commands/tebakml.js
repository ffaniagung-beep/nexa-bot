import {
  startRound,
  gameStartError
} from '../lib/game.js'

import {
  getMLQuiz
} from '../lib/gameMedia.js'

export default {
  name:
    'tebakml',

  aliases: [
    'tebakhero',
    'mlquiz'
  ],

  category:
    'GAME',

  description:
    'Tebak hero Mobile Legends',

  usage:
    '.tebakml',

  async run({
    sock,
    msg,
    jid
  }) {
    try {
      const data =
        getMLQuiz()

      const questionText =
        `⚔️ *TEBAK HERO ML*\n\n` +
        `🎭 Role: *${data.role}*\n` +
        `❓ Siapa hero pada gambar?\n\n` +
        `⏱ Waktu: *60 detik*\n` +
        `💬 Reply gambar ini dengan nama hero\n` +
        `🏳️ Reply *nyerah* untuk menyerah\n` +
        `🏆 Jawaban tercepat masuk ranking`

      await startRound({
        sock,
        msg,
        jid,

        type:
          'tebakml',

        answer:
          data.answer,

        image:
          data.image,

        questionText,

        duration:
          60
      })
    } catch (err) {
      await sock.sendMessage(
        jid,
        {
          text:
            gameStartError(
              err
            )
        },
        {
          quoted:
            msg
        }
      )
    }
  }
}
