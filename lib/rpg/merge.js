function tableExists(
  db,
  name
) {
  return Boolean(
    db.prepare(`
      SELECT 1
      FROM sqlite_master
      WHERE type = 'table'
        AND name = ?
      LIMIT 1
    `).get(
      name
    )
  )
}

// =====================================
// HOKI CLAIMS
// =====================================

function mergeHoki(
  db,
  keepId,
  oldId
) {
  if (
    !tableExists(
      db,
      'hoki_claims'
    )
  ) {
    return
  }

  const rows =
    db.prepare(`
      SELECT
        id,
        claim_key,
        claim_day

      FROM hoki_claims
      WHERE player_id = ?
    `).all(
      oldId
    )

  for (
    const row
    of rows
  ) {
    let claimKey =
      row.claim_key

    const oldDailyKey =
      `${oldId}:${row.claim_day}`

    if (
      claimKey ===
      oldDailyKey
    ) {
      const wantedKey =
        `${keepId}:${row.claim_day}`

      const collision =
        db.prepare(`
          SELECT id
          FROM hoki_claims
          WHERE claim_key = ?
            AND id != ?
          LIMIT 1
        `).get(
          wantedKey,
          row.id
        )

      claimKey =
        collision
          ? `${keepId}:MERGED:${row.id}:${row.claim_day}`
          : wantedKey
    }

    db.prepare(`
      UPDATE hoki_claims
      SET
        player_id = ?,
        claim_key = ?

      WHERE id = ?
    `).run(
      keepId,
      claimKey,
      row.id
    )
  }
}

// =====================================
// RPG INVENTORY
// =====================================

function mergeInventory(
  db,
  keepId,
  oldId
) {
  if (
    !tableExists(
      db,
      'rpg_inventory'
    )
  ) {
    return
  }

  const rows =
    db.prepare(`
      SELECT *
      FROM rpg_inventory
      WHERE player_id = ?
    `).all(
      oldId
    )

  for (
    const row
    of rows
  ) {
    db.prepare(`
      INSERT INTO rpg_inventory (
        player_id,
        item_id,
        quantity,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?)

      ON CONFLICT(
        player_id,
        item_id
      )
      DO UPDATE SET
        quantity =
          rpg_inventory.quantity +
          excluded.quantity,

        updated_at =
          MAX(
            rpg_inventory.updated_at,
            excluded.updated_at
          )
    `).run(
      keepId,
      row.item_id,
      row.quantity,
      row.created_at,
      row.updated_at
    )
  }

  db.prepare(`
    DELETE FROM rpg_inventory
    WHERE player_id = ?
  `).run(
    oldId
  )
}

// =====================================
// RPG GEAR
// =====================================

function mergeGear(
  db,
  keepId,
  oldId
) {
  if (
    !tableExists(
      db,
      'rpg_gear'
    )
  ) {
    return
  }

  db.prepare(`
    UPDATE rpg_gear
    SET player_id = ?
    WHERE player_id = ?
  `).run(
    keepId,
    oldId
  )
}

// =====================================
// RPG EQUIPMENT
// =====================================

function mergeEquipment(
  db,
  keepId,
  oldId
) {
  if (
    !tableExists(
      db,
      'rpg_equipment'
    )
  ) {
    return
  }

  const keep =
    db.prepare(`
      SELECT *
      FROM rpg_equipment
      WHERE player_id = ?
    `).get(
      keepId
    )

  const old =
    db.prepare(`
      SELECT *
      FROM rpg_equipment
      WHERE player_id = ?
    `).get(
      oldId
    )

  if (!old) {
    return
  }

  if (!keep) {
    db.prepare(`
      UPDATE rpg_equipment
      SET player_id = ?
      WHERE player_id = ?
    `).run(
      keepId,
      oldId
    )

    return
  }

  db.prepare(`
    UPDATE rpg_equipment
    SET
      weapon_gear_id = ?,
      armor_gear_id = ?,
      accessory_gear_id = ?,
      updated_at = ?

    WHERE player_id = ?
  `).run(
    keep.weapon_gear_id ||
      old.weapon_gear_id ||
      null,

    keep.armor_gear_id ||
      old.armor_gear_id ||
      null,

    keep.accessory_gear_id ||
      old.accessory_gear_id ||
      null,

    Math.max(
      Number(keep.updated_at) || 0,
      Number(old.updated_at) || 0
    ),

    keepId
  )

  db.prepare(`
    DELETE FROM rpg_equipment
    WHERE player_id = ?
  `).run(
    oldId
  )
}

// =====================================
// RPG TRANSACTIONS
// =====================================

