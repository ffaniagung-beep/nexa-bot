import config from '../config.js'

import {
  addExp,
  addCoin,
  getRequiredExp
} from './userdb.js'

import {
  getProfileJid
} from './profile.js'

import {
  canUseLimit,
  chargeLimit
} from './limitGate.js'

import {
  limitHabisMessage
} from './limitMessage.js'

// =====================================
// NEXA MULTIPLAYER GAME CORE
// =====================================

const rounds = new Map()
const cooldowns = new Map()
const listenedSockets = new WeakSet()

const ROUND_COOLDOWN =
  15 * 1000

const GAME_LIMIT_COST =
  1

// =====================================
// UTILS
// =====================================

function chatKey(jid) {
  return String(jid || '')
    .trim()
    .toLowerCase()
}

function sleep(ms) {
  return new Promise(resolve =>
    setTimeout(resolve, ms)
  )
}

function getText(msg) {
  const m =
    msg?.message || {}

  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    ''
  )
}

function getReplyId(msg) {
  return (
    msg?.message
      ?.extendedTextMessage
      ?.contextInfo
      ?.stanzaId ||
    null
  )
}

export function normalizeAnswer(
  text
) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[.,!?]/g, '')
    .replace(/\s+/g, ' ')
}

export function randomItem(
  array
) {
  return array[
    Math.floor(
      Math.random() *
      array.length
    )
  ]
}

export function shuffleWord(
  word
) {
  const original =
    String(word)

  let result =
    original

  let tries = 0

  while (
    result.toLowerCase() ===
      original.toLowerCase() &&
    tries < 30
  ) {
    result =
      original
        .split('')
        .sort(
          () =>
            Math.random() -
            0.5
        )
        .join('')

    tries++
  }

  return result
}

// =====================================
// QUESTION BANK
// =====================================

export const tebakKata = [
  {
    clue:
      'Hewan yang suka mengeong',
    answer:
      'kucing'
  },
  {
    clue:
      'Tempat belajar bersama guru',
    answer:
      'sekolah'
  },
  {
    clue:
      'Benda untuk melihat waktu',
    answer:
      'jam'
  },
  {
    clue:
      'Planet tempat manusia tinggal',
    answer:
      'bumi'
  },
  {
    clue:
      'Alat untuk menulis dengan tinta',
    answer:
      'pulpen'
  },
  {
    clue:
      'Hewan besar yang punya belalai',
    answer:
      'gajah'
  },
  {
    clue:
      'Benda yang digunakan saat hujan',
    answer:
      'payung'
  },
  {
    clue:
      'Cairan yang kita minum setiap hari',
    answer:
      'air'
  },
  {
    clue:
      'Benda untuk membuka pintu',
    answer:
      'kunci'
  },
  {
    clue:
      'Kendaraan yang berjalan di rel',
    answer:
      'kereta'
  }
]

export const susunKata = [
  {
    word: 'kucing',
    clue: 'hewan'
  },
  {
    word: 'gajah',
    clue: 'hewan'
  },
  {
    word: 'mangga',
    clue: 'buah'
  },
  {
    word: 'pisang',
    clue: 'buah'
  },
  {
    word: 'komputer',
    clue: 'benda elektronik'
  },
  {
    word: 'kamera',
    clue: 'benda elektronik'
  },
  {
    word: 'jakarta',
    clue: 'kota'
  },
  {
    word: 'bandung',
    clue: 'kota'
  },
  {
    word: 'indonesia',
    clue: 'negara'
  },
  {
    word: 'jepang',
    clue: 'negara'
  },
  {
    word: 'sekolah',
    clue: 'tempat'
  },
  {
    word: 'rumah',
    clue: 'tempat'
  },
  {
    word: 'keyboard',
    clue: 'perangkat komputer'
  },
  {
    word: 'monitor',
    clue: 'perangkat komputer'
  },
  {
    word: 'gitar',
    clue: 'alat musik'
  },
  {
    word: 'piano',
    clue: 'alat musik'
  },
  {
    word: 'sepeda',
    clue: 'kendaraan'
  },
  {
    word: 'mobil',
    clue: 'kendaraan'
  },
  {
    word: 'dokter',
    clue: 'profesi'
  },
  {
    word: 'petani',
    clue: 'profesi'
  }
]

