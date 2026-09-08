import {
  stableInt,
  jakartaDayKey
} from '../lib/fun.js'

import {
  getProfileJid
} from '../lib/profile.js'

function makeBar(
  value
) {
  const filled =
    Math.round(
      value / 10
    )

  return (
    '█'.repeat(filled) +
    '░'.repeat(
      10 - filled
    )
  )
}

function getStatus(
  value
) {
  if (value === 100) {
    return '💀 FINAL BOSS KERIBUTAN.'
  }

  if (value <= 10) {
    return '😇 NPC paling damai hari ini.'
  }

  if (value <= 30) {
    return '🙂 Masih bisa dipercaya.'
  }

  if (value <= 50) {
    return '🗿 Mulai ada gerak-gerik mencurigakan.'
  }

  if (value <= 70) {
    return '😭 Satu ide buruk dari keributan.'
  }

  if (value <= 90) {
    return '🔥 Jangan ditinggal tanpa pengawasan.'
  }

  return '☠️ JANGAN DIKASIH AKSES ADMIN.'
}

export default {
  name:
    'chaos',

  aliases: [
    'chaosmeter',
    'rusuh'
  ],

  category:
    'FUN',

  description:
    'Mengukur Chaos Meter random',

  usage:
    '.chaos',

  async run({
    sock,
    msg,
    jid
  }) {
    const userJid =
      getProfileJid(
        msg,
        jid
      )

    const value =
      stableInt(
        `${jakartaDayKey()}|chaos|${userJid}`,
        0,
        100
      )

    await sock.sendMessage(
      jid,
      {
        text:
          `╭──「 💥 *CHAOS METER* 」\n` +
          `│\n` +
          `│ ${makeBar(value)}\n` +
          `│\n` +
          `│ 🔥 Chaos : *${value}%*\n` +
          `│\n` +
          `│ ${getStatus(value)}\n` +
          `│\n` +
          `╰──────────────`
      },
      {
        quoted: msg
      }
    )
  }
}
