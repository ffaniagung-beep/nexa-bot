import {
  startRound,
  gameStartError
} from '../lib/game.js'

import {
  getAnimeQuiz
} from '../lib/gameMedia.js'

export default {
  name:
    'tebakanime',

  aliases: [
    'animequiz',
    'ta'
  ],

  category:
    'GAME',

  description:
    'Tebak karakter anime dari gambar',

  usage:
    '.tebakanime',

  async run({
    sock,
    msg,
    jid
  }) {
    try {
      const data =
        await getAnimeQuiz()

      const questionText =
        `🌸 *TEBAK ANIME*\n\n` +
        `💡 Clue: *${data.clue}*\n\n` +
        `❓ Siapa karakter pada gambar?\n\n` +
        `⏱ Waktu: *60 detik*\n` +
        `💬 Reply gambar ini dengan jawabanmu\n` +
        `🏳️ Reply *nyerah* untuk menyerah\n` +
        `🏆 Jawaban tercepat masuk ranking`

      await startRound({
        sock,
        msg,
        jid,

        type:
          'tebakanime',

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