export const cakLontong = [
  {
    question:
      'Apa yang naik tapi tidak pernah turun?',
    answer:
      'umur'
  },
  {
    question:
      'Apa yang punya banyak gigi tapi tidak bisa menggigit?',
    answer:
      'sisir'
  },
  {
    question:
      'Apa yang punya jarum tapi tidak bisa menjahit?',
    answer:
      'jam'
  },
  {
    question:
      'Apa yang semakin diisi malah semakin ringan?',
    answer:
      'balon'
  },
  {
    question:
      'Benda apa yang kalau dipotong malah jadi lebih panjang?',
    answer:
      'antrian'
  }
]

// =====================================
// ROUND STATUS
// =====================================

export function getRound(
  jid
) {
  return (
    rounds.get(
      chatKey(jid)
    ) || null
  )
}

export function getCooldown(
  jid
) {
  const key =
    chatKey(jid)

  const until =
    cooldowns.get(key) || 0

  const remaining =
    until - Date.now()

  if (remaining <= 0) {
    cooldowns.delete(key)
    return 0
  }

  return remaining
}

// =====================================
// REWARD
// =====================================

function getReward(rank) {
  if (rank === 1) {
    return {
      exp: 20,
      coin: 10
    }
  }

  if (rank === 2) {
    return {
      exp: 15,
      coin: 7
    }
  }

  if (rank === 3) {
    return {
      exp: 10,
      coin: 5
    }
  }

  return {
    exp: 7,
    coin: 3
  }
}

// =====================================
// LEVEL UP
// =====================================

async function sendLevelUp(
  sock,
  jid,
  playerJid,
  expResult
) {
  const mention =
    `@${String(
      playerJid
    ).split('@')[0]}`

  const required =
    getRequiredExp(
      expResult.level
    )

  await sock.sendMessage(
    jid,
    {
      text:
        `✨ *LEVEL UP*\n\n` +
        `Selamat, ${mention}! 🎉\n` +
        `Kamu berhasil mencapai *Level ${expResult.level}*.\n\n` +
        `Level  : ${expResult.oldLevel} → ${expResult.level}\n` +
        `EXP    : ${expResult.exp}/${required}\n\n` +
        `Terus bermain dan naik lebih tinggi. 🚀`,

      mentions: [
        playerJid
      ]
    }
  )
}

// =====================================
// FINISH ROUND
// =====================================

async function finishRound(
  sock,
  jid
) {
  const key =
    chatKey(jid)

  const round =
    rounds.get(key)

  if (!round) {
    return
  }

  rounds.delete(key)

  cooldowns.set(
    key,
    Date.now() +
      ROUND_COOLDOWN
  )

  const correct =
    [...round.correct]
      .sort(
        (a, b) =>
          a.time - b.time
      )

  const surrendered =
    [...round.surrendered.values()]

  const mentions = []
  const levelUps = []

  let text =
    `🏁 *RONDE SELESAI*\n\n` +
    `✅ Jawaban: *${round.answer}*\n\n`

  if (correct.length) {
    text +=
      `🏆 *Ranking*\n`

    for (
      let i = 0;
      i < correct.length;
      i++
    ) {
      const player =
        correct[i]

      const rank =
        i + 1

      const reward =
        getReward(rank)

      const expResult =
        addExp(
          player.jid,
          reward.exp
        )

      const coinResult =
        addCoin(
          player.jid,
          reward.coin
        )

      if (
        expResult.leveledUp
      ) {
        levelUps.push({
          jid:
            player.jid,
          expResult
        })
      }

      mentions.push(
        player.jid
      )

      const mention =
        `@${String(
          player.jid
        ).split('@')[0]}`

      let medal

      if (rank === 1) {
        medal = '🥇'
      } else if (
        rank === 2
      ) {
        medal = '🥈'
      } else if (
        rank === 3
      ) {
        medal = '🥉'
      } else {
        medal =
          `${rank}.`
      }

      text +=
        `${medal} ${mention}` +
        ` — +${reward.exp} EXP` +
        ` +${reward.coin} Coin`

      if (
        expResult.leveledUp
      ) {
        text +=
          ` 🎊 Lv.${expResult.level}`
      }

      text += '\n'

      console.log(
        `🎮 Rank ${rank}: ` +
        `${player.jid} | ` +
        `EXP ${expResult.exp}/${getRequiredExp(expResult.level)} | ` +
        `Coin ${coinResult.coin}`
      )
    }
  } else {
    text +=
      '❌ Belum ada jawaban yang benar.\n'
  }

  if (surrendered.length) {
    text +=
      '\n🏳️ *Menyerah*\n'

    for (
      const player
      of surrendered
    ) {
      mentions.push(
        player.jid
      )

      const mention =
        `@${String(
          player.jid
        ).split('@')[0]}`

      text +=
        `• ${mention}\n`
    }
  }

  if (
    !correct.length &&
    !surrendered.length &&
    round.participants.size === 0
  ) {
    text +=
      '\n😴 Belum ada yang ikut ronde ini.\n'
  }

  text +=
    `\n⏳ Cooldown game: 15 detik`

  await sock.sendMessage(
    jid,
    {
      text:
        text.trim(),

      mentions:
        [...new Set(mentions)]
    }
  )

  for (
    const item
    of levelUps
  ) {
    try {
      await sendLevelUp(
        sock,
        jid,
        item.jid,
        item.expResult
      )
    } catch (err) {
      console.error(
        '✨ Level up message:',
        err
      )
    }
  }
}

