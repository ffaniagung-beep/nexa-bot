import {
  getBankHeistStatus,
  attemptBankHeist
} from '../lib/rpg/heist.js'

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
    isOwner
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

      return sock.sendMessage(
        jid,
        {
          text:
            `╭━━━━〔 🏦 *BANK HEIST* 〕━━━━╮\n` +
            `│\n` +
            `│ ⚔️ Heist Power: *${info.power}*\n` +
            `│ ⏳ Cooldown: *${duration(info.cooldown)}*\n` +
            `│\n` +
            `├────〔 🏦 *CITY BANK* 〕─────\n` +
            `│ 🔒 RPG Lv.5+\n` +
            `│ 💵 Reward: 1.500 Money\n` +
            `│ 💸 Gagal: maks. 300 Money\n` +
            `│ 🚨 Wanted +1\n` +
            `│\n` +
            `├────〔 🏛️ *GRAND BANK* 〕────\n` +
            `│ 🔒 RPG Lv.10+\n` +
            `│ 💵 Reward: 5.000 Money\n` +
            `│ 💸 Gagal: maks. 1.000 Money\n` +
            `│ 🚨 Wanted +2\n` +
            `│\n` +
            `├────〔 👑 *ROYAL BANK* 〕────\n` +
            `│ 🔒 RPG Lv.20+\n` +
            `│ 💵 Reward: 15.000 Money\n` +
            `│ 💸 Gagal: maks. 3.000 Money\n` +
            `│ 🚨 Wanted +3\n` +
            `│\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
            `Gunakan:\n` +
            `*.rampokbank city*\n` +
            `*.rampokbank grand*\n` +
            `*.rampokbank royal*\n\n` +
            `⏳ Setiap percobaan nyata memberi cooldown *12 jam*.`
        },
        {
          quoted: msg
        }
      )
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
      return sock.sendMessage(
        jid,
        {
          text:
            '❌ Tier: *city / grand / royal*.'
        },
        {
          quoted: msg
        }
      )
    }

    if (
      r.reason ===
      'LEVEL_LOW'
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            `${r.tier.icon} *${r.tier.name}*\n\n` +
            `🔒 Butuh RPG *Lv.${r.required}+*.`
        },
        {
          quoted: msg
        }
      )
    }

    if (
      r.reason ===
      'WANTED_MAX'
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            `🚨 Wanted lu sudah *5/5*.\n\n` +
            `Beresin dulu dengan *.payfine*.`
        },
        {
          quoted: msg
        }
      )
    }

    if (
      r.reason ===
      'COOLDOWN'
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            `🏦 Security masih waspada 😭\n\n` +
            `⏳ Heist berikutnya: *${duration(r.cooldown)}*`
        },
        {
          quoted: msg
        }
      )
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

    if (
      r.outcome ===
      'SUCCESS'
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            `╭━━━━〔 🏦 *HEIST SUCCESS* 〕━━━━╮\n` +
            `│\n` +
            `│ ${r.tier.icon} *${r.tier.name}*\n` +
            `│\n` +
            `│ ${r.scenario}\n` +
            `│\n` +
            `├──────〔 💰 *HASIL* 〕──────\n` +
            `│ 💵 +${num(r.reward)} Money\n` +
            `│ 🚨 Wanted: *${r.wanted}/5*\n` +
            `│ 💼 Wallet: *${num(r.money)}*\n` +
            `│\n` +
            `│ ⏳ Cooldown: *12 jam*\n` +
            `│\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━╯`
        },
        {
          quoted: msg
        }
      )
    }

    return sock.sendMessage(
      jid,
      {
        text:
          `╭━━━━〔 🚨 *HEIST FAILED* 〕━━━━╮\n` +
          `│\n` +
          `│ ${r.tier.icon} *${r.tier.name}*\n` +
          `│\n` +
          `│ ${r.scenario}\n` +
          `│\n` +
          `│ ⚔️ Heist Power: *${r.power}*\n` +
          `│ 💸 Denda: *${num(r.penalty)} Money*\n` +
          `│ 🚨 Wanted: *${r.wanted}/5*\n` +
          `│ 💼 Wallet: *${num(r.money)}*\n` +
          `│\n` +
          `│ 🏦 Bank pribadi tetap aman 🔐\n` +
          `│ ⏳ Cooldown: *12 jam*\n` +
          `│\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━━╯`
      },
      {
        quoted: msg
      }
    )
  }
}
