// NEXA GROUPDB SQLITE MULTI-PROCESS V1
import fs from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const DB_DIR =
  './database'

const SQLITE_FILE =
  './database/nexa.sqlite'

const LEGACY_JSON =
  './database/groups.json'

fs.mkdirSync(
  DB_DIR,
  {
    recursive: true
  }
)

const db =
  new DatabaseSync(
    SQLITE_FILE,
    {
      timeout: 10000
    }
  )

db.exec(`
  PRAGMA busy_timeout = 10000;
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;

  CREATE TABLE IF NOT EXISTS group_configs (
    jid TEXT PRIMARY KEY,
    welcome INTEGER NOT NULL DEFAULT 0,
    anti_link INTEGER NOT NULL DEFAULT 0,
    welcome_text TEXT,
    goodbye_text TEXT,
    extra_json TEXT NOT NULL DEFAULT '{}',
    updated_at INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS group_warnings (
    group_jid TEXT NOT NULL,
    user_jid TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (
      group_jid,
      user_jid
    )
  );

  CREATE TABLE IF NOT EXISTS groupdb_meta (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`)

const KNOWN_KEYS =
  new Set([
    'welcome',
    'antiLink',
    'welcomeText',
    'goodbyeText',
    'warnings'
  ])

function cleanJid(
  value
) {
  return String(
    value || ''
  ).trim()
}

function parseExtra(
  value
) {
  try {
    const parsed =
      JSON.parse(
        String(value || '{}')
      )

    return (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed)
        ? parsed
        : {}
    )
  } catch {
    return {}
  }
}

function rowToConfig(
  row
) {
  if (!row) {
    return {}
  }

  return {
    ...parseExtra(
      row.extra_json
    ),

    welcome:
      Boolean(
        row.welcome
      ),

    antiLink:
      Boolean(
        row.anti_link
      ),

    welcomeText:
      row.welcome_text ??
      null,

    goodbyeText:
      row.goodbye_text ??
      null
  }
}

function getConfigRow(
  jid
) {
  return db
    .prepare(`
      SELECT
        jid,
        welcome,
        anti_link,
        welcome_text,
        goodbye_text,
        extra_json,
        updated_at
      FROM group_configs
      WHERE jid = ?
    `)
    .get(jid)
}

function beginImmediate() {
  db.exec(
    'BEGIN IMMEDIATE'
  )
}

function commit() {
  db.exec(
    'COMMIT'
  )
}

function rollback() {
  try {
    db.exec(
      'ROLLBACK'
    )
  } catch {}
}