// =====================================
// HANDLE REPLY
// =====================================

async function handleGameReply(
  sock,
  msg
) {
  if (
    !msg?.message ||
    msg.key?.fromMe
  ) {
    return
  }

  const jid =
    msg.key.remoteJid

  if (!jid) {
    return
  }

  const round =
    getRound(jid)

  if (!round) {
    return
  }

  const replyId =
    getReplyId(msg)

  if (
    !replyId ||
    replyId !==
      round.questionMessageId
  ) {
    return
  }

  const text =
    normalizeAnswer(
      getText(msg)
    )

  if (!text) {
    return
  }

  const userJid =
    getProfileJid(
      msg,
      jid
    )

  if (!userJid) {
    return
  }

  if (
    round.correctUsers.has(
      userJid
    )
  ) {
    await sock.sendMessage(
      jid,
      {
        text:
          '✅ Jawabanmu sudah tercatat di ranking.'
      },
      {
        quoted: msg
      }
    )

    return
  }

  if (
    round.surrendered.has(
      userJid
    )
  ) {
    await sock.sendMessage(
      jid,
      {
        text:
          '🏳️ Kamu sudah menyerah di ronde ini 😭'
      },
      {
        quoted: msg
      }
    )

    return
  }

  round.participants.add(
    userJid
  )

  if (
    text === 'nyerah' ||
    text === 'menyerah' ||
    text === 'surrender'
  ) {
    round.surrendered.set(
      userJid,
      {
        jid:
          userJid,
        time:
          Date.now()
      }
    )

    await sock.sendMessage(
      jid,
      {
        text:
          '🏳️ Menyerah tercatat.'
      },
      {
        quoted: msg
      }
    )

    return
  }

  if (
    text !==
    normalizeAnswer(
      round.answer
    )
  ) {
    await sock.sendMessage(
      jid,
      {
        text:
          '❌ Belum tepat.\n' +
          'Coba lagi sebelum waktunya habis 😭'
      },
      {
        quoted: msg
      }
    )

    return
  }

  const rank =
    round.correct.length +
    1

  round.correct.push({
    jid:
      userJid,
    time:
      Date.now()
  })

  round.correctUsers.add(
    userJid
  )

  let position

  if (rank === 1) {
    position = '🥇 #1'
  } else if (
    rank === 2
  ) {
    position = '🥈 #2'
  } else if (
    rank === 3
  ) {
    position = '🥉 #3'
  } else {
    position =
      `#${rank}`
  }

  await sock.sendMessage(
    jid,
    {
      text:
        `✅ *BENAR!* 🎉\n` +
        `🏆 Posisi sementara: *${position}*`
    },
    {
      quoted: msg
    }
  )
}

