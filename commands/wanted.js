import {
  getCrimeStatus
} from '../lib/rpg/crime.js'

import {
  resolveProfileJid
} from '../lib/profile.js'

function num(
  value
) {
  return Number(
    value || 0
  ).toLocaleString(
    'id-ID'
  )
}

function duration(
  ms
) {
  if (
    !ms ||
    ms <= 0
  ) {
    return 'Siap'
  }

  const total =
    Math.ceil(
      ms /
      1000
    )

  const minutes =
    Math.floor(
      total /
      60
    )

  const seconds =
    total %
    60

  return (
    `${minutes}m ${seconds}d`
  )
}

export default {
  name:
    'wanted',

  aliases: [],
  category:
    'RPG',

  description:
    'Melihat status Wanted RPG',

  usage:
    '.wanted',

  async run({
    sock,
    msg,
    jid
  }) {
    const userJid =
      await resolveProfileJid(
        sock,
        msg,
        jid
      )

    const r =
      getCrimeStatus(
        userJid
      )

    const stars =
      '🚨'.repeat(
        r.wanted
      ) +
      '▫️'.repeat(
        Math.max(
          0,
          5 -
          r.wanted
        )
      )

    return sock.sendMessage(
      jid,
      {
        text:
          `╭━━━━〔 🚨 *WANTED STATUS* 〕━━━━╮\n` +
          `│\n` +
          `│ ${stars}\n` +
          `│ Wanted: *${r.wanted}/5*\n` +
          `│\n` +
          `│ 💵 Denda bersih nama:\n` +
          `│ *${num(r.fine)} Money*\n` +
          `│\n` +
          `│ 🧤 Crime cooldown:\n` +
          `│ *${duration(r.globalCooldown)}*\n` +
          `│\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━━╯` +
          (
            r.wanted > 0
              ? `\n\n💡 Gunakan *.payfine*`
              : ''
          )
      },
      {
        quoted:
          msg
      }
    )
  }
}
