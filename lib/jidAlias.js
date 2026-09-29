import fs from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import {
  ensureDatabaseDirectory,
  runDatabaseMigrations
} from './dbMigrations.js'

const DB_FILE = './database/nexa.sqlite'
const LEGACY_FILE = './database/jidmap.json'
const MIGRATION_KEY = 'legacy_jidmap_json_v2'

ensureDatabaseDirectory(DB_FILE)

const db = new DatabaseSync(DB_FILE, { timeout: 10000 })

db.exec(`
  PRAGMA busy_timeout = 10000;
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
`)

runDatabaseMigrations(db)

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

function validPair(lid, pn) {
  return (
    lid.endsWith('@lid') &&
    pn.endsWith('@s.whatsapp.net')
  )
}

function migrateLegacyOnce() {
  const done = db.prepare(`
    SELECT value
    FROM core_settings_meta
    WHERE key = ?
  `).get(MIGRATION_KEY)

  if (done) return

  let legacy = {}

  try {
    if (fs.existsSync(LEGACY_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(LEGACY_FILE, 'utf8'))
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        legacy = parsed
      }
    }
  } catch {
    legacy = {}
  }

  db.exec('BEGIN IMMEDIATE')

  try {
    const recheck = db.prepare(`
      SELECT value
      FROM core_settings_meta
      WHERE key = ?
    `).get(MIGRATION_KEY)

    if (!recheck) {
      const upsert = db.prepare(`
        INSERT INTO jid_aliases (lid, pn, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(lid) DO UPDATE SET
          pn = excluded.pn,
          updated_at = excluded.updated_at
      `)

      const timestamp = Date.now()

      for (const [lidRaw, pnRaw] of Object.entries(legacy)) {
        const lid = normalize(lidRaw)
        const pn = normalize(pnRaw)
        if (!validPair(lid, pn)) continue
        upsert.run(lid, pn, timestamp)
      }

      db.prepare(`
        INSERT OR REPLACE INTO core_settings_meta (key, value)
        VALUES (?, ?)
      `).run(MIGRATION_KEY, String(Date.now()))
    }

    db.exec('COMMIT')
  } catch (error) {
    try { db.exec('ROLLBACK') } catch {}
    throw error
  }
}

migrateLegacyOnce()

export function rememberJidAlias(lidValue, pnValue) {
  const lid = normalize(lidValue)
  const pn = normalize(pnValue)

  if (!validPair(lid, pn)) return false

  db.prepare(`
    INSERT INTO jid_aliases (lid, pn, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(lid) DO UPDATE SET
      pn = excluded.pn,
      updated_at = excluded.updated_at
  `).run(lid, pn, Date.now())

  return true
}

export function getPnForLid(lidValue) {
  const lid = normalize(lidValue)
  if (!lid.endsWith('@lid')) return null

  const pn = db.prepare(`
    SELECT pn
    FROM jid_aliases
    WHERE lid = ?
  `).get(lid)?.pn

  const clean = normalize(pn)
  return clean.endsWith('@s.whatsapp.net') ? clean : null
}

export function getLidsForPn(pnValue) {
  const pn = normalize(pnValue)
  if (!pn.endsWith('@s.whatsapp.net')) return []

  return db.prepare(`
    SELECT lid
    FROM jid_aliases
    WHERE pn = ?
    ORDER BY lid ASC
  `).all(pn)
    .map(row => normalize(row.lid))
    .filter(lid => lid.endsWith('@lid'))
}
