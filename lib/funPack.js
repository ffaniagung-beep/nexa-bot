import {
  stableInt,
  jakartaDayKey
} from './fun.js'

import {
  getProfileJid
} from './profile.js'

// =====================================
// BASIC
// =====================================

function textArgs(
  args
) {
  return (
    Array.isArray(args)
      ? args.join(' ')
      : ''
  )
    .trim()
}

function senderJid(
  msg,
  jid
) {
  return (
    getProfileJid(
      msg,
      jid
    ) ||
    msg?.key?.participant ||
    msg?.participant ||
    msg?.key?.remoteJid ||
    ''
  )
}

function contexts(
  msg
) {
  const result = []

  for (
    const value
    of Object.values(
      msg?.message ||
      {}
    )
  ) {
    if (
      value &&
      typeof value ===
        'object' &&
      value.contextInfo
    ) {
      result.push(
        value.contextInfo
      )
    }
  }

  return result
}

function targets(
  msg
) {
  const result =
    new Set()

  for (
    const ctx
    of contexts(
      msg
    )
  ) {
    for (
      const jid
      of (
        ctx?.mentionedJid ||
        []
      )
    ) {
      if (jid) {
        result.add(
          jid
        )
      }
    }

    if (
      ctx?.quotedMessage &&
      ctx?.participant
    ) {
      result.add(
        ctx.participant
      )
    }
  }

  return [
    ...result
  ]
}

function mention(
  jid
) {
  return (
    '@' +
    String(
      jid || ''
    )
      .split('@')[0]
  )
}

function makeBar(
  value
) {
  const filled =
    Math.max(
      0,
      Math.min(
        10,
        Math.round(
          value / 10
        )
      )
    )

  return (
    '█'.repeat(
      filled
    ) +
    '░'.repeat(
      10 - filled
    )
  )
}

function normalized(
  value
) {
  return String(
    value || ''
  )
    .trim()
    .toLowerCase()
    .replace(
      /\s+/g,
      ' '
    )
}

// =====================================
// BODY / APPEARANCE FILTER
// =====================================

function physicalQuestion(
  value
) {
  return (
    /\b(ganteng|cantik|cakep|jelek|seksi|kurus|gemuk|gendut|berat badan|tinggi badan|bentuk badan|body|fisik|wajah|muka|kulit|hidung)\b/i
      .test(
        value
      )
  )
}

// =====================================
// APAKAH AKU
// =====================================

function apakahResult(
  score
) {
  if (
    score >= 90
  ) {
    return '💚 Sangat mungkin 😭'
  }

  if (
    score >= 72
  ) {
    return '🟢 Kayaknya iya.'
  }

  if (
    score >= 55
  ) {
    return '🟡 Ada kemungkinan.'
  }

  if (
    score >= 40
  ) {
    return '🟡 Masih meragukan 🗿'
  }

  if (
    score >= 20
  ) {
    return '🔴 Kayaknya enggak.'
  }

  return '💀 NEXA meragukan hal itu.'
}

export async function runApakahAku({
  sock,
  msg,
  jid,
  args,
  config
}) {
  const question =
    textArgs(
      args
    )

  const prefix =
    config?.prefix ||
    '.'

  if (!question) {
    return sock.sendMessage(
      jid,
      {
        text:
          `🤔 *APAKAH AKU?*\n\n` +
          `Contoh:\n` +
          `*${prefix}apakahaku bakal telat hari ini?*\n` +
          `*${prefix}apakahaku orang paling gabut di grup?*`
      },
      {
        quoted: msg
      }
    )
  }

  if (
    physicalQuestion(
      question
    )
  ) {
    return sock.sendMessage(
      jid,
      {
        text:
          `😭 NEXA gak ngerating fisik.\n` +
          `Tanya yang lebih chaos aja 🗿`
      },
      {
        quoted: msg
      }
    )
  }

  const user =
    senderJid(
      msg,
      jid
    )

  const seed =
    [
      jakartaDayKey(),
      'apakahaku',
      user,
      normalized(
        question
      )
    ].join('|')

  const score =
    stableInt(
      seed,
      0,
      100
    )

  return sock.sendMessage(
    jid,
    {
      text:
        `╭──「 🤔 *APAKAH AKU?* 」\n` +
        `│\n` +
        `│ ❓ ${question}\n` +
        `│\n` +
        `│ ${apakahResult(score)}\n` +
        `│ 🎯 Kemungkinan: *${score}%*\n` +
        `│\n` +
        `╰──────────────`
    },
    {
      quoted: msg
    }
  )
}

