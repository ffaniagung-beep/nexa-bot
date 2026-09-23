import {
  getBankHeistStatus,
  attemptBankHeist
} from '../lib/rpg/heist.js'

import {
  resolveProfileJid
} from '../lib/profile.js'

import {
  rpgCommand,
  sendRpgQuickPanel
} from '../lib/rpg/uxV2.js'

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

  const hours =
    Math.floor(
      total /
      3600
    )

  const minutes =
    Math.floor(
      (
        total %
        3600
      ) /
      60
    )

  return (
    `${hours}j ${minutes}m`
  )
}

export default {
  name: 'rampokbank',
  aliases: ['bankheist'],
  category: 'RPG',
  description: 'NPC Bank Heist RPG',
  usage: '.rampokbank <city/grand/royal>',

  async run({
    sock,
    msg,
    jid,
    args,
    isOwner,
    config
  }) {
    const userJid =
      await resolveProfileJid(
        sock,
        msg,
        jid
      )

    const tierId =
      String(
        args?.[0] || ''
      )
        .trim()
        .toLowerCase()

    if (!tierId) {
      const info =
        getBankHeistStatus(
          userJid
        )

      const body =
        `⚔️ Heist Power *${info.power}*\n` +
        `⏳ Cooldown *${duration(info.cooldown)}*\n\n` +
        `🏦 *CITY BANK* • Lv.5+ • Reward 1.500\n` +
        `🏛️ *GRAND BANK* • Lv.10+ • Reward 5.000\n` +
        `👑 *ROYAL BANK* • Lv.20+ • Reward 15.000\n\n` +
        `Setiap percobaan nyata memberi cooldown *12 jam*.`

      return sendRpgQuickPanel({
        sock,
        msg,
        jid,
        title:
          '🏦 NEXA • BANK HEIST',
        body,
        actions: [
          {
            text: '🏦 City Bank',
            id: rpgCommand(config, 'rampokbank', 'city')
          },
          {
            text: '🏛️ Grand Bank',
            id: rpgCommand(config, 'rampokbank', 'grand')
          },
          {
            text: '👑 Royal Bank',
            id: rpgCommand(config, 'rampokbank', 'royal')
          },
          {
            text: '🚨 Wanted',
            id: rpgCommand(config, 'wanted')
          },
          {
            text: '⚔️ RPG Hub',
            id: rpgCommand(config, 'menu', 'rpg')
          }
        ]
      })
    }

    const r =
      attemptBankHeist(
        userJid,
        tierId,
        {
          isOwner
        }
      )

    if (
      r.reason ===
      'INVALID_TIER'
    ) {
      return sendRpgQuickPanel({
        sock,
        msg,
        jid,
        title:
          '❌ TIER TIDAK VALID',
        body:
          'Pilih *city / grand / royal*.',
        actions: [
          {
            text: '🏦 Heist Menu',
            id: rpgCommand(config, 'rampokbank')
          }
        ]
      })
    }

    if (
      r.reason ===
      'LEVEL_LOW'
    ) {
      return sendRpgQuickPanel({
        sock,
        msg,
        jid,
        title:
          `${r.tier.icon} ${r.tier.name}`,
        body:
          `🔒 Butuh RPG *Lv.${r.required}+*.`,
        actions: [
          {
            text: '👤 Profile',
            id: rpgCommand(config, 'rpg')
          },
          {
            text: '🏦 Heist Menu',
            id: rpgCommand(config, 'rampokbank')
          }
        ]
      })
    }

    if (
      r.reason ===
      'WANTED_MAX'
    ) {
      return sendRpgQuickPanel({
        sock,
        msg,
        jid,
        title:
          '🚨 WANTED MAX',
        body:
          'Wanted lu sudah *5/5*. Beresin dulu sebelum heist lagi.',
        actions: [
          {
            text: '💵 Bayar Denda',
            id: rpgCommand(config, 'payfine')
          },
          {
            text: '🚨 Wanted',
            id: rpgCommand(config, 'wanted')
          }
        ]
      })
    }

    if (
      r.reason ===
      'COOLDOWN'
    ) {
      return sendRpgQuickPanel({
        sock,
        msg,
        jid,
        title:
          '🏦 SECURITY ALERT',
        body:
          `Security masih waspada.\n⏳ Heist berikutnya *${duration(r.cooldown)}*`,
        actions: [
          {
            text: '🏦 Heist Menu',
            id: rpgCommand(config, 'rampokbank')
          },
          {
            text: '⚔️ RPG Hub',
            id: rpgCommand(config, 'menu', 'rpg')
          }
        ]
      })
    }

    if (!r.success) {
      return sock.sendMessage(
        jid,
        {
          text:
            '❌ Bank Heist gagal diproses.'
        },
        {
          quoted: msg
        }
      )
    }

    const body =
      `${r.tier.icon} *${r.tier.name}*\n\n` +
      `${r.scenario}\n\n` +
      (
        r.outcome === 'SUCCESS'
          ? `💵 +${num(r.reward)} Money\n`
          : `💸 Denda ${num(r.penalty)} Money\n`
      ) +
      `🚨 Wanted *${r.wanted}/5*\n` +
      `💼 Wallet *${num(r.money)}*\n` +
      `⏳ Cooldown *12 jam*`

    return sendRpgQuickPanel({
      sock,
      msg,
      jid,
      title:
        r.outcome === 'SUCCESS'
          ? '✅ HEIST SUCCESS'
          : '🚨 HEIST FAILED',
      body,
      actions: [
        {
          text: '🚨 Wanted',
          id: rpgCommand(config, 'wanted')
        },
        {
          text: '🏦 RPG Bank',
          id: rpgCommand(config, 'bank')
        },
        {
          text: '⚔️ RPG Hub',
          id: rpgCommand(config, 'menu', 'rpg')
        }
      ]
    })
  }
}
