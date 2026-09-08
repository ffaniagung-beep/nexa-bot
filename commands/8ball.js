import {
  stableInt,
  jakartaDayKey
} from '../lib/fun.js'

import {
  getProfileJid
} from '../lib/profile.js'

const ANSWERS = [
  {
    text: '🟢 Hampir pasti iya.',
    min: 88,
    max: 99
  },
  {
    text: '🟢 Tanda-tandanya bagus banget.',
    min: 79,
    max: 94
  },
  {
    text: '🟢 Kayaknya iya deh 😭',
    min: 70,
    max: 88
  },
  {
    text: '🟢 Peluangnya lumayan besar.',
    min: 65,
    max: 84
  },
  {
    text: '🟡 Bisa jadi.',
    min: 48,
    max: 67
  },
  {
    text: '🟡 Ini beneran 50:50 🗿',
    min: 46,
    max: 54
  },
  {
    text: '🟡 Masih terlalu abu-abu.',
    min: 40,
    max: 59
  },
  {
    text: '🟡 NEXA mencium plot twist.',
    min: 38,
    max: 61
  },
  {
    text: '🔴 Kemungkinannya kecil.',
    min: 15,
    max: 34
  },
  {
    text: '🔴 Kayaknya enggak 😭',
    min: 8,
    max: 27
  },
  {
    text: '🔴 Jangan pasang harapan tinggi dulu.',
    min: 5,
    max: 23
  },
  {
    text: '💀 Bola NEXA bilang: jangan.',
    min: 1,
    max: 14
  }
]

export default {
  name:
    '8ball',

  aliases: [
    'ball',
    'ask'
  ],

  category:
    'FUN',

  description:
    'Tanya sesuatu ke 8Ball NEXA',

  usage:
    '.8ball <pertanyaan>',

  async run({
    sock,
    msg,
    jid,
    args,
    config
  }) {
    const question =
      args
        .join(' ')
        .trim()

    if (!question) {
      return sock.sendMessage(
        jid,
        {
          text:
            `🎱 *NEXA 8BALL*\n\n` +
            `Tulis pertanyaannya juga 😭\n\n` +
            `Contoh:\n` +
            `*${config.prefix}8ball besok bakal hoki gak?*`
        },
        {
          quoted: msg
        }
      )
    }

    if (
      question.length >
      500
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            '😭 Pertanyaannya kepanjangan buat bola NEXA.'
        },
        {
          quoted: msg
        }
      )
    }

    const userJid =
      getProfileJid(
        msg,
        jid
      )

    const seed =
      [
        jakartaDayKey(),
        userJid,
        question
          .toLowerCase()
          .replace(/\s+/g, ' ')
      ].join('|')

    const answer =
      ANSWERS[
        stableInt(
          seed,
          0,
          ANSWERS.length - 1
        )
      ]

    const confidence =
      stableInt(
        `${seed}|confidence`,
        answer.min,
        answer.max
      )

    await sock.sendMessage(
      jid,
      {
        text:
          `╭──「 🎱 *NEXA 8BALL* 」\n` +
          `│\n` +
          `│ ❓ ${question}\n` +
          `│\n` +
          `│ ${answer.text}\n` +
          `│ 🎯 Confidence: *${confidence}%*\n` +
          `│\n` +
          `╰──────────────`
      },
      {
        quoted: msg
      }
    )
  }
}
