import fs from 'fs'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { mergeExternalPlayerData } from './rpg/merge.js'

const DB_DIR =
  './database'

const DB_FILE =
  `${DB_DIR}/nexa.sqlite`

const JIDMAP_FILE =
  `${DB_DIR}/jidmap.json`

fs.mkdirSync(
  DB_DIR,
  {
    recursive: true
  }
)

const db =
  new DatabaseSync(
    DB_FILE,
    {
      timeout: 5000
    }
  )

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
`)

// =====================================
// DATABASE AUTO INIT
// =====================================

const DATABASE_SCHEMA = `
CREATE TABLE IF NOT EXISTS ai_user_stats (
    player_id TEXT PRIMARY KEY,

    chat_count INTEGER NOT NULL
      DEFAULT 0,

    first_chat_at INTEGER,
    last_chat_at INTEGER,

    updated_at INTEGER NOT NULL,

    FOREIGN KEY(player_id)
      REFERENCES players(id)
      ON DELETE CASCADE
  );
CREATE TABLE IF NOT EXISTS economy_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    player_id TEXT NOT NULL,

    metric TEXT NOT NULL,
    delta INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,

    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL,

    FOREIGN KEY(player_id)
      REFERENCES players(id)
      ON DELETE CASCADE
  );
CREATE TABLE IF NOT EXISTS hoki_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    claim_key TEXT NOT NULL UNIQUE,
    player_id TEXT NOT NULL,
    claim_day TEXT NOT NULL,
    main_type TEXT NOT NULL,
    main_amount INTEGER NOT NULL,
    main_chance REAL NOT NULL,
    exp_amount INTEGER NOT NULL,
    luck_percent INTEGER NOT NULL,
    rarity TEXT NOT NULL,
    claimed_at INTEGER NOT NULL,

    FOREIGN KEY(player_id)
      REFERENCES players(id)
      ON DELETE CASCADE
  );
CREATE TABLE IF NOT EXISTS identities (
    jid TEXT PRIMARY KEY,

    player_id TEXT NOT NULL,

    kind TEXT NOT NULL,

    first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,

    FOREIGN KEY(player_id)
      REFERENCES players(id)
      ON DELETE CASCADE
  );
CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,

    name TEXT,
    age INTEGER,
    gender TEXT,

    registered_at INTEGER,

    banned INTEGER NOT NULL DEFAULT 0,

    premium INTEGER NOT NULL DEFAULT 0,
    premium_until INTEGER,

    limit_value INTEGER NOT NULL DEFAULT 10,

    coin INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 0,
    exp INTEGER NOT NULL DEFAULT 0,

    last_daily INTEGER NOT NULL DEFAULT 0,

    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
CREATE TABLE IF NOT EXISTS rpg_battles (
      player_id TEXT PRIMARY KEY,

      monster_id TEXT NOT NULL,
      monster_name TEXT NOT NULL,
      monster_icon TEXT NOT NULL,

      monster_level INTEGER NOT NULL,

      monster_hp INTEGER NOT NULL,
      monster_max_hp INTEGER NOT NULL,

      monster_attack INTEGER NOT NULL,
      monster_defense INTEGER NOT NULL,

      reward_money INTEGER NOT NULL,
      reward_exp INTEGER NOT NULL,

      loot_item TEXT,
      loot_chance INTEGER NOT NULL DEFAULT 0,

      started_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL, battle_message_id TEXT, battle_chat_jid TEXT, battle_message_key TEXT,

      FOREIGN KEY(player_id)
        REFERENCES players(id)
        ON DELETE CASCADE
    );
CREATE TABLE IF NOT EXISTS rpg_cooldowns (
      player_id TEXT NOT NULL,
      action TEXT NOT NULL,
      expires_at INTEGER NOT NULL,

      PRIMARY KEY(
        player_id,
        action
      ),

      FOREIGN KEY(player_id)
        REFERENCES players(id)
        ON DELETE CASCADE
    );