// =====================================
// LISTENER
// =====================================

function ensureListener(
  sock
) {
  if (
    listenedSockets.has(sock)
  ) {
    return
  }

  listenedSockets.add(sock)

  sock.ev.on(
    'messages.upsert',
    async ({
      messages,
      type
    }) => {
      if (
        type !== 'notify'
      ) {
        return
      }

      for (
        const msg
        of messages
      ) {
        try {
          await handleGameReply(
            sock,
            msg
          )
        } catch (err) {
          console.error(
            '🎮 Game reply:',
            err
          )
        }
      }
    }
  )
}

// =====================================
// START ROUND
// =====================================

export async function startRound({
  sock,
  msg,
  jid,
  type,
  answer,
  questionText,
  image = null,
  duration = 60
}) {
  ensureListener(sock)

  const key =
    chatKey(jid)

  // =================================
  // ROUND CHECK
  // =================================

  if (
    rounds.has(key)
  ) {
    throw new Error(
      'ROUND_ACTIVE'
    )
  }

  const cooldown =
    getCooldown(jid)

  if (cooldown > 0) {
    const err =
      new Error(
        'ROUND_COOLDOWN'
      )

    err.remaining =
      cooldown

    throw err
  }

  // =================================
  // LIMIT PRECHECK
  //
  // Dilakukan SETELAH cooldown check.
  // Jadi cooldown tidak memakan limit.
  // =================================

  const access =
    canUseLimit({
      msg,
      jid,
      cost:
        GAME_LIMIT_COST
    })

  if (
    !access.allowed
  ) {
    throw new Error(
      'LIMIT_EMPTY'
    )
  }

  // =================================
  // SEND QUESTION
  // =================================

  let content

  if (image) {
    content = {
      image: {
        url: image
      },

      caption:
        questionText
    }
  } else {
    content = {
      text:
        questionText
    }
  }

  const sent =
    await sock.sendMessage(
      jid,
      content,
      {
        quoted: msg
      }
    )

  const questionMessageId =
    sent?.key?.id

  if (!questionMessageId) {
    throw new Error(
      'QUESTION_ID_NOT_FOUND'
    )
  }

  // =================================
  // CHARGE LIMIT
  //
  // Baru dipotong setelah soal
  // berhasil dikirim.
  // Owner/Premium otomatis gratis.
  // =================================

  if (
    !access.unlimited
  ) {
    const payment =
      chargeLimit({
        msg,
        jid,
        cost:
          GAME_LIMIT_COST
      })

    if (
      !payment.success
    ) {
      throw new Error(
        'LIMIT_EMPTY'
      )
    }
  }

  // =================================
  // SAVE ROUND
  // =================================

  rounds.set(
    key,
    {
      type,
      answer,
      questionMessageId,
      startedAt:
        Date.now(),
      endsAt:
        Date.now() +
        duration * 1000,
      participants:
        new Set(),
      correct: [],
      correctUsers:
        new Set(),
      surrendered:
        new Map()
    }
  )

  console.log(
    `🎮 ${type} started in ${jid}`
  )

  ;(async () => {
    await sleep(
      duration * 1000
    )

    try {
      await finishRound(
        sock,
        jid
      )
    } catch (err) {
      console.error(
        '🎮 Finish round:',
        err
      )
    }
  })()

  return sent
}

// =====================================
// ERROR HELPER
// =====================================

export function gameStartError(
  err
) {
  if (
    err.message ===
    'ROUND_ACTIVE'
  ) {
    return (
      '🎮 Masih ada ronde aktif di chat ini.\n' +
      'Selesaikan dulu sampai waktunya habis.'
    )
  }

  if (
    err.message ===
    'ROUND_COOLDOWN'
  ) {
    const sec =
      Math.max(
        1,
        Math.ceil(
          err.remaining /
          1000
        )
      )

    return (
      `⏳ Game masih cooldown.\n` +
      `Coba lagi dalam *${sec} detik*.`
    )
  }

  if (
    err.message ===
    'LIMIT_EMPTY'
  ) {
    return limitHabisMessage(
      config.prefix
    )
  }

  return (
    '⚠️ Gagal memulai game.'
  )
}
