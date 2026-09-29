import {
  startRound,
  gameStartError,
  randomItem,
  shuffleWord,
  susunKata,
  validateSusunKataBank
} from '../lib/game.js'

const RECENT_QUESTION_LIMIT = 5
const recentQuestionsByChat = new Map()

validateSusunKataBank()

function pickQuestion(jid) {
  const recent =
    recentQuestionsByChat.get(jid) || []

  const available =
    susunKata.filter(
      item =>
        !recent.includes(
          item.word
        )
    )

  const selected =
    randomItem(
      available.length
        ? available
        : susunKata
    )

  recentQuestionsByChat.set(
    jid,
    [
      ...recent,
      selected.word
    ].slice(
      -RECENT_QUESTION_LIMIT
    )
  )

  return selected
}

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
      pickQuestion(jid)

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
