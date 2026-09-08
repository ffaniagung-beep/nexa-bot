import fs from 'fs'

const DB = './database/groups.json'

function ensureDB() {
  if (!fs.existsSync('./database')) {
    fs.mkdirSync('./database', {
      recursive: true
    })
  }

  if (!fs.existsSync(DB)) {
    fs.writeFileSync(
      DB,
      '{}'
    )
  }
}

export function readGroups() {
  ensureDB()

  try {
    return JSON.parse(
      fs.readFileSync(
        DB,
        'utf8'
      )
    )
  } catch {
    return {}
  }
}

export function saveGroups(data) {
  ensureDB()

  fs.writeFileSync(
    DB,
    JSON.stringify(
      data,
      null,
      2
    )
  )
}

export function getGroupConfig(jid) {
  const db = readGroups()

  db[jid] ??= {}

  return db[jid]
}

export function updateGroupConfig(
  jid,
  changes
) {
  const db = readGroups()

  db[jid] ??= {}

  db[jid] = {
    ...db[jid],
    ...changes
  }

  saveGroups(db)

  return db[jid]
}

// ===============================
// WARNING SYSTEM
// ===============================

export function getWarning(
  groupJid,
  userJid
) {
  const db = readGroups()

  return (
    db[groupJid]
      ?.warnings
      ?.[userJid] || 0
  )
}

export function addWarning(
  groupJid,
  userJid
) {
  const db = readGroups()

  db[groupJid] ??= {}
  db[groupJid].warnings ??= {}

  const current =
    db[groupJid]
      .warnings[userJid] || 0

  const count =
    current + 1

  db[groupJid]
    .warnings[userJid] =
    count

  saveGroups(db)

  return count
}

export function resetWarning(
  groupJid,
  userJid
) {
  const db = readGroups()

  if (
    db[groupJid]
      ?.warnings
      ?.[userJid] !== undefined
  ) {
    delete db[groupJid]
      .warnings[userJid]

    saveGroups(db)
  }

  return 0
}