CREATE TABLE IF NOT EXISTS rpg_equipment (
      player_id TEXT PRIMARY KEY,

      weapon_gear_id TEXT,
      armor_gear_id TEXT,
      accessory_gear_id TEXT,

      updated_at INTEGER NOT NULL,

      FOREIGN KEY(player_id)
        REFERENCES players(id)
        ON DELETE CASCADE,

      FOREIGN KEY(weapon_gear_id)
        REFERENCES rpg_gear(gear_id)
        ON DELETE SET NULL,

      FOREIGN KEY(armor_gear_id)
        REFERENCES rpg_gear(gear_id)
        ON DELETE SET NULL,

      FOREIGN KEY(accessory_gear_id)
        REFERENCES rpg_gear(gear_id)
        ON DELETE SET NULL
    );
CREATE TABLE IF NOT EXISTS rpg_gear (
      gear_id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      item_id TEXT NOT NULL,

      enchant_level INTEGER NOT NULL DEFAULT 0,

      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,

      FOREIGN KEY(player_id)
        REFERENCES players(id)
        ON DELETE CASCADE
    );
CREATE TABLE IF NOT EXISTS rpg_inventory (
      player_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0
        CHECK(quantity >= 0),

      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,

      PRIMARY KEY(
        player_id,
        item_id
      ),

      FOREIGN KEY(player_id)
        REFERENCES players(id)
        ON DELETE CASCADE
    );
CREATE TABLE IF NOT EXISTS rpg_profiles (
      player_id TEXT PRIMARY KEY,

      class TEXT,

      level INTEGER NOT NULL DEFAULT 1,
      exp INTEGER NOT NULL DEFAULT 0,

      hp INTEGER NOT NULL DEFAULT 100,
      max_hp INTEGER NOT NULL DEFAULT 100,

      mana INTEGER NOT NULL DEFAULT 50,
      max_mana INTEGER NOT NULL DEFAULT 50,

      attack INTEGER NOT NULL DEFAULT 10,
      defense INTEGER NOT NULL DEFAULT 8,

      money INTEGER NOT NULL DEFAULT 1000
        CHECK(money >= 0),

      bank_money INTEGER NOT NULL DEFAULT 0
        CHECK(bank_money >= 0),

      wanted INTEGER NOT NULL DEFAULT 0
        CHECK(wanted >= 0),

      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,

      FOREIGN KEY(player_id)
        REFERENCES players(id)
        ON DELETE CASCADE
    );
CREATE TABLE IF NOT EXISTS rpg_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      player_id TEXT NOT NULL,

      wallet_delta INTEGER NOT NULL DEFAULT 0,
      bank_delta INTEGER NOT NULL DEFAULT 0,

      wallet_after INTEGER NOT NULL,
      bank_after INTEGER NOT NULL,

      reason TEXT NOT NULL,
      note TEXT,

      created_at INTEGER NOT NULL,

      FOREIGN KEY(player_id)
        REFERENCES players(id)
        ON DELETE CASCADE
    );
CREATE TABLE IF NOT EXISTS rpg_ui_sessions (
    player_id TEXT PRIMARY KEY,

    type TEXT NOT NULL,

    chat_jid TEXT NOT NULL,
    message_id TEXT NOT NULL,
    message_key TEXT,

    payload_json TEXT,

    expires_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,

    FOREIGN KEY(player_id)
      REFERENCES players(id)
      ON DELETE CASCADE
  );
CREATE INDEX IF NOT EXISTS identities_player_idx
  ON identities(player_id);
CREATE INDEX IF NOT EXISTS idx_hoki_player_time
  ON hoki_claims(
    player_id,
    claimed_at DESC
  );
CREATE INDEX IF NOT EXISTS idx_rpg_gear_player
    ON rpg_gear(player_id);
CREATE INDEX IF NOT EXISTS idx_rpg_transactions_player
    ON rpg_transactions(
      player_id,
      created_at DESC
    );