function mergeTransactions(
  db,
  keepId,
  oldId
) {
  if (
    !tableExists(
      db,
      'rpg_transactions'
    )
  ) {
    return
  }

  db.prepare(`
    UPDATE rpg_transactions
    SET player_id = ?
    WHERE player_id = ?
  `).run(
    keepId,
    oldId
  )
}

// =====================================
// RPG COOLDOWNS
// =====================================

function mergeCooldowns(
  db,
  keepId,
  oldId
) {
  if (
    !tableExists(
      db,
      'rpg_cooldowns'
    )
  ) {
    return
  }

  const rows =
    db.prepare(`
      SELECT *
      FROM rpg_cooldowns
      WHERE player_id = ?
    `).all(
      oldId
    )

  for (
    const row
    of rows
  ) {
    db.prepare(`
      INSERT INTO rpg_cooldowns (
        player_id,
        action,
        expires_at
      )
      VALUES (?, ?, ?)

      ON CONFLICT(
        player_id,
        action
      )
      DO UPDATE SET
        expires_at =
          MAX(
            rpg_cooldowns.expires_at,
            excluded.expires_at
          )
    `).run(
      keepId,
      row.action,
      row.expires_at
    )
  }

  db.prepare(`
    DELETE FROM rpg_cooldowns
    WHERE player_id = ?
  `).run(
    oldId
  )
}



function mergeUiSessions(
  db,
  keepId,
  oldId
) {
  if (
    !tableExists(
      db,
      'rpg_ui_sessions'
    )
  ) {
    return
  }

  const keep =
    db.prepare(`
      SELECT *
      FROM rpg_ui_sessions
      WHERE player_id = ?
    `).get(
      keepId
    )

  const old =
    db.prepare(`
      SELECT *
      FROM rpg_ui_sessions
      WHERE player_id = ?
    `).get(
      oldId
    )

  if (!old) {
    return
  }

  if (!keep) {
    db.prepare(`
      UPDATE rpg_ui_sessions
      SET player_id = ?
      WHERE player_id = ?
    `).run(
      keepId,
      oldId
    )

    return
  }

  const oldIsNewer =
    Number(old.updated_at) >
    Number(keep.updated_at)

  if (oldIsNewer) {
    db.prepare(`
      DELETE FROM rpg_ui_sessions
      WHERE player_id = ?
    `).run(
      keepId
    )

    db.prepare(`
      UPDATE rpg_ui_sessions
      SET player_id = ?
      WHERE player_id = ?
    `).run(
      keepId,
      oldId
    )
  } else {
    db.prepare(`
      DELETE FROM rpg_ui_sessions
      WHERE player_id = ?
    `).run(
      oldId
    )
  }
}

function mergeAiUserStats(
  db,
  keepId,
  oldId
) {
  if (
    !tableExists(
      db,
      'ai_user_stats'
    )
  ) {
    return
  }

  const keep =
    db.prepare(`
      SELECT *
      FROM ai_user_stats
      WHERE player_id = ?
    `).get(
      keepId
    )

  const old =
    db.prepare(`
      SELECT *
      FROM ai_user_stats
      WHERE player_id = ?
    `).get(
      oldId
    )

  if (!old) {
    return
  }

  if (!keep) {
    db.prepare(`
      UPDATE ai_user_stats
      SET player_id = ?
      WHERE player_id = ?
    `).run(
      keepId,
      oldId
    )

    return
  }

  db.prepare(`
    UPDATE ai_user_stats
    SET
      chat_count = ?,
      first_chat_at = ?,
      last_chat_at = ?,
      updated_at = ?
    WHERE player_id = ?
  `).run(
    (
      Number(
        keep.chat_count
      ) || 0
    ) +
    (
      Number(
        old.chat_count
      ) || 0
    ),

    Math.min(
      Number(
        keep.first_chat_at
      ) || Infinity,
      Number(
        old.first_chat_at
      ) || Infinity
    ),

    Math.max(
      Number(
        keep.last_chat_at
      ) || 0,
      Number(
        old.last_chat_at
      ) || 0
    ),

    Date.now(),
    keepId
  )

  db.prepare(`
    DELETE FROM ai_user_stats
    WHERE player_id = ?
  `).run(
    oldId
  )
}

