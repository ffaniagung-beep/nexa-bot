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
  RPG_CLASSES
} from '../lib/rpg/core.js'

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

function classStats(
  classId,
  level
) {
  const info =
    RPG_CLASSES[
      classId
    ]

  if (!info) {
    return null
  }

  const extra =
    Math.max(
      0,
      Number(level) - 1
    )

  return {
    maxHp:
      info.hp +
      info.hpGrowth *
      extra,

    maxMana:
      info.mana +
      info.manaGrowth *
      extra,

    attack:
      info.attack +
      info.attackGrowth *
      extra,

    defense:
      info.defense +
      info.defenseGrowth *
      extra
  }
}

function removeLockedGear(
  playerId,
  level,
  classId
) {
  const eq =
    db.prepare(`
      SELECT *
      FROM rpg_equipment
      WHERE player_id = ?
    `).get(
      playerId
    )

  if (!eq) {
    return 0
  }

  const slots = [
    [
      'weapon_gear_id',
      eq.weapon_gear_id
    ],
    [
      'armor_gear_id',
      eq.armor_gear_id
    ],
    [
      'accessory_gear_id',
      eq.accessory_gear_id
    ]
  ]

  let removed = 0

  for (
    const [
      column,
      gearId
    ]
    of slots
  ) {
    if (!gearId) {
      continue
    }

    const gear =
      db.prepare(`
        SELECT item_id
        FROM rpg_gear
        WHERE gear_id = ?
          AND player_id = ?
      `).get(
        gearId,
        playerId
      )

    const item =
      RPG_ITEMS[
        gear?.item_id
      ]

    if (!item) {
      continue
    }

    const locked =
      Number(level) <
        Number(
          item.minLevel || 1
        ) ||
      (
        item.class &&
        item.class !==
          classId
      )

    if (!locked) {
      continue
    }

    db.prepare(`
      UPDATE rpg_equipment
      SET
        ${column} = NULL,
        updated_at = ?
      WHERE player_id = ?
    `).run(
      Date.now(),
      playerId
    )

    removed++
  }

  return removed
}

export default {
  name:
    'setrpglevel',

  aliases: [
    'setrlevel'
  ],

  category:
    'OWNER',

  ownerOnly:
    true,

  menuHidden:
    true,

  description:
    'Set RPG Level untuk testing Owner',

  usage:
    '.setrpglevel [@user] <1-100>',

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

    const level =
      Number(
        String(
          values[
            values.length - 1
          ] || ''
        )
          .replace(
            /\D/g,
            ''
          )
      )

    if (
      !Number.isInteger(
        level
      ) ||
      level < 1 ||
      level > 100
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            `🧪 *OWNER RPG LEVEL*\n\n` +
            `Diri sendiri:\n` +
            `*.setrpglevel 50*\n\n` +
            `User lain:\n` +
            `*.setrpglevel @user 20*\n\n` +
            `Range: *1-100*`
        },
        {
          quoted:
            msg
        }
      )
    }

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
            '❌ Player tidak ditemukan.'
        },
        {
          quoted:
            msg
        }
      )
    }

    const row =
      db.prepare(`
        SELECT *
        FROM rpg_profiles
        WHERE player_id = ?
      `).get(
        playerId
      )

    if (!row) {
      return sock.sendMessage(
        jid,
        {
          text:
            '⚔️ Target belum punya profile RPG.'
        },
        {
          quoted:
            msg
        }
      )
    }

    if (!row.class) {
      return sock.sendMessage(
        jid,
        {
          text:
            '🧬 Target belum memilih Class.'
        },
        {
          quoted:
            msg
        }
      )
    }

    const active =
      db.prepare(`
        SELECT 1
        FROM rpg_battles
        WHERE player_id = ?
      `).get(
        playerId
      )

    if (active) {
      return sock.sendMessage(
        jid,
        {
          text:
            `⚔️ Masih ada battle aktif.\n` +
            `Selesaikan / kabur dulu sebelum ubah level.`
        },
        {
          quoted:
            msg
        }
      )
    }

    const stats =
      classStats(
        row.class,
        level
      )

    if (!stats) {
      return sock.sendMessage(
        jid,
        {
          text:
            '❌ Class RPG tidak valid.'
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
      const now =
        Date.now()

      db.prepare(`
        UPDATE rpg_profiles
        SET
          level = ?,
          exp = 0,

          hp = ?,
          max_hp = ?,

          mana = ?,
          max_mana = ?,

          attack = ?,
          defense = ?,

          updated_at = ?

        WHERE player_id = ?
      `).run(
        level,

        stats.maxHp,
        stats.maxHp,

        stats.maxMana,
        stats.maxMana,

        stats.attack,
        stats.defense,

        now,
        playerId
      )

      const removed =
        removeLockedGear(
          playerId,
          level,
          row.class
        )

      db.exec(
        'COMMIT'
      )

      return sock.sendMessage(
        jid,
        {
          text:
            `╭━━〔 🧪 *RPG LEVEL DEV* 〕━━╮\n` +
            `│\n` +
            `│ ⭐ Lv.${row.level} → *Lv.${level}*\n` +
            `│ 🧬 ${RPG_CLASSES[row.class].name}\n` +
            `│\n` +
            `│ ❤️ HP: ${stats.maxHp}\n` +
            `│ 🔷 Mana: ${stats.maxMana}\n` +
            `│ ⚔️ ATK: ${stats.attack}\n` +
            `│ 🛡 DEF: ${stats.defense}\n` +
            `│\n` +
            `│ ✨ EXP: 0\n` +
            (
              removed
                ? `│ 🔓 Gear dilepas: ${removed}\n`
                : ''
            ) +
            `│\n` +
            `│ ✅ Money/item tidak berubah\n` +
            `╰━━━━━━━━━━━━━━━━╯`
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
        '🧪 setrpglevel:',
        err
      )

      return sock.sendMessage(
        jid,
        {
          text:
            '❌ Gagal mengubah RPG Level.'
        },
        {
          quoted:
            msg
        }
      )
    }
  }
}
