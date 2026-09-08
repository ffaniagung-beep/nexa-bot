import {
  getOwnerTarget,
  userStats,
  formatNumber,
  formatDate
} from '../lib/ownerTools.js'

import {
  getEconomyLog
} from '../lib/playerdb.js'

// =====================================
// FORMAT
// =====================================

const METRIC_INFO = {
  coin: {
    icon: '🪙',
    name: 'Coin'
  },

  exp: {
    icon: '✨',
    name: 'EXP'
  },

  level: {
    icon: '🧬',
    name: 'Level'
  },

  limit: {
    icon: '🎟',
    name: 'Limit'
  }
}

function formatDelta(value) {
  const number =
    Number(value) || 0

  const sign =
    number >= 0
      ? '+'
      : '-'

  return (
    sign +
    formatNumber(
      Math.abs(number)
    )
  )
}

function cleanReason(value) {
  const reason =
    String(
      value || 'update'
    )

  const names = {
    addCoin:
      'Tambah Coin',

    spendCoin:
      'Pakai Coin',

    addExp:
      'Tambah EXP',

    addLimit:
      'Tambah Limit',

    useLimit:
      'Pakai Limit',

    updateUser:
      'Update Data'
  }

  return (
    names[reason] ||
    reason
  )
}

// =====================================
// COMMAND
// =====================================

export default {
  name: 'economylog',

  aliases: [
    'ledger',
    'txlog'
  ],

  category: 'OWNER',

  ownerOnly: true,

  description:
    'Melihat riwayat ekonomi player',

  usage:
    '.economylog @user',

  async run({
    sock,
    msg,
    jid
  }) {
    const target =
      getOwnerTarget(msg)

    if (!target) {
      return sock.sendMessage(
        jid,
        {
          text:
            '👑 Reply / mention player yang mau dicek.'
        },
        {
          quoted: msg
        }
      )
    }

    const user =
      userStats(
        target
      )

    const logs =
      getEconomyLog(
        target,
        15
      )

    if (!logs.length) {
      return sock.sendMessage(
        jid,
        {
          text:
            `╭─「 *ECONOMY LOG* 」\n` +
            `│\n` +
            `│ 👤 Player: *${user.name || '-'}*\n` +
            `│\n` +
            `│ Belum ada transaksi ekonomi.\n` +
            `│\n` +
            `╰──────────────`
        },
        {
          quoted: msg
        }
      )
    }

    let text =
      `╭─「 *ECONOMY LOG* 」\n` +
      `│\n` +
      `│ 👤 Player : *${user.name || '-'}*\n` +
      `│ 🪙 Coin   : *${formatNumber(user.coin)}*\n` +
      `│ 🧬 Level  : *${formatNumber(user.level)}*\n` +
      `│ ✨ EXP    : *${formatNumber(user.exp)}*\n` +
      `│ 🎟 Limit  : *${formatNumber(user.limit)}*\n` +
      `│\n`

    for (
      const entry
      of logs
    ) {
      const info =
        METRIC_INFO[
          entry.metric
        ] || {
          icon: '•',
          name:
            entry.metric
        }

      text +=
        `│ ${info.icon} *${info.name}* ` +
        `${formatDelta(entry.delta)}\n` +

        `│    Saldo: *${formatNumber(entry.balanceAfter)}*\n` +

        `│    ${cleanReason(entry.reason)}\n` +

        `│    ${formatDate(entry.createdAt)}\n` +
        `│\n`
    }

    text +=
      `╰──────────────\n` +
      `📒 Menampilkan ${logs.length} transaksi terbaru.`

    await sock.sendMessage(
      jid,
      {
        text
      },
      {
        quoted: msg
      }
    )
  }
}
