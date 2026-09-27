// NEXA_INVESTMENT_GROUP_NEWS_V41
import { DatabaseSync } from 'node:sqlite'

const DB_FILE = './database/nexa.sqlite'
const CHECK_INTERVAL_MS = 60 * 1000
const FIRST_DELAY_MIN_MS = 5 * 60 * 1000
const FIRST_DELAY_MAX_MS = 20 * 60 * 1000
const NEXT_DELAY_MIN_MS = 45 * 60 * 1000
const NEXT_DELAY_MAX_MS = 150 * 60 * 1000
const RETRY_DELAY_MS = 15 * 60 * 1000
const MAX_EVENTS_PER_TICK = 3

let intervalId = null
let warmupId = null
let running = false

const db = new DatabaseSync(DB_FILE, { timeout: 5000 })

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 10000;
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
`)

const ASSET_EVENT_POOLS = {
  iron: {
    up: [
      ['⛓️ Iron Supply Tightens', 'Persediaan Iron di gudang distributor menipis. Buyer mulai berebut stok yang tersedia.'],
      ['🏭 Factory Orders Rise', 'Pabrik-pabrik Nexa meningkatkan pesanan Iron untuk memenuhi produksi baru.'],
      ['🏗️ Building Boom', 'Proyek konstruksi baru mendorong permintaan Iron di beberapa wilayah Nexa.'],
      ['🚚 Logistics Recovery', 'Jalur distribusi Iron pulih dan aktivitas pembelian industri kembali ramai.']
    ],
    down: [
      ['📦 Iron Stockpile Released', 'Distributor besar melepas stok Iron lama sehingga suplai market bertambah.'],
      ['🏭 Factory Slowdown', 'Aktivitas produksi melambat dan kebutuhan Iron ikut turun.'],
      ['⛏️ New Iron Mine', 'Tambang Iron baru mulai beroperasi dan ekspektasi suplai meningkat.'],
      ['📉 Bulk Orders Cancelled', 'Sejumlah pembeli besar membatalkan kontrak Iron dan tekanan jual meningkat.']
    ]
  },

  gold: {
    up: [
      ['🪙 Gold Demand Surges', 'Trader Nexa ramai mengalihkan sebagian portofolio ke Gold dan permintaan meningkat.'],
      ['🏦 Reserve Accumulation', 'Lembaga besar dilaporkan menambah cadangan Gold secara bertahap.'],
      ['✨ Jewelry Orders Jump', 'Pesanan Gold dari sektor kerajinan Nexa mengalami lonjakan.'],
      ['🚢 Gold Shipment Delayed', 'Pengiriman Gold tertunda dan pasokan jangka pendek menjadi lebih ketat.']
    ],
    down: [
      ['⛏️ Major Gold Discovery', 'Cadangan Gold baru ditemukan dan ekspektasi suplai masa depan meningkat.'],
      ['💰 Gold Profit Taking', 'Holder Gold mulai mengunci keuntungan setelah pergerakan sebelumnya.'],
      ['🏦 Reserve Sale', 'Sebagian cadangan Gold dilepas ke market dan suplai spot bertambah.'],
      ['🧊 Gold Demand Cools', 'Minat pembeli Gold melemah dan volume transaksi mulai turun.']
    ]
  },

  diamond: {
    up: [
      ['🐋 Diamond Whale Buy', 'Investor besar menyapu Diamond dalam jumlah masif dan market memanas.'],
      ['💎 Luxury Demand', 'Permintaan Diamond dari sektor barang premium Nexa meningkat.'],
      ['📦 Diamond Shortage', 'Stok Diamond berkualitas tinggi menipis dan buyer menaikkan penawaran.'],
      ['🔨 Diamond Auction Record', 'Lelang Diamond mencetak harga tinggi dan sentimen buyer ikut menguat.']
    ],
    down: [
      ['🚨 Diamond Panic Sell', 'Gelombang aksi jual Diamond muncul setelah holder besar mengurangi posisi.'],
      ['⛏️ Diamond Supply Expands', 'Tambang baru meningkatkan perkiraan pasokan Diamond ke market.'],
      ['🥶 Diamond Demand Fades', 'Permintaan Diamond premium melambat dan seller mulai lebih agresif.'],
      ['🐋 Whale Exit', 'Salah satu holder besar Diamond melepas sebagian posisinya ke market.']
    ]
  },

  nexium_crystal: {
    up: [
      ['🔷 Nexium Industrial Rush', 'Permintaan Nexium Crystal meningkat untuk proyek teknologi baru.'],
      ['🧪 Crystal Lab Breakthrough', 'Riset baru menemukan penggunaan tambahan Nexium Crystal.'],
      ['🔒 Crystal Supply Locked', 'Sebagian pemasok menahan stok Nexium Crystal sehingga suplai menyusut.'],
      ['📑 Major Crystal Contract', 'Kontrak besar Nexium Crystal diumumkan dan permintaan meningkat.']
    ],
    down: [
      ['⚙️ Crystal Efficiency Upgrade', 'Teknologi baru mengurangi kebutuhan Nexium Crystal per unit produksi.'],
      ['📦 Crystal Stock Released', 'Cadangan Nexium Crystal dalam jumlah besar kembali masuk ke market.'],
      ['🕒 Tech Project Delayed', 'Sejumlah proyek pengguna Nexium Crystal ditunda dan permintaan melemah.'],
      ['💸 Crystal Profit Taking', 'Holder Nexium Crystal melakukan aksi ambil untung.']
    ]
  },

  rhodium: {
    up: [
      ['⚪ Rhodium Mining Disruption', 'Gangguan produksi membuat pasokan Rhodium lebih ketat.'],
      ['🏭 Rhodium Industrial Demand', 'Permintaan industri Rhodium melonjak dan stok spot mulai menipis.'],
      ['🐋 Rhodium Accumulation', 'Holder besar menambah posisi Rhodium secara bertahap.'],
      ['🚢 Rhodium Export Delay', 'Pengiriman Rhodium tertunda sehingga suplai jangka pendek tertekan.']
    ],
    down: [
      ['🚨 Rhodium Panic Sell', 'Aksi jual Rhodium meningkat dan holder besar ikut mengurangi posisi.'],
      ['⛏️ Rhodium Output Jumps', 'Produksi Rhodium meningkat lebih cepat dari perkiraan.'],
      ['📉 Rhodium Demand Drops', 'Permintaan industri Rhodium turun dan seller mulai mendominasi.'],
      ['🐋 Rhodium Distribution', 'Holder besar Rhodium melepas posisi secara bertahap.']
    ]
  }
}

const GLOBAL_EVENTS = {
  up: [
    ['📈 Nexa Market Rally', 'Sentimen positif menyebar di Nexa Market dan minat beli meningkat.'],
    ['💧 Liquidity Wave', 'Likuiditas baru masuk dan aktivitas pembelian market meningkat.'],
    ['🌤️ Market Confidence', 'Kepercayaan trader meningkat setelah sesi market yang relatif stabil.'],
    ['🔄 Broad Asset Rotation', 'Dana berputar ke berbagai aset Nexa dan volume market meningkat.']
  ],
  down: [
    ['📉 Nexa Market Shock', 'Sentimen risk-off muncul dan seller mendominasi beberapa aset.'],
    ['🌊 Liquidity Dries Up', 'Likuiditas market menurun dan buyer menjadi lebih berhati-hati.'],
    ['💸 Broad Profit Taking', 'Aksi ambil untung terjadi di beberapa aset Nexa.'],
    ['🌫️ Market Uncertainty', 'Ketidakpastian meningkat dan trader mengurangi eksposur.']
  ]
}

function randomDelay(min, max) {
  return Math.round(min + Math.random() * (max - min))
}

function choose(list) {
  if (!Array.isArray(list) || !list.length) return null
  return list[Math.floor(Math.random() * list.length)]
}

function normalizeGroupJid(value) {
  const jid = String(value || '').trim().toLowerCase()
  return jid.endsWith('@g.us') ? jid : null
}

function normalizeBotJid(value) {
  const raw = String(value || '').trim().toLowerCase()
  const at = raw.lastIndexOf('@')
  if (at < 1) return null

  const local = raw.slice(0, at).split(':')[0]
  const domain = raw.slice(at + 1)

  if (!local) return null
  if (domain !== 's.whatsapp.net' && domain !== 'lid') return null

  return `${local}@${domain}`
}

function readMarket() {
  return db.prepare(`
    SELECT
      asset_key,
      display_name,
      icon,
      sort_order,
      price,
      previous_price
    FROM investment_market
    ORDER BY sort_order ASC
  `).all()
}

function signFromPrices(current, previous) {
  const now = Number(current) || 0
  const old = Number(previous) || now
  if (now > old) return 1
  if (now < old) return -1
  return Math.random() < 0.5 ? -1 : 1
}

function marketBreadth(market) {
  let score = 0
  for (const asset of market) {
    score += signFromPrices(asset.price, asset.previous_price)
  }
  if (score > 0) return 1
  if (score < 0) return -1
  return Math.random() < 0.5 ? -1 : 1
}

function toEventObject(row) {
  if (!row) return null

  return {
    id: Number(row.id) || 0,
    groupJid: row.group_jid,
    botJid: row.bot_jid,
    title: row.title,
    body: row.body,
    assetKey: row.asset_key || null,
    assetName: row.asset_name || 'Semua aset',
    assetIcon: row.asset_icon || '🌐',
    sentiment: Number(row.sentiment) || 0,
    marketPrice: Number(row.market_price) || 0,
    previousPrice: Number(row.previous_price) || 0,
    createdAt: Number(row.created_at) || 0
  }
}

function pickLocalEvent(market) {
  const useGlobal = Math.random() < 0.2

  if (useGlobal || !market.length) {
    const sentiment = marketBreadth(market)
    const [title, body] = choose(
      sentiment > 0 ? GLOBAL_EVENTS.up : GLOBAL_EVENTS.down
    )

    return {
      title,
      body,
      asset: null,
      sentiment
    }
  }

  const asset = choose(market)
  const sentiment = signFromPrices(asset.price, asset.previous_price)
  const pool = ASSET_EVENT_POOLS[asset.asset_key]
  const variants = sentiment > 0 ? pool?.up : pool?.down
  const selected = choose(variants)

  if (!selected) {
    throw new Error('NX_GROUP_NEWS_TEMPLATE_NOT_FOUND')
  }

  return {
    title: selected[0],
    body: selected[1],
    asset,
    sentiment
  }
}

function withImmediateTransaction(work) {
  db.exec('BEGIN IMMEDIATE')

  try {
    const result = work()
    db.exec('COMMIT')
    return result
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {}
    throw error
  }
}

function createLocalEvent(groupJid, botJid, now) {
  const picked = pickLocalEvent(readMarket())
  const asset = picked.asset

  const result = db.prepare(`
    INSERT INTO investment_group_news_events (
      group_jid,
      bot_jid,
      title,
      body,
      asset_key,
      asset_name,
      asset_icon,
      sentiment,
      market_price,
      previous_price,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    groupJid,
    botJid,
    picked.title,
    picked.body,
    asset?.asset_key || null,
    asset?.display_name || 'Semua aset',
    asset?.icon || '🌐',
    picked.sentiment,
    Number(asset?.price) || 0,
    Number(asset?.previous_price) || 0,
    now
  )

  const id = Number(result.lastInsertRowid)

  db.prepare(`
    UPDATE investment_group_news_state
    SET
      last_event_id = ?,
      updated_at = ?
    WHERE group_jid = ?
  `).run(
    id,
    now,
    groupJid
  )

  return toEventObject(
    db.prepare(`
      SELECT *
      FROM investment_group_news_events
      WHERE id = ?
    `).get(id)
  )
}