// =====================================
// SEBERAPA
// =====================================

function meterStatus(
  value
) {
  if (value <= 10) {
    return 'Nyaris gak terdeteksi 😭'
  }

  if (value <= 30) {
    return 'Masih tipis.'
  }

  if (value <= 50) {
    return 'Lumayan.'
  }

  if (value <= 70) {
    return 'Mulai kuat 🗿'
  }

  if (value <= 90) {
    return 'TINGGI BANGET 🔥'
  }

  return 'MAXIMUM OVERDRIVE 💀'
}

export async function runSeberapa({
  sock,
  msg,
  jid,
  args,
  config
}) {
  const query =
    textArgs(
      args
    )

  const prefix =
    config?.prefix ||
    '.'

  if (!query) {
    return sock.sendMessage(
      jid,
      {
        text:
          `📊 *SEBERAPA?*\n\n` +
          `Contoh:\n` +
          `*${prefix}seberapa chaos gw hari ini*\n` +
          `*${prefix}seberapa hoki hari ini*`
      },
      {
        quoted: msg
      }
    )
  }

  if (
    physicalQuestion(
      query
    )
  ) {
    return sock.sendMessage(
      jid,
      {
        text:
          `😭 Yang fisik skip dulu.\n` +
          `Coba ukur chaos, hoki, gabut, NPC, dll 🗿`
      },
      {
        quoted: msg
      }
    )
  }

  const user =
    senderJid(
      msg,
      jid
    )

  const value =
    stableInt(
      [
        jakartaDayKey(),
        'seberapa',
        user,
        normalized(query)
      ].join('|'),
      0,
      100
    )

  return sock.sendMessage(
    jid,
    {
      text:
        `╭──「 📊 *SEBERAPA?* 」\n` +
        `│\n` +
        `│ ${query}\n` +
        `│\n` +
        `│ ${makeBar(value)}\n` +
        `│ 🎯 *${value}%*\n` +
        `│ ${meterStatus(value)}\n` +
        `│\n` +
        `╰──────────────`
    },
    {
      quoted: msg
    }
  )
}

// =====================================
// RAMAL JODOH
// =====================================

function loveStatus(
  score
) {
  if (score <= 15) {
    return '💀 NEXA melihat plot twist besar.'
  }

  if (score <= 35) {
    return '😭 Sinyalnya masih putus-putus.'
  }

  if (score <= 55) {
    return '🗿 Lumayan nyambung.'
  }

  if (score <= 75) {
    return '✨ Chemistry-nya cukup kuat.'
  }

  if (score <= 90) {
    return '💞 Kompak banget nih.'
  }

  return '💘 BUSYET, hampir perfect match 😭'
}

export async function runRamalJodoh({
  sock,
  msg,
  jid,
  config
}) {
  const prefix =
    config?.prefix ||
    '.'

  const sender =
    senderJid(
      msg,
      jid
    )

  const list =
    targets(
      msg
    )

  let a
  let b

  if (
    list.length >= 2
  ) {
    a =
      list[0]

    b =
      list[1]
  } else if (
    list.length === 1
  ) {
    a =
      sender

    b =
      list[0]
  }

  if (
    !a ||
    !b
  ) {
    return sock.sendMessage(
      jid,
      {
        text:
          `💞 *RAMAL JODOH*\n\n` +
          `Gunakan:\n` +
          `*${prefix}ramaljodoh @user @user*\n\n` +
          `Atau:\n` +
          `*${prefix}ramaljodoh @user*`
      },
      {
        quoted: msg
      }
    )
  }

  if (a === b) {
    return sock.sendMessage(
      jid,
      {
        text:
          '😭 Itu orangnya sama njir.'
      },
      {
        quoted: msg
      }
    )
  }

  const pair =
    [
      a,
      b
    ].sort()

  const score =
    stableInt(
      [
        jakartaDayKey(),
        'ramaljodoh',
        ...pair
      ].join('|'),
      0,
      100
    )

  return sock.sendMessage(
    jid,
    {
      text:
        `╭──「 💞 *RAMAL JODOH* 」\n` +
        `│\n` +
        `│ ${mention(a)} × ${mention(b)}\n` +
        `│\n` +
        `│ ${makeBar(score)}\n` +
        `│ 💘 Kecocokan: *${score}%*\n` +
        `│\n` +
        `│ ${loveStatus(score)}\n` +
        `│\n` +
        `╰──────────────`,

      mentions: [
        a,
        b
      ]
    },
    {
      quoted: msg
    }
  )
}

