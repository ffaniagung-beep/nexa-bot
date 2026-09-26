// NEXA_INVESTMENT_FOUNDATION_V1
// NEXA_INVESTMENT_TRADING_V2
import {
  DatabaseSync
} from 'node:sqlite'

import {
  resolvePlayerId
} from './playerdb.js'

const DB_FILE =
  './database/nexa.sqlite'

export const STARTER_NEXIUM =
  500

// Tetap di bawah Number.MAX_SAFE_INTEGER.
export const OWNER_NEXIUM =
  9_000_000_000_000_000

export const MARKET_INTERVAL_MS =
  5 * 60 * 1000

const MAX_CATCHUP_TICKS =
  24

const ASSET_CONFIG = [
  {
    key: 'iron',
    name: 'Iron',
    icon: '⛓️',
    minMove: 0.005,
    maxMove: 0.02,
    aliases: [
      'iron',
      'besi'
    ]
  },
  {
    key: 'gold',
    name: 'Gold',
    icon: '🪙',
    minMove: 0.01,
    maxMove: 0.03,
    aliases: [
      'gold',
      'emas'
    ]
  },
  {
    key: 'diamond',
    name: 'Diamond',
    icon: '💎',
    minMove: 0.02,
    maxMove: 0.05,
    aliases: [
      'diamond',
      'berlian'
    ]
  },
  {
    key: 'nexium_crystal',
    name: 'Nexium Crystal',
    icon: '🔷',
    minMove: 0.03,
    maxMove: 0.07,
    aliases: [
      'nexiumcrystal',
      'nexium',
      'crystal',
      'nxcrystal',
      'nxc'
    ]
  },
  {
    key: 'rhodium',
    name: 'Rhodium',
    icon: '⚪',
    minMove: 0.04,
    maxMove: 0.10,
    aliases: [
      'rhodium',
      'rh'
    ]
  }
]

export const INVESTMENT_ASSETS =
  ASSET_CONFIG.map(
    ({
      key,
      name,
      icon
    }) => ({
      key,
      name,
      icon
    })
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
  PRAGMA busy_timeout = 10000;
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
`)

function requirePlayerId(
  jid
) {
  const playerId =
    resolvePlayerId(
      jid,
      true
    )

  if (!playerId) {
    throw new Error(
      'INVALID_INVESTMENT_PLAYER'
    )
  }

  return playerId
}

function withImmediateTransaction(
  work
) {
  db.exec(
    'BEGIN IMMEDIATE'
  )

  try {
    const result =
      work()

    db.exec(
      'COMMIT'
    )

    return result
  } catch (error) {
    try {
      db.exec(
        'ROLLBACK'
      )
    } catch {}

    throw error
  }
}

function readAccountById(
  playerId
) {
  return db.prepare(`
    SELECT
      player_id,
      nexium,
      initialized_at,
      updated_at
    FROM investment_accounts
    WHERE player_id = ?
  `).get(
    playerId
  ) || null
}

function toAccount(
  row
) {
  if (!row) {
    return null
  }

  return {
    playerId:
      row.player_id,
    nexium:
      Number(
        row.nexium
      ) || 0,
    initializedAt:
      Number(
        row.initialized_at
      ) || 0,
    updatedAt:
      Number(
        row.updated_at
      ) || 0
  }
}

function normalizeAssetToken(
  value
) {
  return String(
    value || ''
  )
    .trim()
    .toLowerCase()
    .replace(
      /[\s_-]+/g,
      ''
    )
}

export function resolveInvestmentAsset(
  value
) {
  const token =
    normalizeAssetToken(
      value
    )

  if (!token) {
    return null
  }

  return ASSET_CONFIG.find(
    asset =>
      asset.key.replace(
        /_/g,
        ''
      ) === token ||
      asset.aliases.includes(
        token
      )
  ) || null
}

function parseQuantity(
  raw,
  maxQuantity = null
) {
  const token =
    String(
      raw || ''
    )
      .trim()
      .toLowerCase()

  if (
    token === 'all' ||
    token === 'max'
  ) {
    const value =
      Math.floor(
        Number(
          maxQuantity
        ) || 0
      )

    if (value <= 0) {
      throw new Error(
        'NX_NOTHING_AVAILABLE'
      )
    }

    return value
  }

  if (!/^\d+$/.test(token)) {
    throw new Error(
      'NX_INVALID_QUANTITY'
    )
  }

  const value =
    Number(token)

  if (
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new Error(
      'NX_INVALID_QUANTITY'
    )
  }

  return value
}

function marketRowToObject(
  row
) {
  return {
    key:
      row.asset_key,
    name:
      row.display_name,
    icon:
      row.icon,
    order:
      Number(
        row.sort_order
      ) || 0,
    price:
      Number(
        row.price
      ) || 0,
    previousPrice:
      Number(
        row.previous_price
      ) || 0,
    basePrice:
      Number(
        row.base_price
      ) || 0,
    updatedAt:
      Number(
        row.updated_at
      ) || 0
  }
}

function readMarketRows() {
  return db.prepare(`
    SELECT
      asset_key,
      display_name,
      icon,
      sort_order,
      price,
      previous_price,
      base_price,
      updated_at
    FROM investment_market
    ORDER BY sort_order ASC
  `).all()
}

function readMetaNumber(
  key,
  fallback = 0
) {
  const row =
    db.prepare(`
      SELECT value
      FROM investment_meta
      WHERE key = ?
    `).get(
      key
    )

  const value =
    Number(
      row?.value
    )

  return Number.isFinite(value)
    ? value
    : fallback
}

function setMetaNumber(
  key,
  value,
  now
) {
  db.prepare(`
    INSERT INTO investment_meta (
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
    key,
    String(value),
    now
  )
}

