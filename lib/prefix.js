import fs from 'fs'
import config from '../config.js'

const FILE =
  './database/bot.json'

// =====================================
// DATABASE
// =====================================

function ensureDatabase() {
  if (
    !fs.existsSync(
      './database'
    )
  ) {
    fs.mkdirSync(
      './database',
      {
        recursive: true
      }
    )
  }

  if (
    !fs.existsSync(FILE)
  ) {
    fs.writeFileSync(
      FILE,
      JSON.stringify(
        {},
        null,
        2
      )
    )
  }
}

function readDatabase() {
  ensureDatabase()

  try {
    return JSON.parse(
      fs.readFileSync(
        FILE,
        'utf8'
      )
    )
  } catch {
    return {}
  }
}

function saveDatabase(
  data
) {
  ensureDatabase()

  fs.writeFileSync(
    FILE,
    JSON.stringify(
      data,
      null,
      2
    )
  )
}

// =====================================
// PREFIX
// =====================================

export function getPrefix() {
  const db =
    readDatabase()

  const stored =
    String(
      db.prefix || ''
    ).trim()

  if (stored) {
    return stored
  }

  return (
    config.prefix ||
    '.'
  )
}

export function setPrefix(
  newPrefix
) {
  const prefix =
    String(
      newPrefix || ''
    ).trim()

  if (!prefix) {
    throw new Error(
      'INVALID_PREFIX'
    )
  }

  const db =
    readDatabase()

  db.prefix =
    prefix

  saveDatabase(db)

  // Update runtime langsung.
  config.prefix =
    prefix

  return prefix
}

// =====================================
// AUTO SYNC SAAT BOT START
// =====================================

const savedPrefix =
  getPrefix()

config.prefix =
  savedPrefix