// =====================================
// RAMAL RANDOM
// =====================================

const RAMALAN = [
  'Ada kemungkinan kabar random datang dari arah yang gak disangka.',
  'Hari ini cocok menyelesaikan sesuatu yang udah lama ditunda.',
  'Seseorang mungkin bikin lu ngakak di waktu yang gak tepat 😭',
  'Keberuntungan kecil datang kalau lu gak keburu males.',
  'Hari ini auranya lebih cocok santai daripada cari ribut 🗿',
  'Ada potensi menemukan sesuatu yang kemarin dicari-cari.',
  'Hari ini keputusan spontan bisa menghasilkan cerita lucu.',
  'Jangan kaget kalau rencana berubah mendadak.',
  'Hari ini cocok mencoba sesuatu yang biasanya lu hindari.',
  'Kemungkinan besar ada satu momen “lah kok bisa?” hari ini.',
  'Energi hari ini: produktif sebentar, gabut lama 😭',
  'Ada peluang dapat kabar yang bikin mood naik.',
  'Hari ini intuisi lu lumayan tajam.',
  'Satu hal kecil bisa bikin hari ini jauh lebih seru.',
  'Hari ini cocok membereskan hal kecil sebelum jadi numpuk.'
]

export async function runRamal({
  sock,
  msg,
  jid
}) {
  const user =
    senderJid(
      msg,
      jid
    )

  const seed =
    `${jakartaDayKey()}|ramal|${user}`

  const index =
    stableInt(
      seed,
      0,
      RAMALAN.length - 1
    )

  const lucky =
    stableInt(
      `${seed}|number`,
      1,
      99
    )

  return sock.sendMessage(
    jid,
    {
      text:
        `╭──「 🔮 *RAMALAN RANDOM* 」\n` +
        `│\n` +
        `│ ${RAMALAN[index]}\n` +
        `│\n` +
        `│ 🍀 Angka hoki: *${lucky}*\n` +
        `│\n` +
        `╰──────────────`
    },
    {
      quoted: msg
    }
  )
}

// =====================================
// KHODAM
// =====================================

const KHODAM = [
  'Kucing Kasir Multiverse',
  'Ayam Geprek Dimensi Tujuh',
  'Cicak Penjaga Wi-Fi',
  'Lele Administrator Server',
  'Capybara Sultan Senja',
  'Kambing Penjaga Powerbank',
  'Bebek Quantum',
  'Naga Mini Tukang Tidur',
  'Ikan Cupang Ketua RT',
  'Kucing Oren Pembawa Chaos',
  'Burung Pipit Teknisi Router',
  'Panda Penjaga Gorengan',
  'Tokek Penunggu Keyboard',
  'Hamster Overclock',
  'Komodo Tukang Push Rank',
  'Ubur-Ubur Mode Hemat',
  'Semut Sultan Kerajaan Gula',
  'Cacing Penjaga Database',
  'Biawak Penunggu Warung',
  'Kucing Serverless'
]

export async function runKhodam({
  sock,
  msg,
  jid
}) {
  const user =
    senderJid(
      msg,
      jid
    )

  const seed =
    `${jakartaDayKey()}|khodam|${user}`

  const value =
    KHODAM[
      stableInt(
        seed,
        0,
        KHODAM.length - 1
      )
    ]

  const power =
    stableInt(
      `${seed}|power`,
      1,
      100
    )

  return sock.sendMessage(
    jid,
    {
      text:
        `╭──「 👻 *KHODAM RANDOM* 」\n` +
        `│\n` +
        `│ 🐾 *${value}*\n` +
        `│ ⚡ Power: *${power}%*\n` +
        `│\n` +
        `╰──────────────`
    },
    {
      quoted: msg
    }
  )
}

// =====================================
// GELAR
// =====================================

const GELAR_A = [
  'Lord',
  'Master',
  'Sultan',
  'Profesor',
  'Jenderal',
  'Ketua',
  'Raja',
  'Ratu',
  'Legenda',
  'Admin',
  'Kapten',
  'Bos Besar'
]