function claimDueGroup(botJid, now) {
  return withImmediateTransaction(() => {
    const row = db.prepare(`
      SELECT group_jid
      FROM investment_group_news_state
      WHERE
        enabled = 1 AND
        bot_jid = ? AND
        next_event_at <= ?
      ORDER BY next_event_at ASC
      LIMIT 1
    `).get(botJid, now)

    if (!row) return null

    const nextEventAt =
      now + randomDelay(NEXT_DELAY_MIN_MS, NEXT_DELAY_MAX_MS)

    const updated = db.prepare(`
      UPDATE investment_group_news_state
      SET
        next_event_at = ?,
        updated_at = ?
      WHERE
        group_jid = ? AND
        bot_jid = ? AND
        enabled = 1 AND
        next_event_at <= ?
    `).run(
      nextEventAt,
      now,
      row.group_jid,
      botJid,
      now
    )

    if (Number(updated?.changes) <= 0) return null

    return {
      groupJid: row.group_jid,
      botJid,
      nextEventAt
    }
  })
}

function markSendFailure(groupJid, botJid) {
  const now = Date.now()

  db.prepare(`
    UPDATE investment_group_news_state
    SET
      next_event_at = ?,
      updated_at = ?
    WHERE
      group_jid = ? AND
      bot_jid = ?
  `).run(
    now + RETRY_DELAY_MS,
    now,
    groupJid,
    botJid
  )
}

