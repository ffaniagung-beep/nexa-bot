import fs from 'fs'

const FILE =
  './database/bot.json'

const DEFAULT_MESSAGE =
  `🛠️ *NEXA MAINTENANCE*\n\n` +
  `NEXA-BOT sedang dalam proses maintenance.\n` +
  `Beberapa fitur sementara tidak dapat digunakan.\n\n` +
  `Silakan coba lagi nanti. 🔧`

function ensureFile() {
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
      '{}'
    )
  }
}

function readDB() {
  ensureFile()

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

function saveDB(data) {
  ensureFile()

  fs.writeFileSync(
    FILE,
    JSON.stringify(
      data,
      null,
      2
    )
  )
}

export function getMaintenance() {
  const db =
    readDB()

  const maintenance =
    db.maintenance || {}

  return {
    enabled:
      maintenance.enabled ===
      true,

    message:
      maintenance.message ||
      DEFAULT_MESSAGE,

    updatedAt:
      maintenance.updatedAt ||
      null
  }
}

export function isMaintenance() {
  return (
    getMaintenance()
      .enabled === true
  )
}

export function setMaintenance(
  enabled,
  message = null
) {
  const db =
    readDB()

  const old =
    db.maintenance || {}

  db.maintenance = {
    enabled:
      Boolean(enabled),

    message:
      message?.trim() ||
      old.message ||
      DEFAULT_MESSAGE,

    updatedAt:
      Date.now()
  }

  saveDB(db)

  return db.maintenance
}

export function getMaintenanceMessage() {
  return (
    getMaintenance()
      .message
  )
}
