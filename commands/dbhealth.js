import fs from 'fs'

import {
  databaseHealth,
  listPlayers
} from '../lib/playerdb.js'

// =====================================
// FORMAT SIZE
// =====================================

function formatBytes(bytes) {
  const value =
    Number(bytes) || 0

  if (value < 1024) {
    return `${value} B`
  }

  if (
    value <
    1024 * 1024
  ) {
    return (
      `${(
        value /
        1024
      ).toFixed(1)} KB`
    )
  }

  return (
    `${(
      value /
      1024 /
      1024
    ).toFixed(2)} MB`
  )
}

// =====================================
// COMMAND
// =====================================

export default {
  name: 'dbhealth',

  aliases: [
    'dbcheck',
    'sqlhealth'
  ],

  category: 'OWNER',

  ownerOnly: true,

  description:
    'Mengecek kesehatan database player NEXA',

  usage:
    '.dbhealth',

  async run({
    sock,
    msg,
    jid
  }) {
    const health =
      databaseHealth()

    const players =
      listPlayers()

    const registered =
      players.filter(
        user =>
          Boolean(
            user.registeredAt
          )
      ).length

    const premium =
      players.filter(
        user =>
          user.premium &&
          Number(
            user.premiumUntil
          ) >
            Date.now()
      ).length

    const banned =
      players.filter(
        user =>
          user.banned
      ).length

    let dbSize = 0

    try {
      dbSize =
        fs.statSync(
          './database/nexa.sqlite'
        ).size
    } catch {}

    const status =
      health.ok
        ? 'SEHAT ✅'
        : 'BERMASALAH ❌'

    const text =
      `╭─「 *DATABASE HEALTH* 」\n` +
      `│\n` +
      `│ 🩺 Status     : *${status}*\n` +
      `│ 💾 Engine     : *SQLite*\n` +
      `│ 📦 Size       : *${formatBytes(dbSize)}*\n` +
      `│\n` +
      `│ 👥 Players    : *${health.players}*\n` +
      `│ 🔗 Identities : *${health.identities}*\n` +
      `│ ✅ Registered : *${registered}*\n` +
      `│ ⭐ Premium    : *${premium}*\n` +
      `│ 🚫 Banned     : *${banned}*\n` +
      `│\n` +
      `│ 🧪 Integrity  : *${health.integrity}*\n` +
      `│ 🔑 FK Errors  : *${health.foreignKeyErrors}*\n` +
      `│\n` +
      `╰──────────────\n` +
      (
        health.ok
          ? `⚡ *NEXA Database V2 normal.*`
          : `⚠️ *Cek database sebelum lanjut menjalankan bot.*`
      )

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
