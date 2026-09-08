import {
  DatabaseSync
} from 'node:sqlite'

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

export default {
  name: 'resetcd',

  aliases: [
    'resetcooldown'
  ],

  category: 'OWNER',

  ownerOnly: true,

  menuHidden: true,

  description:
    'Reset cooldown RPG untuk testing Owner',

  usage:
    '.resetcd <rest/maling/heist/all>',

  async run({
    sock,
    msg,
    jid,
    args
  }) {
    const action =
      String(
        args?.[0] || ''
      )
        .trim()
        .toLowerCase()

    if (
      ![
        'rest',
        'maling',
        'heist',
        'all'
      ].includes(
        action
      )
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            `🧪 *OWNER RPG DEV*\n\n` +
            `*.resetcd rest*\n` +
            `*.resetcd maling*\n` +
            `*.resetcd heist*\n` +
            `*.resetcd all*`
        },
        {
          quoted: msg
        }
      )
    }

    const userJid =
      await resolveProfileJid(
        sock,
        msg,
        jid
      )

    const playerId =
      resolvePlayerId(
        userJid,
        false
      )

    if (!playerId) {
      return sock.sendMessage(
        jid,
        {
          text:
            '❌ Player Owner belum ditemukan di database.'
        },
        {
          quoted: msg
        }
      )
    }

    let changes = 0

    if (
      action === 'rest' ||
      action === 'all'
    ) {
      const r =
        db.prepare(`
          DELETE FROM rpg_cooldowns
          WHERE player_id = ?
            AND action = 'rest'
        `).run(
          playerId
        )

      changes +=
        Number(
          r.changes
        ) || 0
    }

    if (
      action === 'heist' ||
      action === 'all'
    ) {
      const r =
        db.prepare(`
          DELETE FROM rpg_cooldowns
          WHERE player_id = ?
            AND action =
              'bank_heist_global'
        `).run(
          playerId
        )

      changes +=
        Number(
          r.changes
        ) || 0
    }

    if (
      action === 'maling' ||
      action === 'all'
    ) {
      const global =
        db.prepare(`
          DELETE FROM rpg_cooldowns
          WHERE player_id = ?
            AND action =
              'maling_global'
        `).run(
          playerId
        )

      const targets =
        db.prepare(`
          DELETE FROM rpg_cooldowns
          WHERE player_id = ?
            AND action LIKE
              'maling_target:%'
        `).run(
          playerId
        )

      changes +=
        (
          Number(
            global.changes
          ) || 0
        ) +
        (
          Number(
            targets.changes
          ) || 0
        )
    }

    return sock.sendMessage(
      jid,
      {
        text:
          `🧪 *RPG DEV COOLDOWN RESET*\n\n` +
          `🔧 Target: *${action}*\n` +
          `🗑️ Cooldown dihapus: *${changes}*\n\n` +
          `✅ Data Money, EXP, Wanted,\n` +
          `item dan equipment tidak berubah.`
      },
      {
        quoted: msg
      }
    )
  }
}