export function registerInvestmentNewsGroup(
  groupJidInput,
  botJidInput
) {
  const groupJid = normalizeGroupJid(groupJidInput)
  const botJid = normalizeBotJid(botJidInput)

  if (!groupJid || !botJid) return null

  const now = Date.now()
  const firstEventAt =
    now + randomDelay(FIRST_DELAY_MIN_MS, FIRST_DELAY_MAX_MS)

  db.prepare(`
    INSERT INTO investment_group_news_state (
      group_jid,
      bot_jid,
      enabled,
      next_event_at,
      last_event_id,
      registered_at,
      updated_at
    )
    VALUES (?, ?, 1, ?, NULL, ?, ?)

    ON CONFLICT(group_jid)
    DO UPDATE SET
      bot_jid = excluded.bot_jid,
      enabled = 1,
      updated_at = excluded.updated_at
  `).run(
    groupJid,
    botJid,
    firstEventAt,
    now,
    now
  )

  return getInvestmentGroupNewsState(groupJid)
}

export function getInvestmentGroupNewsState(groupJidInput) {
  const groupJid = normalizeGroupJid(groupJidInput)
  if (!groupJid) return null

  const row = db.prepare(`
    SELECT
      group_jid,
      bot_jid,
      enabled,
      next_event_at,
      last_event_id,
      registered_at,
      updated_at
    FROM investment_group_news_state
    WHERE group_jid = ?
  `).get(groupJid)

  if (!row) return null

  return {
    groupJid: row.group_jid,
    botJid: row.bot_jid,
    enabled: Boolean(row.enabled),
    nextEventAt: Number(row.next_event_at) || 0,
    lastEventId: Number(row.last_event_id) || null,
    registeredAt: Number(row.registered_at) || 0,
    updatedAt: Number(row.updated_at) || 0
  }
}

