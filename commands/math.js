import {
  startRound,
  gameStartError
} from '../lib/game.js'

function randomNumber(
  min,
  max
) {
  return (
    Math.floor(
      Math.random() *
      (
        max -
        min +
        1
      )
    ) +
    min
  )
}

export default {
  name:
    'math',

  aliases: [
    'matematika'
  ],

  category:
    'GAME',

  description:
    'Game multiplayer matematika',

  usage:
    '.math',

  async run({
    sock,
    msg,
    jid
  }) {
    const a =
      randomNumber(
        2,
        25
      )

    const b =
      randomNumber(
        2,
        25
      )

    const operations = [
      '+',
      '-',
      '×'
    ]

    const operation =
      operations[
        Math.floor(
          Math.random() *
          operations.length
        )
      ]

    let answer

    if (
      operation === '+'
    ) {
      answer =
        a + b
    } else if (
      operation === '-'
    ) {
      answer =
        a - b
    } else {
      answer =
        a * b
    }

    const questionText =
      `🧮 *NEXA MATH*\n\n` +
      `💭 Berapa hasil:\n` +
      `*${a} ${operation} ${b} = ?*\n\n` +
      `⏱ Waktu: *45 detik*\n` +
      `💬 Reply pesan ini dengan hasilnya\n` +
      `🏳️ Reply *nyerah* untuk menyerah\n` +
      `🏆 Jawaban benar tercepat masuk ranking`

    try {
      await startRound({
        sock,
        msg,
        jid,

        type:
          'math',

        answer:
          String(answer),

        questionText,

        duration: 45
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