function mergeBattles(
  db,
  keepId,
  oldId
) {
  if (
    !tableExists(
      db,
      'rpg_battles'
    )
  ) {
    return
  }

  const keep =
    db.prepare(`
      SELECT *
      FROM rpg_battles
      WHERE player_id = ?
    `).get(
      keepId
    )

  const old =
    db.prepare(`
      SELECT *
      FROM rpg_battles
      WHERE player_id = ?
    `).get(
      oldId
    )

  if (!old) {
    return
  }

  if (!keep) {
    db.prepare(`
      UPDATE rpg_battles
      SET player_id = ?
      WHERE player_id = ?
    `).run(
      keepId,
      oldId
    )

    return
  }

  const oldIsNewer =
    Number(old.updated_at) >
    Number(keep.updated_at)

  if (oldIsNewer) {
    db.prepare(`
      DELETE FROM rpg_battles
      WHERE player_id = ?
    `).run(
      keepId
    )

    db.prepare(`
      UPDATE rpg_battles
      SET player_id = ?
      WHERE player_id = ?
    `).run(
      keepId,
      oldId
    )
  } else {
    db.prepare(`
      DELETE FROM rpg_battles
      WHERE player_id = ?
    `).run(
      oldId
    )
  }
}

// =====================================
// RPG PROFILE
// =====================================

function mergeProfile(
  db,
  keepId,
  oldId
) {
  if (
    !tableExists(
      db,
      'rpg_profiles'
    )
  ) {
    return
  }

  const keep =
    db.prepare(`
      SELECT *
      FROM rpg_profiles
      WHERE player_id = ?
    `).get(
      keepId
    )

  const old =
    db.prepare(`
      SELECT *
      FROM rpg_profiles
      WHERE player_id = ?
    `).get(
      oldId
    )

  if (!old) {
    return
  }

  if (!keep) {
    db.prepare(`
      UPDATE rpg_profiles
      SET player_id = ?
      WHERE player_id = ?
    `).run(
      keepId,
      oldId
    )

    return
  }

  const oldBetter =
    Number(old.level) >
      Number(keep.level) ||
    (
      Number(old.level) ===
        Number(keep.level) &&
      Number(old.exp) >
        Number(keep.exp)
    )

  const progress =
    oldBetter
      ? old
      : keep

  const maxHp =
    Math.max(
      Number(keep.max_hp) || 0,
      Number(old.max_hp) || 0
    )

  const maxMana =
    Math.max(
      Number(keep.max_mana) || 0,
      Number(old.max_mana) || 0
    )

  db.prepare(`
    UPDATE rpg_profiles
    SET
      class = ?,
      level = ?,
      exp = ?,
      hp = ?,
      max_hp = ?,
      mana = ?,
      max_mana = ?,
      attack = ?,
      defense = ?,
      money = ?,
      bank_money = ?,
      wanted = ?,
      created_at = ?,
      updated_at = ?

    WHERE player_id = ?
  `).run(
    keep.class ||
      old.class ||
      null,

    progress.level,
    progress.exp,

    Math.min(
      maxHp,
      Math.max(
        Number(keep.hp) || 0,
        Number(old.hp) || 0
      )
    ),

    maxHp,

    Math.min(
      maxMana,
      Math.max(
        Number(keep.mana) || 0,
        Number(old.mana) || 0
      )
    ),

    maxMana,

    Math.max(
      Number(keep.attack) || 0,
      Number(old.attack) || 0
    ),

    Math.max(
      Number(keep.defense) || 0,
      Number(old.defense) || 0
    ),

    (
      Number(keep.money) || 0
    ) +
    (
      Number(old.money) || 0
    ),

    (
      Number(keep.bank_money) || 0
    ) +
    (
      Number(old.bank_money) || 0
    ),

    Math.max(
      Number(keep.wanted) || 0,
      Number(old.wanted) || 0
    ),

    Math.min(
      Number(keep.created_at) || Date.now(),
      Number(old.created_at) || Date.now()
    ),

    Math.max(
      Number(keep.updated_at) || 0,
      Number(old.updated_at) || 0
    ),

    keepId
  )

  db.prepare(`
    DELETE FROM rpg_profiles
    WHERE player_id = ?
  `).run(
    oldId
  )
}

// =====================================
// PUBLIC
// =====================================

export function mergeExternalPlayerData(
  db,
  keepId,
  oldId
) {
  mergeHoki(
    db,
    keepId,
    oldId
  )

  mergeInventory(
    db,
    keepId,
    oldId
  )

  mergeGear(
    db,
    keepId,
    oldId
  )

  mergeEquipment(
    db,
    keepId,
    oldId
  )

  mergeTransactions(
    db,
    keepId,
    oldId
  )

  mergeCooldowns(
    db,
    keepId,
    oldId
  )

  mergeBattles(
    db,
    keepId,
    oldId
  )

  mergeAiUserStats(
    db,
    keepId,
    oldId
  )

  mergeUiSessions(
    db,
    keepId,
    oldId
  )

  mergeProfile(
    db,
    keepId,
    oldId
  )
}