export function getLatestInvestmentGroupNews(groupJidInput) {
  const groupJid = normalizeGroupJid(groupJidInput)
  if (!groupJid) return null

  return toEventObject(
    db.prepare(`
      SELECT *
      FROM investment_group_news_events
      WHERE group_jid = ?
      ORDER BY id DESC
      LIMIT 1
    `).get(groupJid)
  )
}

export function formatInvestmentGroupNews(event) {
  if (!event) return null

  const sentiment =
    event.sentiment > 0
      ? '▲ Bullish'
      : '▼ Bearish'

  const target =
    event.assetKey
      ? `${event.assetIcon} ${event.assetName}`
      : '🌐 Seluruh market'

  const priceLine =
    event.assetKey && event.marketPrice > 0
      ? `\n🏷 Harga saat berita: *${event.marketPrice.toLocaleString('id-ID')} NX*`
      : ''

  return (
    '📰 *NEXA • LOCAL MARKET NEWS*\n' +
    '━━━━━━━━━━━━━━━━━━\n\n' +
    `*${event.title}*\n` +
    `${event.body}\n\n` +
    `🎯 Fokus: *${target}*\n` +
    `📊 Sentimen lokal: *${sentiment}*` +
    priceLine +
    '\n\n🌐 Harga aset tetap mengikuti satu Nexa Market global.\n' +
    '🎮 Berita ini fiktif dan khusus simulasi Nexa.'
  )
}

async function sendLocalEvent(sock, claim) {
  const now = Date.now()

  const event = withImmediateTransaction(
    () => createLocalEvent(
      claim.groupJid,
      claim.botJid,
      now
    )
  )

  try {
    await sock.sendMessage(
      claim.groupJid,
      {
        text: formatInvestmentGroupNews(event)
      }
    )
  } catch (error) {
    markSendFailure(
      claim.groupJid,
      claim.botJid
    )
    throw error
  }

  return event
}

async function tick(sock) {
  if (running) return
  running = true

  try {
    const botJid = normalizeBotJid(
      sock?.user?.id || sock?.user?.lid
    )

    if (!botJid) return

    for (
      let i = 0;
      i < MAX_EVENTS_PER_TICK;
      i += 1
    ) {
      const claim = claimDueGroup(
        botJid,
        Date.now()
      )

      if (!claim) break

      try {
        const event = await sendLocalEvent(
          sock,
          claim
        )

        console.log(
          `📰 NX News ${claim.groupJid}: ${event?.title || 'event'}`
        )
      } catch (error) {
        console.error(
          `📰 NX News ${claim.groupJid}:`,
          error?.message || error
        )
      }
    }
  } finally {
    running = false
  }
}

export function startInvestmentGroupNewsService(sock) {
  if (warmupId) {
    clearTimeout(warmupId)
    warmupId = null
  }

  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }

  if (!sock || typeof sock.sendMessage !== 'function') {
    console.log(
      '⚠️ NX Group News: socket tidak mendukung sendMessage.'
    )
    return
  }

  warmupId = setTimeout(
    () => {
      tick(sock).catch(error => {
        console.error(
          '📰 NX News warmup:',
          error?.message || error
        )
      })
    },
    10_000
  )

  intervalId = setInterval(
    () => {
      tick(sock).catch(error => {
        console.error(
          '📰 NX News tick:',
          error?.message || error
        )
      })
    },
    CHECK_INTERVAL_MS
  )

  intervalId?.unref?.()
  warmupId?.unref?.()

  console.log(
    '📰 NX Group News service aktif • random per grup.'
  )
}
