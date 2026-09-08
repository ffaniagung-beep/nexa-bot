import {
  startRound,
  gameStartError,
  randomItem,
  shuffleWord,
  susunKata
} from '../lib/game.js'

export default {
  name:
    'susunkata',

  aliases: [
    'sk'
  ],

  category:
    'GAME',

  description:
    'Game multiplayer susun kata',

  usage:
    '.susunkata',

  async run({
    sock,
    msg,
    jid
  }) {
    const data =
      randomItem(
        susunKata
      )

    const answer =
      data.word

    const clue =
      data.clue

    const shuffled =
      shuffleWord(
        answer
      )
        .toUpperCase()
        .split('')
        .join('-')

    const questionText =
      `🔤 *SUSUN KATA*\n\n` +
      `🔀 Huruf:\n` +
      `*${shuffled}*\n\n` +
      `💡 Clue: *${clue}*\n\n` +
      `⏱ Waktu: *60 detik*\n` +
      `💬 Reply pesan ini dengan kata yang benar\n` +
      `🏳️ Reply *nyerah* untuk menyerah\n` +
      `🏆 Jawaban benar tercepat masuk ranking`

    try {
      await startRound({
        sock,
        msg,
        jid,

        type:
          'susunkata',

        answer,

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
