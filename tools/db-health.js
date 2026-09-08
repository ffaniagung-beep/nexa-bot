import fs from 'fs'
import {
  DatabaseSync
} from 'node:sqlite'

const DB_FILE =
  './database/nexa.sqlite'

const MAP_FILE =
  './database/jidmap.json'

const db =
  new DatabaseSync(
    DB_FILE
  )

db.exec(`
  PRAGMA foreign_keys = ON;
`)

function count(sql) {
  return Number(
    db.prepare(sql)
      .get()
      ?.n || 0
  )
}

const integrity =
  db.prepare(
    'PRAGMA integrity_check'
  )
    .get()
    ?.integrity_check

const foreignKeyErrors =
  db.prepare(
    'PRAGMA foreign_key_check'
  )
    .all()
    .length

const players =
  count(`
    SELECT COUNT(*) AS n
    FROM players
  `)

const identities =
  count(`
    SELECT COUNT(*) AS n
    FROM identities
  `)

const registered =
  count(`
    SELECT COUNT(*) AS n
    FROM players
    WHERE registered_at IS NOT NULL
  `)

const invalidRegistered =
  count(`
    SELECT COUNT(*) AS n
    FROM players

    WHERE
      registered_at IS NOT NULL

      AND (
        name IS NULL
        OR TRIM(name) = ''
        OR age IS NULL
        OR age <= 0
      )
  `)

const groupIdentities =
  count(`
    SELECT COUNT(*) AS n
    FROM identities
    WHERE jid LIKE '%@g.us'
  `)

const orphanIdentities =
  count(`
    SELECT COUNT(*) AS n

    FROM identities i

    LEFT JOIN players p
      ON p.id = i.player_id

    WHERE p.id IS NULL
  `)

const orphanPlayers =
  count(`
    SELECT COUNT(*) AS n

    FROM players p

    LEFT JOIN identities i
      ON i.player_id = p.id

    WHERE i.jid IS NULL
  `)

// =====================================
// CEK LID/PN MAPPING YANG TERBELAH
// =====================================

let splitMappings = 0

try {
  const map =
    JSON.parse(
      fs.readFileSync(
        MAP_FILE,
        'utf8'
      )
    )

  const stmt =
    db.prepare(`
      SELECT player_id
      FROM identities
      WHERE jid = ?
    `)

  for (
    const [lidRaw, pnRaw]
    of Object.entries(map)
  ) {
    const lid =
      String(lidRaw)
        .trim()
        .toLowerCase()

    const pn =
      String(pnRaw)
        .trim()
        .toLowerCase()

    const lidPlayer =
      stmt.get(lid)
        ?.player_id

    const pnPlayer =
      stmt.get(pn)
        ?.player_id

    if (
      lidPlayer &&
      pnPlayer &&
      lidPlayer !==
        pnPlayer
    ) {
      splitMappings++
    }
  }
} catch {
  // jidmap kosong/tidak ada bukan
  // kerusakan SQLite.
}

const ok =
  integrity === 'ok' &&
  foreignKeyErrors === 0 &&
  invalidRegistered === 0 &&
  groupIdentities === 0 &&
  orphanIdentities === 0 &&
  orphanPlayers === 0 &&
  splitMappings === 0

console.log(
  '╔════════════════════════════╗'
)

console.log(
  '║   NEXA DATABASE HEALTH    ║'
)

console.log(
  '╚════════════════════════════╝'
)

console.log('')

console.log(
  'Integrity          :',
  integrity
)

console.log(
  'Foreign key errors :',
  foreignKeyErrors
)

console.log(
  'Players            :',
  players
)

console.log(
  'Identities         :',
  identities
)

console.log(
  'Registered         :',
  registered
)

console.log(
  'Invalid registered :',
  invalidRegistered
)

console.log(
  '@g.us identities   :',
  groupIdentities
)

console.log(
  'Orphan identities  :',
  orphanIdentities
)

console.log(
  'Orphan players     :',
  orphanPlayers
)

console.log(
  'Split LID/PN       :',
  splitMappings
)

console.log('')

if (ok) {
  console.log(
    '✅ DATABASE SEHAT'
  )
} else {
  console.log(
    '❌ DATABASE BERMASALAH'
  )

  process.exitCode = 1
}

db.close()
