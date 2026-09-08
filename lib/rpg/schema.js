export function initRpgSchema(
  db
) {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

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

    CREATE INDEX IF NOT EXISTS
      idx_rpg_gear_player
    ON rpg_gear(player_id);

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

    CREATE INDEX IF NOT EXISTS
      idx_rpg_transactions_player
    ON rpg_transactions(
      player_id,
      created_at DESC
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
      updated_at INTEGER NOT NULL,

      FOREIGN KEY(player_id)
        REFERENCES players(id)
        ON DELETE CASCADE
    );
  `)
}