`

db.exec(
  DATABASE_SCHEMA
)

// =====================================
// JID
// =====================================

export function normalizePlayerJid(value) {
  const raw =
    String(value || '')
      .trim()
      .toLowerCase()

  if (
    !raw ||
    raw.endsWith('@g.us')
  ) {
    return null
  }

  const at =
    raw.lastIndexOf('@')

  if (at < 1) {
    return null
  }

  const domain =
    raw.slice(at + 1)

  if (
    domain !== 'lid' &&
    domain !== 's.whatsapp.net'
  ) {
    return null
  }

  const local =
    raw
      .slice(0, at)
      .split(':')[0]

  if (!local) {
    return null
  }

  return `${local}@${domain}`
}

function readJidMap() {
  try {
    return JSON.parse(
      fs.readFileSync(
        JIDMAP_FILE,
        'utf8'
      )
    )
  } catch {
    return {}
  }
}

export function getPlayerAliases(value) {
  const jid =
    normalizePlayerJid(value)

  if (!jid) {
    return []
  }

  const result =
    new Set([jid])

  const map =
    readJidMap()

  if (jid.endsWith('@lid')) {
    const pn =
      normalizePlayerJid(
        map[jid]
      )

    if (
      pn?.endsWith(
        '@s.whatsapp.net'
      )
    ) {
      result.add(pn)
    }
  } else {
    for (
      const [lidRaw, pnRaw]
      of Object.entries(map)
    ) {
      const lid =
        normalizePlayerJid(
          lidRaw
        )

      const pn =
        normalizePlayerJid(
          pnRaw
        )

      if (
        lid?.endsWith('@lid') &&
        pn === jid
      ) {
        result.add(lid)
      }
    }
  }

  return [...result]
}

// =====================================
// PLAYER
// =====================================

function getRow(playerId) {
  return db
    .prepare(`
      SELECT *
      FROM players
      WHERE id = ?
    `)
    .get(playerId)
}

function toPlayer(row) {
  if (!row) {
    return null
  }

  return {
    playerId:
      row.id,

    name:
      row.name ?? null,

    age:
      row.age ?? null,

    gender:
      row.gender ?? null,

    registeredAt:
      row.registered_at ?? null,

    banned:
      Boolean(row.banned),

    premium:
      Boolean(row.premium),

    premiumUntil:
      row.premium_until ?? null,

    limit:
      Number(
        row.limit_value
      ) || 0,

    coin:
      Number(row.coin) || 0,

    level:
      Number(row.level) || 0,

    exp:
      Number(row.exp) || 0,

    lastDaily:
      Number(
        row.last_daily
      ) || 0,

    createdAt:
      Number(
        row.created_at
      ) || 0,

    updatedAt:
      Number(
        row.updated_at
      ) || 0
  }
}

function attachIdentity(
  playerId,
  jid
) {
  const clean =
    normalizePlayerJid(jid)

  if (!clean) {
    return
  }

  const now =
    Date.now()

  const kind =
    clean.endsWith('@lid')
      ? 'lid'
      : 'pn'

  db.prepare(`
    INSERT OR IGNORE INTO identities (
      jid,
      player_id,
      kind,
      first_seen,
      last_seen
    )
    VALUES (?, ?, ?, ?, ?)
  `).run(
    clean,
    playerId,
    kind,
    now,
    now
  )

  db.prepare(`
    UPDATE identities
    SET last_seen = ?
    WHERE jid = ?
  `).run(
    now,
    clean
  )
}

function mergePlayers(ids) {
  const unique =
    [...new Set(ids)]

  const rows =
    unique
      .map(getRow)
      .filter(Boolean)

  if (!rows.length) {
    return null
  }

  rows.sort(
    (a, b) => {
      const ar =
        a.registered_at
          ? 1
          : 0

      const br =
        b.registered_at
          ? 1
          : 0

      if (br !== ar) {
        return br - ar
      }

      return (
        Number(a.created_at) -
        Number(b.created_at)
      )
    }
  )

  const keep =
    rows[0]

  const firstValue =
    field =>
      rows.find(
        row =>
          row[field] !== null &&
          row[field] !== ''
      )?.[field] ?? null

  const bestProgress =
    [...rows].sort(
      (a, b) =>
        Number(b.level) -
          Number(a.level) ||
        Number(b.exp) -
          Number(a.exp)
    )[0]

  const registered =
    rows
      .map(
        row =>
          Number(
            row.registered_at
          ) || 0
      )
      .filter(Boolean)

  const now =
    Date.now()

  db.prepare(`
    UPDATE players
    SET
      name = ?,
      age = ?,
      gender = ?,
      registered_at = ?,
      banned = ?,
      premium = ?,
      premium_until = ?,
      limit_value = ?,
      coin = ?,
      level = ?,
      exp = ?,
      last_daily = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    firstValue('name'),
    firstValue('age'),
    firstValue('gender'),

    registered.length
      ? Math.min(...registered)
      : null,

    rows.some(
      row => row.banned
    )
      ? 1
      : 0,

    rows.some(
      row => row.premium
    )
      ? 1
      : 0,

    Math.max(
      0,
      ...rows.map(
        row =>
          Number(
            row.premium_until
          ) || 0
      )
    ) || null,

    Math.max(
      ...rows.map(
        row =>
          Number(
            row.limit_value
          ) || 0
      )
    ),

    Math.max(
      ...rows.map(
        row =>
          Number(row.coin) || 0
      )
    ),

    Number(
      bestProgress.level
    ) || 0,

    Number(
      bestProgress.exp
    ) || 0,

    Math.max(
      ...rows.map(
        row =>
          Number(
            row.last_daily
          ) || 0
      )
    ),

    now,
    keep.id
  )

  for (
    const old
    of rows.slice(1)
  ) {
    db.prepare(`
      UPDATE identities
      SET player_id = ?
      WHERE player_id = ?
    `).run(
      keep.id,
      old.id
    )

    db.prepare(`
      UPDATE economy_log
      SET player_id = ?
      WHERE player_id = ?
    `).run(
      keep.id,
      old.id
    )

    mergeExternalPlayerData(
      db,
      keep.id,
      old.id
    )

    db.prepare(`
      DELETE FROM players
      WHERE id = ?
    `).run(
      old.id
    )
  }

  return keep.id
}

