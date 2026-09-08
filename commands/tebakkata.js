import {
  startRound,
  gameStartError,
  randomItem,
  tebakKata
} from '../lib/game.js'

export default {
  name:
    'tebakkata',

  aliases: ['tk'],

  category:
    'GAME',

  description:
    'Game multiplayer tebak kata',

  usage:
    '.tebakkata',

  async run({
    sock,
    msg,
    jid
  }) {
    const data =
      randomItem(
        tebakKata
      )

    const questionText =
      `🧩 *TEBAK KATA*\n\n` +
      `💭 ${data.clue}\n\n` +
      `⏱ Waktu: *60 detik*\n` +
      `💬 Reply pesan ini dengan jawabanmu\n` +
      `🏳️ Reply *nyerah* untuk menyerah\n` +
      `🏆 Jawaban benar tercepat masuk ranking`

    try {
      await startRound({
        sock,
        msg,
        jid,

        type:
          'tebakkata',

        answer:
          data.answer,

        questionText,

        duration: 60
      })
    } catch (err) {
      await sock.sendMessage(
        jid,
        {
          text:
            gameStartError(err)
        },
        {
          quoted: msg
        }
      )
    }
  }
}
