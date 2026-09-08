import {
  randomUUID
} from 'node:crypto'

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

import {
  RPG_ITEMS
} from '../lib/rpg/items.js'

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

export default {
  name: 'additem',

  aliases: [
    'giveitem'
  ],

  category: 'OWNER',

  ownerOnly: true,
  menuHidden: true,

  description:
    'Menambah item RPG untuk testing',

  usage:
    '.additem [@user] <item_id> [jumlah]',

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

    if (!target) {
      target =
        await resolveProfileJid(
          sock,
          msg,
          jid
        )
    }

    // Cari token yang benar-benar
    // merupakan ID item RPG.
    const itemId =
      values
        .map(
          value =>
            String(value || '')
              .trim()
              .toLowerCase()
        )
        .find(
          value =>
            RPG_ITEMS[value]
        )

    if (!itemId) {
      return sock.sendMessage(
        jid,
        {
          text:
            `🧪 *OWNER RPG DEV ITEM*\n\n` +
            `Diri sendiri:\n` +
            `*.additem dragon_scale 10*\n\n` +
            `User lain:\n` +
            `*.additem @user dragon_scale 10*\n\n` +
            `Contoh gear:\n` +
            `*.additem dragonfang_blade 1*`
        },
        {
          quoted: msg
        }
      )
    }

    const item =
      RPG_ITEMS[
        itemId
      ]

    const itemIndex =
      values.findIndex(
        value =>
          String(value || '')
            .trim()
            .toLowerCase() ===
          itemId
      )

    let amount = 1

    if (
      itemIndex >= 0 &&
      values[
        itemIndex + 1
      ] != null
    ) {
      const parsed =
        Number(
          String(
            values[
              itemIndex + 1
            ]
          )
            .replace(
              /\D/g,
              ''
            )
        )

      if (
        Number.isInteger(
          parsed
        ) &&
        parsed > 0
      ) {
        amount =
          parsed
      }
    }

    const maxAmount =
      item.type === 'gear'
        ? 20
        : 9999

    if (
      amount < 1 ||
      amount > maxAmount
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            `❌ Jumlah tidak valid.\n\n` +
            `Maksimum:\n` +
            `⚔️ Gear: 20\n` +
            `📦 Stack item: 9.999`
        },
        {
          quoted: msg
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
          quoted: msg
        }
      )
    }

    const profile =
      db.prepare(`
        SELECT player_id
        FROM rpg_profiles
        WHERE player_id = ?
      `).get(
        playerId
      )

    if (!profile) {
      return sock.sendMessage(
        jid,
        {
          text:
            '⚔️ Target belum mempunyai profile RPG.'
        },
        {
          quoted: msg
        }
      )
    }

    db.exec(
      'BEGIN IMMEDIATE'
    )

    try {
      const now =
        Date.now()

      const gearCodes = []

      if (
        item.type === 'gear'
      ) {
        const insert =
          db.prepare(`
            INSERT INTO rpg_gear (
              gear_id,
              player_id,
              item_id,
              enchant_level,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, 0, ?, ?)
          `)

        for (
          let i = 0;
          i < amount;
          i++
        ) {
          const gearId =
            randomUUID()

          insert.run(
            gearId,
            playerId,
            item.id,
            now,
            now
          )

          gearCodes.push(
            '#' +
            gearId
              .replace(
                /-/g,
                ''
              )
              .slice(
                0,
                8
              )
              .toUpperCase()
          )
        }
      } else {
        db.prepare(`
          INSERT INTO rpg_inventory (
            player_id,
            item_id,
            quantity,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?)

          ON CONFLICT(
            player_id,
            item_id
          )
          DO UPDATE SET
            quantity =
              rpg_inventory.quantity +
              excluded.quantity,

            updated_at =
              excluded.updated_at
        `).run(
          playerId,
          item.id,
          amount,
          now,
          now
        )
      }

      db.exec(
        'COMMIT'
      )

      const mention =
        `@${String(
          target
        ).split('@')[0]}`

      let extra = ''

      if (
        gearCodes.length
      ) {
        extra =
          `\n│\n` +
          `│ 🔧 Gear code:\n` +
          gearCodes
            .slice(
              0,
              5
            )
            .map(
              code =>
                `│ ${code}`
            )
            .join('\n')

        if (
          gearCodes.length > 5
        ) {
          extra +=
            `\n│ ... +${
              gearCodes.length - 5
            } lainnya`
        }
      }

      return sock.sendMessage(
        jid,
        {
          text:
            `╭━━〔 🧪 *RPG DEV ITEM* 〕━━╮\n` +
            `│\n` +
            `│ 👤 ${mention}\n` +
            `│ ${item.icon} *${item.name}*\n` +
            `│ 📦 +${num(amount)}\n` +
            `│ 🆔 ${item.id}\n` +
            extra +
            `\n│\n` +
            `│ ✅ Database updated\n` +
            `│\n` +
            `╰━━━━━━━━━━━━━━━━╯`,

          mentions: [
            target
          ]
        },
        {
          quoted: msg
        }
      )
    } catch (err) {
      try {
        db.exec(
          'ROLLBACK'
        )
      } catch {}

      console.error(
        '🧪 additem:',
        err
      )

      return sock.sendMessage(
        jid,
        {
          text:
            '❌ Gagal menambah RPG item.'
        },
        {
          quoted: msg
        }
      )
    }
  }
}
