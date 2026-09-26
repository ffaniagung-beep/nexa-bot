// NEXA_INVESTMENT_FOUNDATION_V1
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

export const INVESTMENT_ASSETS = [
  {
    key: 'iron',
    name: 'Iron',
    icon: '⛓️'
  },
  {
    key: 'gold',
    name: 'Gold',
    icon: '🪙'
  },
  {
    key: 'diamond',
    name: 'Diamond',
    icon: '💎'
  },
  {
    key: 'nexium_crystal',
    name: 'Nexium Crystal',
    icon: '🔷'
  },
  {
    key: 'rhodium',
    name: 'Rhodium',
    icon: '⚪'
  }
]

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

  let created =
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

export function getInvestmentMarket() {
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
    .map(
      row => ({
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
      })
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

export function formatNexium(
  value
) {
  return Math.trunc(
    Number(value) || 0
  ).toLocaleString(
    'id-ID'
  )
}