function randomBetween(
  min,
  max
) {
  return (
    min +
    Math.random() *
      (max - min)
  )
}

function nextPriceFor(
  row
) {
  const config =
    ASSET_CONFIG.find(
      asset =>
        asset.key ===
        row.asset_key
    )

  if (!config) {
    return {
      nextPrice:
        Number(row.price) || 1,
      changePercent:
        0
    }
  }

  const current =
    Math.max(
      1,
      Number(row.price) || 1
    )

  const base =
    Math.max(
      1,
      Number(row.base_price) || current
    )

  let direction =
    Math.random() < 0.5
      ? -1
      : 1

  // Sedikit mean reversion supaya harga tidak lari tanpa batas.
  if (
    current >= base * 1.6 &&
    Math.random() < 0.7
  ) {
    direction = -1
  } else if (
    current <= base * 0.7 &&
    Math.random() < 0.7
  ) {
    direction = 1
  }

  const magnitude =
    randomBetween(
      config.minMove,
      config.maxMove
    )

  const floor =
    Math.max(
      1,
      Math.round(
        base * 0.25
      )
    )

  const ceiling =
    Math.max(
      floor,
      Math.round(
        base * 5
      )
    )

  const candidate =
    Math.round(
      current *
      (
        1 +
        direction * magnitude
      )
    )

  const nextPrice =
    Math.min(
      ceiling,
      Math.max(
        floor,
        candidate
      )
    )

  const changePercent =
    current > 0
      ? (
          (nextPrice - current) /
          current
        ) * 100
      : 0

  return {
    nextPrice,
    changePercent
  }
}

function applyMarketTick(
  tickAt
) {
  const rows =
    readMarketRows()

  const update =
    db.prepare(`
      UPDATE investment_market
      SET
        previous_price = ?,
        price = ?,
        updated_at = ?
      WHERE asset_key = ?
    `)

  const history =
    db.prepare(`
      INSERT INTO investment_market_history (
        asset_key,
        price,
        previous_price,
        change_percent,
        tick_at
      )
      VALUES (?, ?, ?, ?, ?)
    `)

  for (const row of rows) {
    const previous =
      Number(
        row.price
      ) || 1

    const {
      nextPrice,
      changePercent
    } =
      nextPriceFor(
        row
      )

    update.run(
      previous,
      nextPrice,
      tickAt,
      row.asset_key
    )

    history.run(
      row.asset_key,
      nextPrice,
      previous,
      changePercent,
      tickAt
    )
  }
}