// =====================================
// RESOLVE
// =====================================

export function resolvePlayerId(
  jid,
  create = true
) {
  const aliases =
    getPlayerAliases(jid)

  if (!aliases.length) {
    return null
  }

  const ids =
    new Set()

  for (
    const alias
    of aliases
  ) {
    const found =
      db.prepare(`
        SELECT player_id
        FROM identities
        WHERE jid = ?
      `).get(alias)

    if (found?.player_id) {
      ids.add(
        found.player_id
      )
    }
  }

  let playerId

  if (!ids.size) {
    if (!create) {
      return null
    }

    playerId =
      randomUUID()

    const now =
      Date.now()

    db.prepare(`
      INSERT INTO players (
        id,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?)
    `).run(
      playerId,
      now,
      now
    )
  } else if (
    ids.size === 1
  ) {
    playerId =
      [...ids][0]
  } else {
    playerId =
      mergePlayers(
        [...ids]
      )
  }

  for (
    const alias
    of aliases
  ) {
    attachIdentity(
      playerId,
      alias
    )
  }

  return playerId
}

// =====================================
// PUBLIC API
// =====================================

export function getPlayer(jid) {
  const id =
    resolvePlayerId(
      jid,
      true
    )

  return id
    ? toPlayer(
        getRow(id)
      )
    : null
}

export function updatePlayer(
  jid,
  changes = {}
) {
  const id =
    resolvePlayerId(
      jid,
      true
    )

  if (!id) {
    throw new Error(
      'INVALID_PLAYER_JID'
    )
  }

  const fields = {
    name:
      'name',

    age:
      'age',

    gender:
      'gender',

    registeredAt:
      'registered_at',

    banned:
      'banned',

    premium:
      'premium',

    premiumUntil:
      'premium_until',

    limit:
      'limit_value',

    coin:
      'coin',

    level:
      'level',

    exp:
      'exp',

    lastDaily:
      'last_daily'
  }

  const set = []
  const args = []

  for (
    const [key, value]
    of Object.entries(changes)
  ) {
    const column =
      fields[key]

    if (!column) {
      continue
    }

    let finalValue =
      value

    if (
      key === 'banned' ||
      key === 'premium'
    ) {
      finalValue =
        value
          ? 1
          : 0
    }

    set.push(
      `${column} = ?`
    )

    args.push(
      finalValue
    )
  }

  if (!set.length) {
    return getPlayer(jid)
  }

  set.push(
    'updated_at = ?'
  )

  args.push(
    Date.now()
  )

  args.push(id)

  db.prepare(`
    UPDATE players
    SET ${set.join(', ')}
    WHERE id = ?
  `).run(
    ...args
  )

  return getPlayer(jid)
}