const GELAR_B = [
  'Kaum Rebahan',
  'Penguasa Wi-Fi',
  'Tukang AFK',
  'Pemburu Gorengan',
  'Penjaga Grup',
  'Ahli Menunda',
  'Pengendali Chaos',
  'Pawang Deadline',
  'Penakluk Tugas',
  'Penghancur Mood',
  'Penguasa Meme',
  'Ketua Gabut Nasional'
]

export async function runGelar({
  sock,
  msg,
  jid
}) {
  const user =
    senderJid(
      msg,
      jid
    )

  const seed =
    `${jakartaDayKey()}|gelar|${user}`

  const first =
    GELAR_A[
      stableInt(
        `${seed}|a`,
        0,
        GELAR_A.length - 1
      )
    ]

  const second =
    GELAR_B[
      stableInt(
        `${seed}|b`,
        0,
        GELAR_B.length - 1
      )
    ]

  return sock.sendMessage(
    jid,
    {
      text:
        `🏆 *GELAR RANDOM*\n\n` +
        `✨ *${first} ${second}* 😭`
    },
    {
      quoted: msg
    }
  )
}

// =====================================
// NASIB
// =====================================

function nasibStatus(
  value
) {
  if (value <= 10) {
    return '💀 Hari ini mode hard.'
  }

  if (value <= 30) {
    return '😭 Agak zonk.'
  }

  if (value <= 50) {
    return '🗿 Netral, jangan berharap terlalu banyak.'
  }

  if (value <= 70) {
    return '🙂 Lumayan aman.'
  }

  if (value <= 90) {
    return '🍀 Hoki mulai kelihatan.'
  }

  return '🔥 HARI INI LU PEGANG SCRIPT.'
}

export async function runNasib({
  sock,
  msg,
  jid
}) {
  const user =
    senderJid(
      msg,
      jid
    )

  const value =
    stableInt(
      `${jakartaDayKey()}|nasib|${user}`,
      0,
      100
    )

  return sock.sendMessage(
    jid,
    {
      text:
        `╭──「 🍀 *NASIB RANDOM* 」\n` +
        `│\n` +
        `│ ${makeBar(value)}\n` +
        `│\n` +
        `│ 🎯 Hoki: *${value}%*\n` +
        `│ ${nasibStatus(value)}\n` +
        `│\n` +
        `╰──────────────`
    },
    {
      quoted: msg
    }
  )
}

// =====================================
// DUEL
// =====================================

export async function runDuel({
  sock,
  msg,
  jid,
  config
}) {
  const prefix =
    config?.prefix ||
    '.'

  const sender =
    senderJid(
      msg,
      jid
    )

  const list =
    targets(
      msg
    )

  const target =
    list.find(
      item =>
        item !== sender
    )

  if (!target) {
    return sock.sendMessage(
      jid,
      {
        text:
          `⚔️ *NEXA DUEL*\n\n` +
          `Mention atau reply lawan:\n` +
          `*${prefix}duel @user*`
      },
      {
        quoted: msg
      }
    )
  }

  const pair =
    [
      sender,
      target
    ].sort()

  const seed =
    [
      jakartaDayKey(),
      'duel',
      ...pair
    ].join('|')

  const powerA =
    stableInt(
      `${seed}|${sender}`,
      1,
      100
    )

  let powerB =
    stableInt(
      `${seed}|${target}`,
      1,
      100
    )

  if (
    powerA === powerB
  ) {
    powerB =
      powerB === 100
        ? 99
        : powerB + 1
  }

  const winner =
    powerA >
    powerB
      ? sender
      : target

  return sock.sendMessage(
    jid,
    {
      text:
        `╭──「 ⚔️ *NEXA DUEL* 」\n` +
        `│\n` +
        `│ ${mention(sender)}\n` +
        `│ ⚡ Power: *${powerA}*\n` +
        `│\n` +
        `│          VS\n` +
        `│\n` +
        `│ ${mention(target)}\n` +
        `│ ⚡ Power: *${powerB}*\n` +
        `│\n` +
        `│ 🏆 Pemenang:\n` +
        `│ *${mention(winner)}* 🔥\n` +
        `│\n` +
        `╰──────────────`,

      mentions: [
        sender,
        target,
        winner
      ]
    },
    {
      quoted: msg
    }
  )
}
