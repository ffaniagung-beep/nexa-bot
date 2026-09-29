import fs from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import {
  ensureDatabaseDirectory,
  runDatabaseMigrations
} from './dbMigrations.js'

const DB_FILE = './database/nexa.sqlite'
const LEGACY_FILE = './database/afk.json'
const MIGRATION_KEY = 'legacy_afk_json_v1'

ensureDatabaseDirectory(DB_FILE)

const db = new DatabaseSync(DB_FILE, { timeout: 10000 })

db.exec(`
  PRAGMA busy_timeout = 10000;
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
`)

runDatabaseMigrations(db)

function key(jid) {
  return String(jid || '').trim().toLowerCase()
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
        INSERT INTO afk_status (
          player_jid,
          reason,
          since,
          updated_at
        )
        VALUES (?, ?, ?, ?)
        ON CONFLICT(player_jid) DO UPDATE SET
          reason = excluded.reason,
          since = excluded.since,
          updated_at = excluded.updated_at
      `)

      const now = Date.now()

      for (const [jidRaw, value] of Object.entries(legacy)) {
        const jid = key(jidRaw)
        if (!jid || jid.endsWith('@g.us')) continue

        upsert.run(
          jid,
          String(value?.reason || '').trim() || 'Tidak ada alasan',
          Number(value?.since) || now,
          now
        )
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

export function setAfk(jid, reason = 'Tidak ada alasan') {
  const id = key(jid)
  if (!id) return null

  const data = {
    reason: String(reason || '').trim() || 'Tidak ada alasan',
    since: Date.now()
  }

  db.prepare(`
    INSERT INTO afk_status (
      player_jid,
      reason,
      since,
      updated_at
    )
    VALUES (?, ?, ?, ?)
    ON CONFLICT(player_jid) DO UPDATE SET
      reason = excluded.reason,
      since = excluded.since,
      updated_at = excluded.updated_at
  `).run(id, data.reason, data.since, data.since)

  return data
}

export function getAfk(jid) {
  const id = key(jid)
  if (!id) return null

  const row = db.prepare(`
    SELECT reason, since
    FROM afk_status
    WHERE player_jid = ?
  `).get(id)

  if (!row) return null

  return {
    reason: String(row.reason || '').trim() || 'Tidak ada alasan',
    since: Number(row.since) || 0
  }
}

export function removeAfk(jid) {
  const id = key(jid)
  if (!id) return null

  db.exec('BEGIN IMMEDIATE')

  try {
    const row = db.prepare(`
      SELECT reason, since
      FROM afk_status
      WHERE player_jid = ?
    `).get(id)

    if (!row) {
      db.exec('COMMIT')
      return null
    }

    db.prepare(`
      DELETE FROM afk_status
      WHERE player_jid = ?
    `).run(id)

    db.exec('COMMIT')

    return {
      reason: String(row.reason || '').trim() || 'Tidak ada alasan',
      since: Number(row.since) || 0
    }
  } catch (error) {
    try { db.exec('ROLLBACK') } catch {}
    throw error
  }
}

export function isAfk(jid) {
  return Boolean(getAfk(jid))
}

export function formatAfkDuration(since) {
  const ms = Math.max(0, Date.now() - Number(since || 0))
  const seconds = Math.floor(ms / 1000)

  if (seconds < 60) return `${seconds} detik`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} menit`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} jam`

  const days = Math.floor(hours / 24)
  return `${days} hari`
}
