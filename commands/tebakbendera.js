import {
  startRound,
  gameStartError
} from '../lib/game.js'

const API_URL =
  'https://api.alwayscodex.eu.cc/api/games/tebakbendera'

// =====================================
// ALWAYS CODEX
// =====================================

async function getFlagQuiz() {
  const response =
    await fetch(
      API_URL,
      {
        method:
          'GET',

        headers: {
          accept:
            'application/json'
        },

        signal:
          AbortSignal.timeout(
            12000
          )
      }
    )

  if (!response.ok) {
    throw new Error(
      `FLAG_API_HTTP_${response.status}`
    )
  }

  const data =
    await response.json()

  const result =
    data?.result

  const name =
    String(
      result?.name || ''
    ).trim()

  const image =
    String(
      result?.img || ''
    ).trim()

  const code =
    String(
      result?.code || ''
    ).trim()

  if (
    data?.status !== true ||
    !name ||
    !image
  ) {
    throw new Error(
      'FLAG_API_INVALID_RESPONSE'
    )
  }

  return {
    name,
    image,
    code
  }
}

// =====================================
// COMMAND
// =====================================

export default {
  name:
    'tebakbendera',

  aliases: [
    'bendera',
    'tbendera'
  ],

  category:
    'GAME',

  description:
    'Tebak negara dari gambar bendera',

  usage:
    '.tebakbendera',

  async run({
    sock,
    msg,
    jid
  }) {
    try {
      const data =
        await getFlagQuiz()

      const questionText =
        `🌍 *NEXA • TEBAK BENDERA*\n\n` +
        `❓ Bendera negara apakah ini?\n\n` +
        `⏱ Waktu: *60 detik*\n` +
        `💬 Reply *gambar ini* dengan nama negaranya\n` +
        `🏳️ Reply *nyerah* untuk menyerah\n` +
        `🏆 Jawaban benar tercepat masuk ranking\n\n` +
        `🎁 *Reward Ranking*\n` +
        `🥇 +20 EXP • +3 Coin\n` +
        `🥈 +15 EXP • +2 Coin\n` +
        `🥉 +10 EXP • +1 Coin\n` +
        `🪙 Coin game maksimal 30/hari per user\n\n` +
        `⚡ Jawab tanpa prefix`

      await startRound({
        sock,
        msg,
        jid,

        type:
          'tebakbendera',

        answer:
          data.name,

        image:
          data.image,

        questionText,

        duration:
          60
      })
    } catch (err) {
      console.error(
        '🌍 Tebak Bendera:',
        err
      )

      let text

      if (
        String(
          err?.message || ''
        ).startsWith(
          'FLAG_API_'
        )
      ) {
        text =
          `❌ *TEBAK BENDERA ERROR*\n\n` +
          `Soal bendera gagal diambil dari server.\n` +
          `Coba lagi beberapa saat nanti 😭`
      } else {
        text =
          gameStartError(
            err
          )
      }

      await sock.sendMessage(
        jid,
        {
          text
        },
        {
          quoted:
            msg
        }
      )
    }
  }
}
