import {
  restRpg
} from '../lib/rpg/rest.js'

import {
  resolveProfileJid
} from '../lib/profile.js'

import {
  rpgCommand,
  sendRpgQuickPanel
} from '../lib/rpg/uxV2.js'

function duration(
  ms
) {
  const total =
    Math.max(
      1,
      Math.ceil(
        Number(ms) /
        1000
      )
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
  name: 'rest',
  aliases: ['istirahat'],
  category: 'RPG',
  description: 'Memulihkan HP dan Mana',
  usage: '.rest',

  async run({
    sock,
    msg,
    jid,
    config
  }) {
    const userJid =
      await resolveProfileJid(
        sock,
        msg,
        jid
      )

    const r =
      restRpg(
        userJid
      )

    if (
      r.reason ===
      'COOLDOWN'
    ) {
      return sendRpgQuickPanel({
        sock,
        msg,
        jid,
        title:
          '🛏️ REST COOLDOWN',
        body:
          `Belum bisa istirahat lagi.\n⏳ Sisa *${duration(r.cooldown)}*`,
        actions: [
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

    if (!r.success) {
      const errors = {
        IN_BATTLE:
          '⚔️ Lu lagi battle. Selesaikan atau kabur dulu.',
        FULL:
          '😴 HP dan Mana lu sudah penuh.',
        NO_PROFILE:
          '⚔️ Profile RPG belum tersedia.'
      }

      return sendRpgQuickPanel({
        sock,
        msg,
        jid,
        title:
          '🛏️ REST',
        body:
          errors[r.reason] ||
          '❌ Rest gagal.',
        actions: [
          {
            text: '⚔️ Battle',
            id: rpgCommand(config, 'battle')
          },
          {
            text: '👤 Profile',
            id: rpgCommand(config, 'rpg')
          }
        ]
      })
    }

    return sendRpgQuickPanel({
      sock,
      msg,
      jid,
      title:
        '🛏️ NEXA • REST COMPLETE',
      body:
        `❤️ HP ${r.oldHp} → *${r.hp}/${r.maxHp}*\n` +
        `🔷 Mana ${r.oldMana} → *${r.mana}/${r.maxMana}*\n\n` +
        `⏳ Cooldown *10 menit*`,
      actions: [
        {
          text: '🌲 Adventure',
          id: rpgCommand(config, 'adventure')
        },
        {
          text: '👤 Profile',
          id: rpgCommand(config, 'rpg')
        },
        {
          text: '🎒 Inventory',
          id: rpgCommand(config, 'inventory')
        },
        {
          text: '⚔️ RPG Hub',
          id: rpgCommand(config, 'menu', 'rpg')
        }
      ]
    })
  }
}
