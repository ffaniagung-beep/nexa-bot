import {
  getRpgProfile
} from '../lib/rpg/core.js'

import {
  getRpgJid
} from '../lib/rpg/ui.js'

import {
  getRpgRegion,
  getRpgMonsterPool
} from '../lib/rpg/monsters.js'

function typeIcon(
  type
) {
  const map = {
    Normal: '⚔️',
    Swift: '💨',
    Tank: '🛡️',
    Berserker: '💥',
    Caster: '🔮',
    Elite: '✨',
    Boss: '👑'
  }

  return (
    map[type] ||
    '⚔️'
  )
}

export default {
  name: 'region',
  aliases: [
    'area'
  ],

  category: 'RPG',

  description:
    'Melihat region dan monster RPG saat ini',

  usage:
    '.region',

  async run({
    sock,
    msg,
    jid
  }) {
    const userJid =
      await getRpgJid({
        sock,
        msg,
        jid
      })

    const profile =
      getRpgProfile(
        userJid
      )

    const region =
      getRpgRegion(
        profile.level
      )

    const monsters =
      getRpgMonsterPool(
        profile.level
      )

    const list =
      monsters
        .map(
          monster =>
            `│ ${monster.icon} *${monster.name}*\n` +
            `│    ${typeIcon(monster.type)} ${monster.type}`
        )
        .join(
          '\n│\n'
        )

    const maxLevel =
      region.maxLevel >= 999
        ? '∞'
        : region.maxLevel

    const text =
      `╭━━━━〔 🗺️ *RPG REGION* 〕━━━━╮\n` +
      `│\n` +
      `│ ${region.icon} *${region.name}*\n` +
      `│ ⭐ Area Lv.${region.minLevel}-${maxLevel}\n` +
      `│ 👤 RPG Level: *${profile.level}*\n` +
      `│\n` +
      `├────〔 👾 *ENCOUNTERS* 〕────\n` +
      `${list}\n` +
      `│\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
      `🌲 Gunakan *.adventure* untuk menjelajah.`

    return sock.sendMessage(
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
