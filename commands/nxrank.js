// NEXA_INVESTMENT_SOCIAL_V3
import {
  formatNexium,
  getInvestmentLeaderboard
} from '../lib/investment.js'

import {
  prepareInvestmentUser
} from '../lib/investmentUx.js'

function cleanNumber(value) {
  return String(
    value ||
    ''
  )
    .split('@')[0]
    .replace(
      /\D/g,
      ''
    )
}

function buildOwnerJids(
  config,
  {
    isOwner = false,
    currentJid = null,
    sock = null
  } = {}
) {
  const values =
    new Set()

  const owners =
    Array.isArray(
      config?.owner
    )
      ? config.owner
      : []

  for (const owner of owners) {
    const number =
      cleanNumber(
        owner
      )

    if (number) {
      values.add(
        `${number}@s.whatsapp.net`
      )
    }
  }

  const ownerJids =
    Array.isArray(
      config?.ownerJids
    )
      ? config.ownerJids
      : []

  for (
    const ownerJid
    of ownerJids
  ) {
    if (ownerJid) {
      values.add(
        String(ownerJid)
          .trim()
          .toLowerCase()
      )
    }
  }

  if (
    isOwner &&
    currentJid
  ) {
    values.add(
      String(currentJid)
        .trim()
        .toLowerCase()
    )
  }

  for (
    const botJid
    of [
      sock?.user?.id,
      sock?.user?.lid
    ]
  ) {
    if (botJid) {
      values.add(
        String(botJid)
          .trim()
          .toLowerCase()
      )
    }
  }

  return [
    ...values
  ]
}

function rankIcon(rank) {
  if (rank === 1) {
    return '🥇'
  }

  if (rank === 2) {
    return '🥈'
  }

  if (rank === 3) {
    return '🥉'
  }

  return `#${rank}`
}

export default {
  name:
    'nxrank',

  aliases: [
    'nxleaderboard',
    'nxtop'
  ],

  category:
    'INVESTMENT',

  description:
    'Leaderboard investor Nexa',

  usage:
    '.nxrank',

  async run({
    sock,
    msg,
    jid,
    config,
    isOwner
  }) {
    try {
      const prepared =
        await prepareInvestmentUser({
          sock,
          msg,
          jid,
          isOwner
        })

      const excludeJids =
        buildOwnerJids(
          config,
          {
            isOwner,
            currentJid:
              prepared.userJid,
            sock
          }
        )

      const ranking =
        getInvestmentLeaderboard({
          excludeJids,
          limit: 10
        })

      if (!ranking.length) {
        return sock.sendMessage(
          jid,
          {
            text:
              '🏆 *NEXA • INVESTOR RANK*\n\n' +
              'Belum ada investor yang masuk leaderboard.'
          },
          {
            quoted:
              msg
          }
        )
      }

      const mentions =
        []

      const lines =
        ranking.map(
          item => {
            const isPn =
              String(
                item.jid ||
                ''
              ).endsWith(
                '@s.whatsapp.net'
              )

            const number =
              isPn
                ? cleanNumber(
                    item.jid
                  )
                : ''

            if (
              isPn &&
              item.jid
            ) {
              mentions.push(
                item.jid
              )
            }

            const label =
              number
                ? `@${number}`
                : (
                    item.name ||
                    'Investor'
                  )

            return (
              `${rankIcon(item.rank)} *${label}*\n` +
              `   💰 Net worth: *${formatNexium(item.total)} NX*\n` +
              `   💠 Wallet: ${formatNexium(item.nexium)} NX` +
              ` • 📊 Aset: ${formatNexium(item.portfolio)} NX`
            )
          }
        )

      const text =
        '🏆 *NEXA • INVESTOR RANK*\n' +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        lines.join(
          '\n\n'
        ) +
        '\n\n👑 Owner & akun bot tidak dihitung demi leaderboard yang adil.'

      return sock.sendMessage(
        jid,
        {
          text,
          mentions
        },
        {
          quoted:
            msg
        }
      )
    } catch (error) {
      console.error(
        '[NXRANK]',
        error?.message ||
        error
      )

      return sock.sendMessage(
        jid,
        {
          text:
            '⚠️ *NEXA • INVESTOR RANK*\n\n' +
            'Leaderboard belum berhasil dibuka.'
        },
        {
          quoted:
            msg
        }
      )
    }
  }
}
