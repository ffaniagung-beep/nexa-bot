import {
  startRound,
  gameStartError
} from '../lib/game.js'

import {
  getPictureQuiz
} from '../lib/gameMedia.js'

export default {
  name:
    'tebakgambar',

  aliases: [
    'tg'
  ],

  category:
    'GAME',

  description:
    'Tebak benda/hewan dari gambar',

  usage:
    '.tebakgambar',

  async run({
    sock,
    msg,
    jid
  }) {
    try {
      const data =
        await getPictureQuiz()

      const questionText =
        `🖼️ *TEBAK GAMBAR*\n\n` +
        `💡 Clue: *${data.clue}*\n` +
        `❓ Apa yang ada pada gambar?\n\n` +
        `⏱ Waktu: *60 detik*\n` +
        `💬 Reply gambar ini dengan jawabanmu\n` +
        `🏳️ Reply *nyerah* untuk menyerah\n` +
        `🏆 Jawaban tercepat masuk ranking`

      await startRound({
        sock,
        msg,
        jid,

        type:
          'tebakgambar',

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