export function refreshInvestmentMarketIfDue({
  now = Date.now()
} = {}) {
  return withImmediateTransaction(
    () => {
      const lastTick =
        readMetaNumber(
          'market_last_tick',
          now
        )

      const elapsed =
        Math.max(
          0,
          now - lastTick
        )

      const dueTicks =
        Math.floor(
          elapsed /
          MARKET_INTERVAL_MS
        )

      if (dueTicks <= 0) {
        return {
          updated: false,
          ticks: 0,
          lastTickAt:
            lastTick,
          nextUpdateAt:
            lastTick +
            MARKET_INTERVAL_MS
        }
      }

      const ticks =
        Math.min(
          dueTicks,
          MAX_CATCHUP_TICKS
        )

      let tickAt =
        lastTick

      for (
        let i = 0;
        i < ticks;
        i += 1
      ) {
        tickAt +=
          MARKET_INTERVAL_MS

        applyMarketTick(
          tickAt
        )
      }

      // Kalau bot mati terlalu lama, jangan mengejar ratusan tick.
      // Setelah catch-up terbatas, sinkronkan jam market ke waktu sekarang.
      const finalTickAt =
        dueTicks > MAX_CATCHUP_TICKS
          ? now
          : tickAt

      setMetaNumber(
        'market_last_tick',
        finalTickAt,
        now
      )

      return {
        updated: true,
        ticks,
        lastTickAt:
          finalTickAt,
        nextUpdateAt:
          finalTickAt +
          MARKET_INTERVAL_MS
      }
    }
  )
}

export function ensureInvestmentAccount(
  jid,
  {
    isOwner = false
  } = {}
) {
  const playerId =
    requirePlayerId(
      jid
    )

  const now =
    Date.now()

  const starter =
    isOwner
      ? OWNER_NEXIUM
      : STARTER_NEXIUM

  const inserted =
    db.prepare(`
      INSERT OR IGNORE INTO
        investment_accounts (
          player_id,
          nexium,
          initialized_at,
          updated_at
        )
      VALUES (?, ?, ?, ?)
    `).run(
      playerId,
      starter,
      now,
      now
    )

  const created =
    Number(
      inserted?.changes
    ) > 0

  if (isOwner) {
    db.prepare(`
      UPDATE investment_accounts
      SET
        nexium = CASE
          WHEN nexium < ?
          THEN ?
          ELSE nexium
        END,
        updated_at = ?
      WHERE player_id = ?
    `).run(
      OWNER_NEXIUM,
      OWNER_NEXIUM,
      now,
      playerId
    )
  }

  return {
    created,
    account:
      toAccount(
        readAccountById(
          playerId
        )
      )
  }
}

export function getInvestmentAccount(
  jid
) {
  const playerId =
    requirePlayerId(
      jid
    )

  return toAccount(
    readAccountById(
      playerId
    )
  )
}

export function getInvestmentMarket({
  refresh = true
} = {}) {
  if (refresh) {
    refreshInvestmentMarketIfDue()
  }

  return readMarketRows()
    .map(
      marketRowToObject
    )
}

export function getInvestmentHoldings(
  jid
) {
  const playerId =
    requirePlayerId(
      jid
    )

  const rows =
    db.prepare(`
      SELECT
        asset_key,
        quantity,
        average_buy_price,
        updated_at
      FROM investment_holdings
      WHERE player_id = ?
    `).all(
      playerId
    )

  const byKey =
    new Map(
      rows.map(
        row => [
          row.asset_key,
          row
        ]
      )
    )

  return INVESTMENT_ASSETS
    .map(
      asset => {
        const row =
          byKey.get(
            asset.key
          )

        return {
          ...asset,
          quantity:
            Number(
              row?.quantity
            ) || 0,
          averageBuyPrice:
            Number(
              row?.average_buy_price
            ) || 0,
          updatedAt:
            Number(
              row?.updated_at
            ) || 0
        }
      }
    )
}

