import fs from 'node:fs'
import path from 'node:path'

// =====================================
// NEXA DATABASE MIGRATIONS V1
// =====================================
//
// Tujuan:
// - fresh DB dibuat otomatis
// - DB lama tidak di-reset
// - migration baru otomatis jalan saat startup
//
// Untuk perubahan schema berikutnya, tambahkan migration
// version 2, 3, dst ke MIGRATIONS. User tidak perlu
// menjalankan sqlite3 manual lagi.

const BASELINE_SCHEMA = `
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

const MIGRATIONS = [
  {
    version: 1,
    name: 'baseline_2026_09_11',
    sql: BASELINE_SCHEMA
  }
]

export function ensureDatabaseDirectory(
  dbFile
) {
  const directory =
    path.dirname(
      dbFile
    )

  fs.mkdirSync(
    directory,
    {
      recursive: true
    }
  )
}

function getUserVersion(
  db
) {
  const row =
    db.prepare(
      'PRAGMA user_version'
    ).get()

  return Number(
    row?.user_version
  ) || 0
}

function setUserVersion(
  db,
  version
) {
  const clean =
    Math.max(
      0,
      Math.trunc(
        Number(version) || 0
      )
    )

  db.exec(
    `PRAGMA user_version = ${clean}`
  )
}

function ensureMigrationLedger(
  db
) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS
      nexa_schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      );
  `)
}

export function runDatabaseMigrations(
  db
) {
  ensureMigrationLedger(
    db
  )

  const latestKnown =
    MIGRATIONS.reduce(
      (max, migration) =>
        Math.max(
          max,
          migration.version
        ),
      0
    )

  let current =
    getUserVersion(
      db
    )

  if (
    current >
    latestKnown
  ) {
    throw new Error(
      `DB_SCHEMA_NEWER_THAN_CODE_${current}_${latestKnown}`
    )
  }

  const pending =
    MIGRATIONS
      .filter(
        migration =>
          migration.version >
          current
      )
      .sort(
        (a, b) =>
          a.version -
          b.version
      )

  for (
    const migration
    of pending
  ) {
    db.exec(
      'BEGIN IMMEDIATE'
    )

    try {
      db.exec(
        migration.sql
      )

      db.prepare(`
        INSERT OR REPLACE INTO
          nexa_schema_migrations (
            version,
            name,
            applied_at
          )
        VALUES (?, ?, ?)
      `).run(
        migration.version,
        migration.name,
        Date.now()
      )

      setUserVersion(
        db,
        migration.version
      )

      db.exec(
        'COMMIT'
      )

      current =
        migration.version

      console.log(
        `🗄️ DB migration v${migration.version}: ${migration.name}`
      )
    } catch (
      error
    ) {
      try {
        db.exec(
          'ROLLBACK'
        )
      } catch {}

      throw error
    }
  }

  return {
    currentVersion:
      current,
    latestVersion:
      latestKnown,
    applied:
      pending.length
  }
}
