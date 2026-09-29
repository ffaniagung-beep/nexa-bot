import {
  DatabaseSync
} from 'node:sqlite'

const DB_FILE =
  './database/nexa.sqlite'

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

const aliases =
  count(`
    SELECT COUNT(*) AS n
    FROM jid_aliases
  `)

const splitMappings =
  count(`
    SELECT COUNT(*) AS n
    FROM jid_aliases a
    JOIN identities lid_i
      ON lid_i.jid = a.lid
    JOIN identities pn_i
      ON pn_i.jid = a.pn
    WHERE lid_i.player_id <> pn_i.player_id
  `)

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
  'LID/PN aliases     :',
  aliases
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
