import {
  DatabaseSync
} from 'node:sqlite'

import {
  getOwnerTarget
} from '../lib/ownerTools.js'

import {
  resolveProfileJid
} from '../lib/profile.js'

import {
  resolvePlayerId
} from '../lib/playerdb.js'

const db =
  new DatabaseSync(
    './database/nexa.sqlite',
    {
      timeout: 5000
    }
  )

function num(
  value
) {
  return Number(
    value || 0
  ).toLocaleString(
    'id-ID'
  )
}

function parseAmount(
  value
) {
  let raw =
    String(value || '')
      .trim()
      .toLowerCase()

  if (!raw) {
    return null
  }

  let multiplier = 1

  if (
    raw.endsWith('k')
  ) {
    multiplier = 1000
    raw =
      raw.slice(0, -1)
  } else if (
    raw.endsWith('m')
  ) {
    multiplier = 1000000
    raw =
      raw.slice(0, -1)
  }

  raw =
    raw.replace(
      /[.,_\s]/g,
      ''
    )

  const base =
    Number(raw)

  const amount =
    Math.trunc(
      base *
      multiplier
    )

  if (
    !Number.isSafeInteger(
      amount
    ) ||
    amount <= 0 ||
    amount > 1000000000
  ) {
    return null
  }

  return amount
}

export default {
  name:
    'addmoney',

  aliases: [
    'addrpgmoney'
  ],

  category:
    'OWNER',

  ownerOnly:
    true,

  menuHidden:
    true,

  description:
    'Menambah RPG Money untuk testing',

  usage:
    '.addmoney [@user] <jumlah>',

  async run({
    sock,
    msg,
    jid,
    args
  }) {
    const values =
      Array.isArray(args)
        ? args
        : []

    let target =
      getOwnerTarget(
        msg
      )

    // Kalau tidak mention/reply,
    // target = Owner sendiri.
    if (!target) {
      target =
        await resolveProfileJid(
          sock,
          msg,
          jid
        )
    }

    const rawAmount =
      values[
        values.length - 1
      ]

    const amount =
      parseAmount(
        rawAmount
      )

    if (!amount) {
      return sock.sendMessage(
        jid,
        {
          text:
            `🧪 *OWNER RPG DEV*\n\n` +
            `Tambah ke diri sendiri:\n` +
            `*.addmoney 100k*\n\n` +
            `Tambah ke user:\n` +
            `*.addmoney @user 50000*\n\n` +
            `Shortcut:\n` +
            `• 100k = 100.000\n` +
            `• 1m = 1.000.000`
        },
        {
          quoted:
            msg
        }
      )
    }

    const playerId =
      resolvePlayerId(
        target,
        false
      )

    if (!playerId) {
      return sock.sendMessage(
        jid,
        {
          text:
            '❌ Target belum terdaftar di database NEXA.'
        },
        {
          quoted:
            msg
        }
      )
    }

    db.exec(
      'BEGIN IMMEDIATE'
    )

    try {
      const row =
        db.prepare(`
          SELECT
            money,
            bank_money
          FROM rpg_profiles
          WHERE player_id = ?
        `).get(
          playerId
        )

      if (!row) {
        db.exec(
          'ROLLBACK'
        )

        return sock.sendMessage(
          jid,
          {
            text:
              '⚔️ Target belum mempunyai profile RPG.'
          },
          {
            quoted:
              msg
          }
        )
      }

      const oldMoney =
        Number(
          row.money
        ) || 0

      const newMoney =
        oldMoney +
        amount

      if (
        !Number.isSafeInteger(
          newMoney
        )
      ) {
        db.exec(
          'ROLLBACK'
        )

        return sock.sendMessage(
          jid,
          {
            text:
              '❌ Saldo hasil terlalu besar.'
          },
          {
            quoted:
              msg
          }
        )
      }

      const now =
        Date.now()

      db.prepare(`
        UPDATE rpg_profiles
        SET
          money = ?,
          updated_at = ?
        WHERE player_id = ?
      `).run(
        newMoney,
        now,
        playerId
      )

      db.prepare(`
        INSERT INTO rpg_transactions (
          player_id,
          wallet_delta,
          bank_delta,
          wallet_after,
          bank_after,
          reason,
          note,
          created_at
        )
        VALUES (?, ?, 0, ?, ?, ?, ?, ?)
      `).run(
        playerId,
        amount,
        newMoney,
        Number(
          row.bank_money
        ) || 0,
        'owner_dev_addmoney',
        'Owner RPG testing faucet',
        now
      )

      db.exec(
        'COMMIT'
      )

      const mention =
        `@${String(
          target
        ).split('@')[0]}`

      return sock.sendMessage(
        jid,
        {
          text:
            `╭━━〔 🧪 *RPG DEV MONEY* 〕━━╮\n` +
            `│\n` +
            `│ 👤 ${mention}\n` +
            `│ 💵 +${num(amount)} Money\n` +
            `│\n` +
            `│ ${num(oldMoney)} → *${num(newMoney)}*\n` +
            `│\n` +
            `│ 📒 Transaction logged ✅\n` +
            `│\n` +
            `╰━━━━━━━━━━━━━━━━╯`,

          mentions: [
            target
          ]
        },
        {
          quoted:
            msg
        }
      )
    } catch (err) {
      try {
        db.exec(
          'ROLLBACK'
        )
      } catch {}

      console.error(
        '🧪 addmoney:',
        err
      )

      return sock.sendMessage(
        jid,
        {
          text:
            '❌ Gagal menambah RPG Money.'
        },
        {
          quoted:
            msg
        }
      )
    }
  }
}
