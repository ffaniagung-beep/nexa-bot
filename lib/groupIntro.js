import fs from 'fs'
import path from 'path'

const DB_PATH =
  path.resolve(
    './database/groupIntro.json'
  )

function ensureDatabase() {
  const dir =
    path.dirname(
      DB_PATH
    )

  if (
    !fs.existsSync(
      dir
    )
  ) {
    fs.mkdirSync(
      dir,
      {
        recursive: true
      }
    )
  }

  if (
    !fs.existsSync(
      DB_PATH
    )
  ) {
    fs.writeFileSync(
      DB_PATH,
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
        DB_PATH,
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
    DB_PATH,
    JSON.stringify(
      data,
      null,
      2
    )
  )
}

export function hasIntroduced(
  groupJid
) {
  const db =
    readDatabase()

  return Boolean(
    db[groupJid]
      ?.introduced
  )
}

export function markIntroduced(
  groupJid
) {
  const db =
    readDatabase()

  db[groupJid] = {
    introduced: true,
    introducedAt:
      Date.now()
  }

  saveDatabase(
    db
  )

  return true
}