function upsertConfigFromObject(
  jid,
  value,
  {
    onlyIfMissing = false
  } = {}
) {
  const source =
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
      ? value
      : {}

  const extra = {}

  for (
    const [key, item]
    of Object.entries(source)
  ) {
    if (
      !KNOWN_KEYS.has(key)
    ) {
      extra[key] =
        item
    }
  }

  const params = [
    jid,
    source.welcome
      ? 1
      : 0,
    source.antiLink
      ? 1
      : 0,
    source.welcomeText ??
      null,
    source.goodbyeText ??
      null,
    JSON.stringify(
      extra
    ),
    Date.now()
  ]

  if (onlyIfMissing) {
    db.prepare(`
      INSERT OR IGNORE INTO group_configs (
        jid,
        welcome,
        anti_link,
        welcome_text,
        goodbye_text,
        extra_json,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      ...params
    )

    return
  }

  db.prepare(`
    INSERT INTO group_configs (
      jid,
      welcome,
      anti_link,
      welcome_text,
      goodbye_text,
      extra_json,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)

    ON CONFLICT(jid)
    DO UPDATE SET
      welcome =
        excluded.welcome,
      anti_link =
        excluded.anti_link,
      welcome_text =
        excluded.welcome_text,
      goodbye_text =
        excluded.goodbye_text,
      extra_json =
        excluded.extra_json,
      updated_at =
        excluded.updated_at
  `).run(
    ...params
  )
}

function importLegacyJsonOnce() {
  const done =
    db.prepare(`
      SELECT value
      FROM groupdb_meta
      WHERE key =
        'legacy_groups_json_imported'
    `).get()

  if (done) {
    return
  }

  let legacy = {}

  try {
    legacy =
      JSON.parse(
        fs.readFileSync(
          LEGACY_JSON,
          'utf8'
        )
      )
  } catch {
    legacy = {}
  }

  beginImmediate()

  try {
    const recheck =
      db.prepare(`
        SELECT value
        FROM groupdb_meta
        WHERE key =
          'legacy_groups_json_imported'
      `).get()

    if (recheck) {
      commit()
      return
    }

    if (
      legacy &&
      typeof legacy === 'object' &&
      !Array.isArray(legacy)
    ) {
      for (
        const [
          groupJid,
          value
        ]
        of Object.entries(legacy)
      ) {
        const jid =
          cleanJid(groupJid)

        if (!jid) {
          continue
        }

        upsertConfigFromObject(
          jid,
          value,
          {
            onlyIfMissing: true
          }
        )

        const warnings =
          value?.warnings

        if (
          warnings &&
          typeof warnings === 'object' &&
          !Array.isArray(warnings)
        ) {
          for (
            const [
              userJid,
              rawCount
            ]
            of Object.entries(
              warnings
            )
          ) {
            const user =
              cleanJid(
                userJid
              )

            const count =
              Math.max(
                0,
                Math.trunc(
                  Number(rawCount) ||
                  0
                )
              )

            if (
              !user ||
              !count
            ) {
              continue
            }

            db.prepare(`
              INSERT OR IGNORE INTO
                group_warnings (
                  group_jid,
                  user_jid,
                  count,
                  updated_at
                )
              VALUES (?, ?, ?, ?)
            `).run(
              jid,
              user,
              count,
              Date.now()
            )
          }
        }
      }
    }

    db.prepare(`
      INSERT OR REPLACE INTO
        groupdb_meta (
          key,
          value
        )
      VALUES (
        'legacy_groups_json_imported',
        ?
      )
    `).run(
      String(
        Date.now()
      )
    )

    commit()
  } catch (
    error
  ) {
    rollback()
    throw error
  }
}

importLegacyJsonOnce()

export function readGroups() {
  const result = {}

  const rows =
    db.prepare(`
      SELECT *
      FROM group_configs
      ORDER BY jid
    `).all()

  for (
    const row
    of rows
  ) {
    result[row.jid] =
      rowToConfig(row)
  }

  const warnings =
    db.prepare(`
      SELECT
        group_jid,
        user_jid,
        count
      FROM group_warnings
      WHERE count > 0
    `).all()

  for (
    const row
    of warnings
  ) {
    result[
      row.group_jid
    ] ??= {}

    result[
      row.group_jid
    ].warnings ??= {}

    result[
      row.group_jid
    ].warnings[
      row.user_jid
    ] =
      Number(
        row.count
      ) || 0
  }

  return result
}

export function saveGroups(
  data
) {
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data)
  ) {
    return
  }

  beginImmediate()

  try {
    for (
      const [
        groupJid,
        value
      ]
      of Object.entries(data)
    ) {
      const jid =
        cleanJid(
          groupJid
        )

      if (!jid) {
        continue
      }

      upsertConfigFromObject(
        jid,
        value
      )

      const warnings =
        value?.warnings

      if (
        warnings &&
        typeof warnings === 'object' &&
        !Array.isArray(warnings)
      ) {
        for (
          const [
            userJid,
            rawCount
          ]
          of Object.entries(
            warnings
          )
        ) {
          const user =
            cleanJid(
              userJid
            )

          const count =
            Math.max(
              0,
              Math.trunc(
                Number(rawCount) ||
                0
              )
            )

          if (!user) {
            continue
          }

          if (!count) {
            db.prepare(`
              DELETE FROM group_warnings
              WHERE group_jid = ?
                AND user_jid = ?
            `).run(
              jid,
              user
            )

            continue
          }

          db.prepare(`
            INSERT INTO group_warnings (
              group_jid,
              user_jid,
              count,
              updated_at
            )
            VALUES (?, ?, ?, ?)

            ON CONFLICT(
              group_jid,
              user_jid
            )
            DO UPDATE SET
              count =
                excluded.count,
              updated_at =
                excluded.updated_at
          `).run(
            jid,
            user,
            count,
            Date.now()
          )
        }
      }
    }

    commit()
  } catch (
    error
  ) {
    rollback()
    throw error
  }
}

export function getGroupConfig(
  jid
) {
  const clean =
    cleanJid(jid)

  if (!clean) {
    return {}
  }

  return rowToConfig(
    getConfigRow(
      clean
    )
  )
}

export function updateGroupConfig(
  jid,
  changes
) {
  const clean =
    cleanJid(jid)

  if (!clean) {
    return {}
  }

  const source =
    changes &&
    typeof changes === 'object' &&
    !Array.isArray(changes)
      ? changes
      : {}

  beginImmediate()

  try {
    db.prepare(`
      INSERT OR IGNORE INTO
        group_configs (
          jid,
          updated_at
        )
      VALUES (?, ?)
    `).run(
      clean,
      Date.now()
    )

    const set = []
    const args = []

    if (
      Object.hasOwn(
        source,
        'welcome'
      )
    ) {
      set.push(
        'welcome = ?'
      )

      args.push(
        source.welcome
          ? 1
          : 0
      )
    }

    if (
      Object.hasOwn(
        source,
        'antiLink'
      )
    ) {
      set.push(
        'anti_link = ?'
      )

      args.push(
        source.antiLink
          ? 1
          : 0
      )
    }

    if (
      Object.hasOwn(
        source,
        'welcomeText'
      )
    ) {
      set.push(
        'welcome_text = ?'
      )

      args.push(
        source.welcomeText ??
        null
      )
    }

    if (
      Object.hasOwn(
        source,
        'goodbyeText'
      )
    ) {
      set.push(
        'goodbye_text = ?'
      )

      args.push(
        source.goodbyeText ??
        null
      )
    }

    const extraChanges = {}

    for (
      const [key, value]
      of Object.entries(source)
    ) {
      if (
        !KNOWN_KEYS.has(key)
      ) {
        extraChanges[key] =
          value
      }
    }

    if (
      Object.keys(
        extraChanges
      ).length
    ) {
      const current =
        getConfigRow(
          clean
        )

      const extra = {
        ...parseExtra(
          current?.extra_json
        ),
        ...extraChanges
      }

      set.push(
        'extra_json = ?'
      )

      args.push(
        JSON.stringify(
          extra
        )
      )
    }

    if (set.length) {
      set.push(
        'updated_at = ?'
      )

      args.push(
        Date.now()
      )

      args.push(
        clean
      )

      db.prepare(`
        UPDATE group_configs
        SET ${set.join(', ')}
        WHERE jid = ?
      `).run(
        ...args
      )
    }

    commit()
  } catch (
    error
  ) {
    rollback()
    throw error
  }

  return getGroupConfig(
    clean
  )
}

// ===============================
// WARNING SYSTEM
// ===============================

export function getWarning(
  groupJid,
  userJid
) {
  const group =
    cleanJid(
      groupJid
    )

  const user =
    cleanJid(
      userJid
    )

  if (
    !group ||
    !user
  ) {
    return 0
  }

  const row =
    db.prepare(`
      SELECT count
      FROM group_warnings
      WHERE group_jid = ?
        AND user_jid = ?
    `).get(
      group,
      user
    )

  return (
    Number(
      row?.count
    ) || 0
  )
}

export function addWarning(
  groupJid,
  userJid
) {
  const group =
    cleanJid(
      groupJid
    )

  const user =
    cleanJid(
      userJid
    )

  if (
    !group ||
    !user
  ) {
    return 0
  }

  beginImmediate()

  try {
    db.prepare(`
      INSERT INTO group_warnings (
        group_jid,
        user_jid,
        count,
        updated_at
      )
      VALUES (?, ?, 1, ?)

      ON CONFLICT(
        group_jid,
        user_jid
      )
      DO UPDATE SET
        count =
          group_warnings.count + 1,
        updated_at =
          excluded.updated_at
    `).run(
      group,
      user,
      Date.now()
    )

    const row =
      db.prepare(`
        SELECT count
        FROM group_warnings
        WHERE group_jid = ?
          AND user_jid = ?
      `).get(
        group,
        user
      )

    commit()

    return (
      Number(
        row?.count
      ) || 0
    )
  } catch (
    error
  ) {
    rollback()
    throw error
  }
}

export function resetWarning(
  groupJid,
  userJid
) {
  const group =
    cleanJid(
      groupJid
    )

  const user =
    cleanJid(
      userJid
    )

  if (
    !group ||
    !user
  ) {
    return 0
  }

  db.prepare(`
    DELETE FROM group_warnings
    WHERE group_jid = ?
      AND user_jid = ?
  `).run(
    group,
    user
  )

  return 0
}
