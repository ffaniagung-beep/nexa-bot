import fs from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import {
  ensureDatabaseDirectory,
  runDatabaseMigrations
} from './dbMigrations.js'

const DB_FILE =
  './database/nexa.sqlite'

const LEGACY_FILE =
  './database/bot.json'

ensureDatabaseDirectory(
  DB_FILE
)

const db =
  new DatabaseSync(
    DB_FILE,
    {
      timeout: 10000
    }
  )

db.exec(`
  PRAGMA busy_timeout = 10000;
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
`)

runDatabaseMigrations(
  db
)

const DEFAULTS = {
  prefix: '.',
  antiSpam: true,
  rejectCall: true,
  callMode: 'warn',
  antiLink: false,
  spam: {
    max: 5,
    windowMs: 8000,
    cooldownMs: 15000
  }
}

function cleanBotId(
  value
) {
  const id =
    String(value || '')
      .trim()

  return id || 'main'
}

export function getCurrentBotId() {
  return cleanBotId(
    process.env
      .NEXA_BOT_ID ||
    'main'
  )
}

function ensureBotRow(
  botId = getCurrentBotId()
) {
  const id =
    cleanBotId(botId)

  db.prepare(`
    INSERT OR IGNORE INTO bot_settings (
      bot_id,
      prefix,
      anti_spam,
      reject_call,
      call_mode,
      anti_link,
      spam_max,
      spam_window_ms,
      spam_cooldown_ms,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    DEFAULTS.prefix,
    DEFAULTS.antiSpam ? 1 : 0,
    DEFAULTS.rejectCall ? 1 : 0,
    DEFAULTS.callMode,
    DEFAULTS.antiLink ? 1 : 0,
    DEFAULTS.spam.max,
    DEFAULTS.spam.windowMs,
    DEFAULTS.spam.cooldownMs,
    Date.now()
  )

  return id
}

function parseLegacyFile() {
  try {
    if (!fs.existsSync(
      LEGACY_FILE
    )) {
      return {}
    }

    const data =
      JSON.parse(
        fs.readFileSync(
          LEGACY_FILE,
          'utf8'
        )
      )

    return (
      data &&
      typeof data === 'object' &&
      !Array.isArray(data)
        ? data
        : {}
    )
  } catch {
    return {}
  }
}

function hasLegacyAntiLinkEnabled() {
  try {
    const table =
      db.prepare(`
        SELECT 1 AS ok
        FROM sqlite_master
        WHERE type = 'table'
          AND name = 'group_configs'
        LIMIT 1
      `).get()

    if (!table?.ok) {
      return false
    }

    const row =
      db.prepare(`
        SELECT 1 AS enabled
        FROM group_configs
        WHERE anti_link = 1
        LIMIT 1
      `).get()

    return Boolean(
      row?.enabled
    )
  } catch {
    return false
  }
}

function migrateLegacyBotJsonOnce() {
  const migrationKey =
    'legacy_bot_json_v1'

  const done =
    db.prepare(`
      SELECT value
      FROM core_settings_meta
      WHERE key = ?
    `).get(
      migrationKey
    )

  if (done) {
    return
  }

  db.exec(
    'BEGIN IMMEDIATE'
  )

  try {
    const recheck =
      db.prepare(`
        SELECT value
        FROM core_settings_meta
        WHERE key = ?
      `).get(
        migrationKey
      )

    if (recheck) {
      db.exec('COMMIT')
      return
    }

    const legacy =
      parseLegacyFile()

    const mainId =
      ensureBotRow('main')

    const current =
      db.prepare(`
        SELECT *
        FROM bot_settings
        WHERE bot_id = ?
      `).get(
        mainId
      )

    const prefix =
      String(
        legacy.prefix ||
        current?.prefix ||
        DEFAULTS.prefix
      ).trim() ||
      DEFAULTS.prefix

    const antiSpam =
      legacy.antiSpam ??
      Boolean(
        current?.anti_spam
      )

    const rejectCall =
      legacy.rejectCall ??
      Boolean(
        current?.reject_call
      )

    const callMode =
      ['warn', 'block']
        .includes(
          String(
            legacy.callMode ||
            current?.call_mode ||
            DEFAULTS.callMode
          )
        )
        ? String(
            legacy.callMode ||
            current?.call_mode ||
            DEFAULTS.callMode
          )
        : DEFAULTS.callMode

    const antiLink =
      hasLegacyAntiLinkEnabled()

    const spamMax =
      Math.max(
        1,
        Math.trunc(
          Number(
            legacy.spam?.max ??
            current?.spam_max ??
            DEFAULTS.spam.max
          ) ||
          DEFAULTS.spam.max
        )
      )

    const spamWindowMs =
      Math.max(
        1000,
        Math.trunc(
          Number(
            legacy.spam?.windowMs ??
            current?.spam_window_ms ??
            DEFAULTS.spam.windowMs
          ) ||
          DEFAULTS.spam.windowMs
        )
      )

    const spamCooldownMs =
      Math.max(
        1000,
        Math.trunc(
          Number(
            legacy.spam?.cooldownMs ??
            current?.spam_cooldown_ms ??
            DEFAULTS.spam.cooldownMs
          ) ||
          DEFAULTS.spam.cooldownMs
        )
      )

    db.prepare(`
      UPDATE bot_settings
      SET
        prefix = ?,
        anti_spam = ?,
        reject_call = ?,
        call_mode = ?,
        anti_link = ?,
        spam_max = ?,
        spam_window_ms = ?,
        spam_cooldown_ms = ?,
        updated_at = ?
      WHERE bot_id = ?
    `).run(
      prefix,
      antiSpam ? 1 : 0,
      rejectCall ? 1 : 0,
      callMode,
      antiLink ? 1 : 0,
      spamMax,
      spamWindowMs,
      spamCooldownMs,
      Date.now(),
      mainId
    )

    if (
      legacy.maintenance &&
      typeof legacy.maintenance ===
        'object'
    ) {
      db.prepare(`
        INSERT INTO global_settings (
          key,
          value,
          updated_at
        )
        VALUES (?, ?, ?)
        ON CONFLICT(key)
        DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `).run(
        'maintenance',
        JSON.stringify(
          legacy.maintenance
        ),
        Date.now()
      )
    }

    db.prepare(`
      INSERT INTO core_settings_meta (
        key,
        value
      )
      VALUES (?, ?)
    `).run(
      migrationKey,
      String(Date.now())
    )

    db.exec('COMMIT')
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {}

    throw error
  }
}

migrateLegacyBotJsonOnce()

function rowToBotDB(
  row
) {
  if (!row) {
    return {
      ...DEFAULTS,
      spam: {
        ...DEFAULTS.spam
      }
    }
  }

  return {
    prefix:
      String(
        row.prefix ||
        DEFAULTS.prefix
      ),

    antiSpam:
      Boolean(
        row.anti_spam
      ),

    rejectCall:
      Boolean(
        row.reject_call
      ),

    callMode:
      ['warn', 'block']
        .includes(
          String(
            row.call_mode || ''
          )
        )
        ? String(
            row.call_mode
          )
        : DEFAULTS.callMode,

    antiLink:
      Boolean(
        row.anti_link
      ),

    spam: {
      max:
        Math.max(
          1,
          Number(
            row.spam_max
          ) ||
          DEFAULTS.spam.max
        ),

      windowMs:
        Math.max(
          1000,
          Number(
            row.spam_window_ms
          ) ||
          DEFAULTS.spam.windowMs
        ),

      cooldownMs:
        Math.max(
          1000,
          Number(
            row.spam_cooldown_ms
          ) ||
          DEFAULTS.spam.cooldownMs
        )
    }
  }
}

export function getBotDB(
  botId = getCurrentBotId()
) {
  const id =
    ensureBotRow(botId)

  const row =
    db.prepare(`
      SELECT *
      FROM bot_settings
      WHERE bot_id = ?
    `).get(
      id
    )

  return rowToBotDB(
    row
  )
}

export function updateBotDB(
  changes,
  botId = getCurrentBotId()
) {
  const id =
    ensureBotRow(botId)

  const current =
    getBotDB(id)

  const next = {
    ...current,
    ...(changes || {}),
    spam: {
      ...current.spam,
      ...(
        changes?.spam ||
        {}
      )
    }
  }

  const prefix =
    String(
      next.prefix ||
      DEFAULTS.prefix
    ).trim() ||
    DEFAULTS.prefix

  const callMode =
    ['warn', 'block']
      .includes(
        String(
          next.callMode || ''
        )
      )
      ? String(next.callMode)
      : DEFAULTS.callMode

  db.prepare(`
    UPDATE bot_settings
    SET
      prefix = ?,
      anti_spam = ?,
      reject_call = ?,
      call_mode = ?,
      anti_link = ?,
      spam_max = ?,
      spam_window_ms = ?,
      spam_cooldown_ms = ?,
      updated_at = ?
    WHERE bot_id = ?
  `).run(
    prefix,
    next.antiSpam ? 1 : 0,
    next.rejectCall ? 1 : 0,
    callMode,
    next.antiLink ? 1 : 0,
    Math.max(
      1,
      Math.trunc(
        Number(
          next.spam?.max
        ) ||
        DEFAULTS.spam.max
      )
    ),
    Math.max(
      1000,
      Math.trunc(
        Number(
          next.spam?.windowMs
        ) ||
        DEFAULTS.spam.windowMs
      )
    ),
    Math.max(
      1000,
      Math.trunc(
        Number(
          next.spam?.cooldownMs
        ) ||
        DEFAULTS.spam.cooldownMs
      )
    ),
    Date.now(),
    id
  )

  return getBotDB(id)
}

export function getGlobalSetting(
  key,
  fallback = null
) {
  const clean =
    String(key || '')
      .trim()

  if (!clean) {
    return fallback
  }

  const row =
    db.prepare(`
      SELECT value
      FROM global_settings
      WHERE key = ?
    `).get(
      clean
    )

  if (!row) {
    return fallback
  }

  try {
    return JSON.parse(
      String(row.value)
    )
  } catch {
    return row.value ??
      fallback
  }
}

export function setGlobalSetting(
  key,
  value
) {
  const clean =
    String(key || '')
      .trim()

  if (!clean) {
    throw new Error(
      'INVALID_GLOBAL_SETTING_KEY'
    )
  }

  db.prepare(`
    INSERT INTO global_settings (
      key,
      value,
      updated_at
    )
    VALUES (?, ?, ?)
    ON CONFLICT(key)
    DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(
    clean,
    JSON.stringify(value),
    Date.now()
  )

  return value
}