export function linkPlayerIdentity(
  lidValue,
  pnValue
) {
  const lid =
    normalizePlayerJid(
      lidValue
    )

  const pn =
    normalizePlayerJid(
      pnValue
    )

  if (
    !lid?.endsWith('@lid') ||
    !pn?.endsWith(
      '@s.whatsapp.net'
    )
  ) {
    throw new Error(
      'INVALID_IDENTITY_PAIR'
    )
  }

  const ids = []

  for (
    const jid
    of [lid, pn]
  ) {
    const found =
      db.prepare(`
        SELECT player_id
        FROM identities
        WHERE jid = ?
      `).get(jid)

    if (found?.player_id) {
      ids.push(
        found.player_id
      )
    }
  }

  let playerId

  if (!ids.length) {
    playerId =
      resolvePlayerId(
        lid,
        true
      )
  } else if (
    new Set(ids).size === 1
  ) {
    playerId =
      ids[0]
  } else {
    playerId =
      mergePlayers(ids)
  }

  attachIdentity(
    playerId,
    lid
  )

  attachIdentity(
    playerId,
    pn
  )

  return getPlayer(lid)
}

export function deletePlayer(jid) {
  const id =
    resolvePlayerId(
      jid,
      false
    )

  if (!id) {
    return false
  }

  db.prepare(`
    DELETE FROM players
    WHERE id = ?
  `).run(id)

  return true
}


// =====================================
// LIST PLAYERS
// =====================================

function getPrimaryJid(
  playerId
) {
  const found =
    db.prepare(`
      SELECT jid
      FROM identities
      WHERE player_id = ?

      ORDER BY
        CASE kind
          WHEN 'pn' THEN 0
          ELSE 1
        END,
        first_seen ASC

      LIMIT 1
    `).get(
      playerId
    )

  return (
    found?.jid ||
    null
  )
}

export function listPlayers() {
  return db
    .prepare(`
      SELECT *
      FROM players
      ORDER BY created_at ASC
    `)
    .all()
    .map(
      row => ({
        jid:
          getPrimaryJid(
            row.id
          ),

        ...toPlayer(row)
      })
    )
}


// =====================================
// ECONOMY LEDGER
// =====================================

const ECONOMY_METRICS =
  new Set([
    'coin',
    'limit',
    'exp',
    'level'
  ])

export function recordEconomyLog(
  jid,
  metric,
  delta,
  balanceAfter,
  reason = 'update'
) {
  const playerId =
    resolvePlayerId(
      jid,
      false
    )

  if (!playerId) {
    return false
  }

  const cleanMetric =
    String(
      metric || ''
    )
      .trim()
      .toLowerCase()

  if (
    !ECONOMY_METRICS.has(
      cleanMetric
    )
  ) {
    return false
  }

  const cleanDelta =
    Math.trunc(
      Number(delta) || 0
    )

  const cleanBalance =
    Math.trunc(
      Number(balanceAfter) || 0
    )

  if (!cleanDelta) {
    return false
  }

  db.prepare(`
    INSERT INTO economy_log (
      player_id,
      metric,
      delta,
      balance_after,
      reason,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    playerId,
    cleanMetric,
    cleanDelta,
    cleanBalance,
    String(
      reason ||
      'update'
    ),
    Date.now()
  )

  return true
}

export function getEconomyLog(
  jid,
  limit = 20
) {
  const playerId =
    resolvePlayerId(
      jid,
      false
    )

  if (!playerId) {
    return []
  }

  const safeLimit =
    Math.max(
      1,
      Math.min(
        100,
        Math.floor(
          Number(limit) || 20
        )
      )
    )

  return db.prepare(`
    SELECT
      id,
      metric,
      delta,

      balance_after
        AS balanceAfter,

      reason,

      created_at
        AS createdAt

    FROM economy_log

    WHERE player_id = ?

    ORDER BY id DESC

    LIMIT ?
  `).all(
    playerId,
    safeLimit
  )
}

export function databaseHealth() {
  const integrity =
    db.prepare(
      'PRAGMA integrity_check'
    ).get()

  const fkErrors =
    db.prepare(
      'PRAGMA foreign_key_check'
    ).all()

  const players =
    db.prepare(`
      SELECT COUNT(*) AS total
      FROM players
    `).get()

  const identities =
    db.prepare(`
      SELECT COUNT(*) AS total
      FROM identities
    `).get()

  return {
    ok:
      integrity
        ?.integrity_check ===
        'ok' &&
      fkErrors.length === 0,

    integrity:
      integrity
        ?.integrity_check,

    players:
      Number(
        players?.total
      ) || 0,

    identities:
      Number(
        identities?.total
      ) || 0,

    foreignKeyErrors:
      fkErrors.length
  }
}
