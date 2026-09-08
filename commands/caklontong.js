import {
  startRound,
  gameStartError,
  randomItem,
  cakLontong
} from '../lib/game.js'

export default {
  name:
    'caklontong',

  aliases: [
    'lontong'
  ],

  category:
    'GAME',

  description:
    'Game multiplayer Cak Lontong',

  usage:
    '.caklontong',

  async run({
    sock,
    msg,
    jid
  }) {
    const data =
      randomItem(
        cakLontong
      )

    const questionText =
      `🍜 *CAK LONTONG*\n\n` +
      `💭 ${data.question}\n\n` +
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
          'caklontong',

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
