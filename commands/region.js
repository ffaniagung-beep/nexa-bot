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

import {
  rpgCommand,
  sendRpgQuickPanel
} from '../lib/rpg/uxV2.js'

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
    jid,
    config
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

    const maxLevel =
      region.maxLevel >= 999
        ? '∞'
        : region.maxLevel

    const encounters =
      monsters
        .map(
          monster =>
            `${monster.icon} *${monster.name}* • ` +
            `${typeIcon(monster.type)} ${monster.type}`
        )
        .join('\n')

    const body =
      `${region.icon} *${region.name}*\n` +
      `⭐ Area Lv.${region.minLevel}-${maxLevel}\n` +
      `👤 RPG Level *${profile.level}*\n\n` +
      `*ENCOUNTERS*\n${encounters}\n\n` +
      `🌲 Adventure memilih encounter dari region aktif.`

    return sendRpgQuickPanel({
      sock,
      msg,
      jid,
      title:
        '🗺️ NEXA • RPG REGION',
      body,
      actions: [
        {
          text: '🌲 Adventure',
          id: rpgCommand(config, 'adventure')
        },
        {
          text: '⚔️ Battle',
          id: rpgCommand(config, 'battle')
        },
        {
          text: '👤 Profile',
          id: rpgCommand(config, 'rpg')
        },
        {
          text: '⚔️ RPG Hub',
          id: rpgCommand(config, 'menu', 'rpg')
        }
      ]
    })
  }
}