export function getInvestmentPortfolioValue(
  jid
) {
  const market =
    new Map(
      getInvestmentMarket()
        .map(
          asset => [
            asset.key,
            asset.price
          ]
        )
    )

  return getInvestmentHoldings(
    jid
  ).reduce(
    (
      total,
      holding
    ) =>
      total +
      (
        holding.quantity *
        (
          market.get(
            holding.key
          ) || 0
        )
      ),
    0
  )
}

function getMarketAssetByKey(
  key
) {
  const row =
    db.prepare(`
      SELECT
        asset_key,
        display_name,
        icon,
        sort_order,
        price,
        previous_price,
        base_price,
        updated_at
      FROM investment_market
      WHERE asset_key = ?
    `).get(
      key
    )

  return row
    ? marketRowToObject(
        row
      )
    : null
}

function safeTradeTotal(
  price,
  quantity
) {
  const total =
    price * quantity

  if (
    !Number.isSafeInteger(total) ||
    total < 0
  ) {
    throw new Error(
      'NX_AMOUNT_TOO_LARGE'
    )
  }

  return total
}

export function buyInvestmentAsset(
  jid,
  assetInput,
  quantityInput,
  {
    isOwner = false
  } = {}
) {
  refreshInvestmentMarketIfDue()

  const playerId =
    requirePlayerId(
      jid
    )

  const asset =
    resolveInvestmentAsset(
      assetInput
    )

  if (!asset) {
    throw new Error(
      'NX_ASSET_NOT_FOUND'
    )
  }

  return withImmediateTransaction(
    () => {
      const account =
        readAccountById(
          playerId
        )

      if (!account) {
        throw new Error(
          'NX_ACCOUNT_NOT_FOUND'
        )
      }

      const market =
        getMarketAssetByKey(
          asset.key
        )

      if (!market) {
        throw new Error(
          'NX_ASSET_NOT_FOUND'
        )
      }

      const balance =
        Number(
          account.nexium
        ) || 0

      const affordable =
        Math.floor(
          balance /
          market.price
        )

      const quantity =
        parseQuantity(
          quantityInput,
          affordable
        )

      const cost =
        safeTradeTotal(
          market.price,
          quantity
        )

      if (
        !isOwner &&
        cost > balance
      ) {
        throw new Error(
          'NX_INSUFFICIENT_NEXIUM'
        )
      }

      const current =
        db.prepare(`
          SELECT
            quantity,
            average_buy_price
          FROM investment_holdings
          WHERE
            player_id = ? AND
            asset_key = ?
        `).get(
          playerId,
          asset.key
        )

      const oldQty =
        Number(
          current?.quantity
        ) || 0

      const oldAvg =
        Number(
          current?.average_buy_price
        ) || 0

      const newQty =
        oldQty + quantity

      if (!Number.isSafeInteger(newQty)) {
        throw new Error(
          'NX_AMOUNT_TOO_LARGE'
        )
      }

      const oldCost =
        safeTradeTotal(
          oldAvg,
          oldQty
        )

      const combinedCost =
        oldCost + cost

      if (!Number.isSafeInteger(combinedCost)) {
        throw new Error(
          'NX_AMOUNT_TOO_LARGE'
        )
      }

      const newAvg =
        newQty > 0
          ? Math.round(
              combinedCost /
              newQty
            )
          : 0

      const now =
        Date.now()

      const newBalance =
        isOwner
          ? OWNER_NEXIUM
          : balance - cost

      db.prepare(`
        UPDATE investment_accounts
        SET
          nexium = ?,
          updated_at = ?
        WHERE player_id = ?
      `).run(
        newBalance,
        now,
        playerId
      )

      db.prepare(`
        INSERT INTO investment_holdings (
          player_id,
          asset_key,
          quantity,
          average_buy_price,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(
          player_id,
          asset_key
        )
        DO UPDATE SET
          quantity = excluded.quantity,
          average_buy_price = excluded.average_buy_price,
          updated_at = excluded.updated_at
      `).run(
        playerId,
        asset.key,
        newQty,
        newAvg,
        now
      )

      db.prepare(`
        INSERT INTO investment_transactions (
          player_id,
          type,
          asset_key,
          quantity,
          unit_price,
          nexium_delta,
          balance_after,
          note,
          created_at
        )
        VALUES (?, 'BUY', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        playerId,
        asset.key,
        quantity,
        market.price,
        -cost,
        newBalance,
        isOwner
          ? 'owner-bypass'
          : null,
        now
      )

      return {
        type: 'BUY',
        asset,
        quantity,
        unitPrice:
          market.price,
        total:
          cost,
        balance:
          newBalance,
        holding:
          newQty,
        averageBuyPrice:
          newAvg
      }
    }
  )
}

export function sellInvestmentAsset(
  jid,
  assetInput,
  quantityInput,
  {
    isOwner = false
  } = {}
) {
  refreshInvestmentMarketIfDue()

  const playerId =
    requirePlayerId(
      jid
    )

  const asset =
    resolveInvestmentAsset(
      assetInput
    )

  if (!asset) {
    throw new Error(
      'NX_ASSET_NOT_FOUND'
    )
  }

  return withImmediateTransaction(
    () => {
      const account =
        readAccountById(
          playerId
        )

      if (!account) {
        throw new Error(
          'NX_ACCOUNT_NOT_FOUND'
        )
      }

      const market =
        getMarketAssetByKey(
          asset.key
        )

      if (!market) {
        throw new Error(
          'NX_ASSET_NOT_FOUND'
        )
      }

      const current =
        db.prepare(`
          SELECT
            quantity,
            average_buy_price
          FROM investment_holdings
          WHERE
            player_id = ? AND
            asset_key = ?
        `).get(
          playerId,
          asset.key
        )

      const oldQty =
        Number(
          current?.quantity
        ) || 0

      if (oldQty <= 0) {
        throw new Error(
          'NX_NOTHING_TO_SELL'
        )
      }

      const quantity =
        parseQuantity(
          quantityInput,
          oldQty
        )

      if (quantity > oldQty) {
        throw new Error(
          'NX_NOT_ENOUGH_ASSET'
        )
      }

      const revenue =
        safeTradeTotal(
          market.price,
          quantity
        )

      const oldBalance =
        Number(
          account.nexium
        ) || 0

      const newBalance =
        isOwner
          ? OWNER_NEXIUM
          : oldBalance + revenue

      if (
        !Number.isSafeInteger(
          newBalance
        )
      ) {
        throw new Error(
          'NX_AMOUNT_TOO_LARGE'
        )
      }

      const newQty =
        oldQty - quantity

      const now =
        Date.now()

      db.prepare(`
        UPDATE investment_accounts
        SET
          nexium = ?,
          updated_at = ?
        WHERE player_id = ?
      `).run(
        newBalance,
        now,
        playerId
      )

      db.prepare(`
        UPDATE investment_holdings
        SET
          quantity = ?,
          average_buy_price = CASE
            WHEN ? = 0 THEN 0
            ELSE average_buy_price
          END,
          updated_at = ?
        WHERE
          player_id = ? AND
          asset_key = ?
      `).run(
        newQty,
        newQty,
        now,
        playerId,
        asset.key
      )

      db.prepare(`
        INSERT INTO investment_transactions (
          player_id,
          type,
          asset_key,
          quantity,
          unit_price,
          nexium_delta,
          balance_after,
          note,
          created_at
        )
        VALUES (?, 'SELL', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        playerId,
        asset.key,
        quantity,
        market.price,
        revenue,
        newBalance,
        isOwner
          ? 'owner-bypass'
          : null,
        now
      )

      return {
        type: 'SELL',
        asset,
        quantity,
        unitPrice:
          market.price,
        total:
          revenue,
        balance:
          newBalance,
        holding:
          newQty
      }
    }
  )
}

export function formatNexium(
  value
) {
  return Math.trunc(
    Number(value) || 0
  ).toLocaleString(
    'id-ID'
  )
}
