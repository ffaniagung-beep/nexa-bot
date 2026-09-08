import {
  DatabaseSync
} from 'node:sqlite'

import {
  resolvePlayerId
} from '../playerdb.js'

import {
  resolveProfileJid
} from '../profile.js'

import {
  getRpgShop,
  buyRpgItem,
  sellRpgItem,
  getRpgInventoryDetail,
  equipRpgGear,
  unequipRpgGear,
  enchantRpgGear,
  gearStatBonus,
  RPG_EXCHANGE,
  exchangeRpgMoney
} from './store.js'

import {
  useRpgItem
} from './useItem.js'

const db =
  new DatabaseSync(
    './database/nexa.sqlite',
    {
      timeout: 5000
    }
  )

db.exec(`
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
  )
`)

const SESSION_TTL =
  30 * 60 * 1000

const locks =
  new Set()

function num(
  value
) {
  return Number(
    value || 0
  ).toLocaleString(
    'id-ID'
  )
}

function safeJson(
  value,
  fallback
) {
  try {
    return JSON.parse(
      value
    )
  } catch {
    return fallback
  }
}

function getReplyId(
  msg
) {
  return (
    msg?.message
      ?.extendedTextMessage
      ?.contextInfo
      ?.stanzaId ||
    null
  )
}

function safeKey(
  key,
  jid
) {
  if (!key?.id) {
    return null
  }

  const out = {
    remoteJid:
      key.remoteJid ||
      jid,

    fromMe:
      true,

    id:
      key.id
  }

  if (
    key.participant
  ) {
    out.participant =
      key.participant
  }

  return out
}

function saveSession({
  playerId,
  type,
  jid,
  key,
  payload
}) {
  const stored =
    safeKey(
      key,
      jid
    )

  if (!stored?.id) {
    return false
  }

  const now =
    Date.now()

  db.prepare(`
    INSERT INTO rpg_ui_sessions (
      player_id,
      type,
      chat_jid,
      message_id,
      message_key,
      payload_json,
      expires_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)

    ON CONFLICT(player_id)
    DO UPDATE SET
      type =
        excluded.type,

      chat_jid =
        excluded.chat_jid,

      message_id =
        excluded.message_id,

      message_key =
        excluded.message_key,

      payload_json =
        excluded.payload_json,

      expires_at =
        excluded.expires_at,

      updated_at =
        excluded.updated_at
  `).run(
    playerId,
    type,
    jid,
    stored.id,
    JSON.stringify(
      stored
    ),
    JSON.stringify(
      payload || {}
    ),
    now +
      SESSION_TTL,
    now
  )

  return true
}

function getSession(
  playerId
) {
  const row =
    db.prepare(`
      SELECT *
      FROM rpg_ui_sessions
      WHERE player_id = ?
    `).get(
      playerId
    )

  if (!row) {
    return null
  }

  if (
    Number(row.expires_at) <
    Date.now()
  ) {
    db.prepare(`
      DELETE FROM rpg_ui_sessions
      WHERE player_id = ?
    `).run(
      playerId
    )

    return null
  }

  return row
}

function storedKey(
  session
) {
  const parsed =
    safeJson(
      session?.message_key,
      null
    )

  if (parsed?.id) {
    return parsed
  }

  if (
    session?.message_id
  ) {
    return {
      remoteJid:
        session.chat_jid,

      fromMe:
        true,

      id:
        session.message_id
    }
  }

  return null
}

function rarity(
  value
) {
  const map = {
    Starter: '⚪',
    Common: '⚪',
    Uncommon: '🟢',
    Rare: '🔵',
    Epic: '🟣'
  }

  return (
    map[value] ||
    '⚪'
  )
}

function classLabel(
  value
) {
  const map = {
    warrior: '⚔️ Warrior',
    ranger: '🏹 Ranger',
    mage: '🔮 Mage'
  }

  return (
    map[value] ||
    value ||
    '-'
  )
}

// =====================================
// SHOP
// =====================================

function shopState(
  userJid
) {
  const data =
    getRpgShop(
      userJid
    )

  const gear =
    data.items.filter(
      item =>
        item.type ===
        'gear'
    )

  const consumable =
    data.items.filter(
      item =>
        item.type ===
        'consumable'
    )

  const entries = [
    ...gear,
    ...consumable
  ]

  return {
    data,
    gear,
    consumable,
    entries
  }
}

function renderShop(
  userJid,
  status = null
) {
  const state =
    shopState(
      userJid
    )

  const p =
    state.data.profile

  const indexOf =
    item =>
      state.entries.indexOf(
        item
      ) + 1

  const line =
    item => {
      const locked =
        Number(p.level) <
        Number(
          item.minLevel || 1
        )

      const stats = []

      if (item.attack) {
        stats.push(
          `⚔️+${item.attack}`
        )
      }

      if (item.defense) {
        stats.push(
          `🛡+${item.defense}`
        )
      }

      if (item.heal) {
        stats.push(
          `❤️+${item.heal}`
        )
      }

      if (item.mana) {
        stats.push(
          `🔷+${item.mana}`
        )
      }

      return (
        `│ ${indexOf(item)}. ` +
        `${locked ? '🔒' : item.icon} ` +
        `*${item.name}*\n` +

        `│    ${rarity(item.rarity)} ${item.rarity} ` +
        `• Lv.${item.minLevel || 1}\n` +

        (
          stats.length
            ? `│    ${stats.join(' • ')}\n`
            : ''
        ) +

        `│    💵 ${num(item.buyPrice)}`
      )
    }

  const statusText =
    status
      ? (
          `│\n` +
          `├────〔 📜 *STATUS* 〕────\n` +
          `│ ${status}\n`
        )
      : ''

  const text =
    `╭━━━━〔 🛒 *RPG STORE* 〕━━━━╮\n` +
    `│\n` +
    `│ 🧬 ${classLabel(p.class)} • Lv.${p.level}\n` +
    `│ 💵 Money: *${num(p.money)}*\n` +
    `│\n` +

    `├────〔 ⚔️ *GEAR UNTUKMU* 〕────\n` +
    (
      state.gear.length
        ? state.gear
            .map(line)
            .join('\n│\n')
        : '│ _Belum ada gear tersedia._'
    ) +
    `\n│\n` +

    `├────〔 🧪 *ITEM UMUM* 〕────\n` +
    (
      state.consumable.length
        ? state.consumable
            .map(line)
            .join('\n│\n')
        : '│ _Belum ada item._'
    ) +
    `\n` +
    `│
` +
    `├────〔 🔄 *EXCHANGE* 〕────
` +
    `│ 🪙 ${num(RPG_EXCHANGE.coin.price)} Money → ${num(RPG_EXCHANGE.coin.reward)} Coin
` +
    `│    Cap ${num(RPG_EXCHANGE.coin.dailyCap)} Coin/hari
` +
    `│
` +
    `│ 🎟️ ${num(RPG_EXCHANGE.limit.price)} Money → ${num(RPG_EXCHANGE.limit.reward)} Limit
` +
    `│    Cap ${num(RPG_EXCHANGE.limit.dailyCap)} Limit/hari
` +
    `│
` +
    `│ Reply: *convert coin 1*
` +
    `│ Reply: *convert limit 1*
` +
    `│
` +
    statusText +
    `│\n` +
    `├────〔 💬 *REPLY ACTION* 〕────\n` +
    `│ buy <nomor>\n` +
    `│ buy <nomor> <jumlah>\n` +
    `│\n` +
    `│ Contoh: *buy 5 3*\n` +
    `│\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━━━╯`

  return {
    text,

    payload: {
      entries:
        state.entries.map(
          item =>
            item.id
        )
    }
  }
}

// =====================================
// INVENTORY
// =====================================

function inventoryState(
  userJid
) {
  const data =
    getRpgInventoryDetail(
      userJid
    )

  const entries = []

  for (
    const gear
    of data.gears
  ) {
    entries.push({
      kind: 'gear',
      gear
    })
  }

  for (
    const stack
    of data.stacks
  ) {
    entries.push({
      kind: 'stack',
      stack
    })
  }

  return {
    data,
    entries
  }
}

function renderInventory(
  userJid,
  status = null
) {
  const state =
    inventoryState(
      userJid
    )

  const gearEntries =
    state.entries.filter(
      entry =>
        entry.kind ===
        'gear'
    )

  const consumables =
    state.entries.filter(
      entry =>
        entry.kind ===
          'stack' &&
        entry.stack.item?.type ===
          'consumable'
    )

  const materials =
    state.entries.filter(
      entry =>
        entry.kind ===
          'stack' &&
        entry.stack.item?.type ===
          'material'
    )

  const indexOf =
    entry =>
      state.entries.indexOf(
        entry
      ) + 1

  const renderGear =
    entry => {
      const g =
        entry.gear

      const item =
        g.item

      const bonus =
        gearStatBonus(
          item,
          g.enchant_level
        )

      return (
        `│ ${indexOf(entry)}. ` +
        `${g.equipped ? '✅' : '▫️'} ` +
        `${item?.icon || '📦'} ` +
        `*${item?.name || g.item_id}* ` +
        `+${g.enchant_level || 0}\n` +

        `│    ${g.code} • ${item?.slot || '-'}\n` +

        `│    ⚔️+${bonus.attack} ` +
        `• 🛡+${bonus.defense}`
      )
    }

  const renderStack =
    entry => {
      const s =
        entry.stack

      return (
        `│ ${indexOf(entry)}. ` +
        `${s.item?.icon || '📦'} ` +
        `*${s.item?.name || s.item_id}* ` +
        `×${s.quantity}\n` +

        `│    ${rarity(
          s.item?.rarity
        )} ${s.item?.rarity || 'Common'}`
      )
    }

  const statusText =
    status
      ? (
          `│\n` +
          `├────〔 📜 *STATUS* 〕────\n` +
          `│ ${status}\n`
        )
      : ''

  const text =
    `╭━━━━〔 🎒 *RPG INVENTORY* 〕━━━━╮\n` +
    `│\n` +

    `├────〔 ⚔️ *EQUIPMENT* 〕────\n` +
    (
      gearEntries.length
        ? gearEntries
            .map(renderGear)
            .join('\n│\n')
        : '│ _Belum ada equipment._'
    ) +
    `\n│\n` +

    `├────〔 🧪 *CONSUMABLE* 〕────\n` +
    (
      consumables.length
        ? consumables
            .map(renderStack)
            .join('\n│\n')
        : '│ _Kosong._'
    ) +
    `\n│\n` +

    `├────〔 📦 *MATERIAL* 〕────\n` +
    (
      materials.length
        ? materials
            .map(renderStack)
            .join('\n│\n')
        : '│ _Kosong._'
    ) +
    `\n` +
    statusText +
    `│\n` +

    `├────〔 💬 *REPLY ACTION* 〕────\n` +
    `│ equip <nomor>\n` +
    `│ enchant <nomor>\n` +
    `│ use <nomor>\n` +
    `│ sell <nomor> [jumlah]\n` +
    `│ unequip weapon/armor/accessory\n` +
    `│\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━━━━╯`

  return {
    text,

    payload: {
      entries:
        state.entries.map(
          entry => {
            if (
              entry.kind ===
              'gear'
            ) {
              return {
                kind: 'gear',
                code:
                  entry.gear.code
              }
            }

            return {
              kind: 'stack',
              itemId:
                entry.stack.item_id
            }
          }
        )
    }
  }
}

// =====================================
// SEND / EDIT
// =====================================

async function sendPanel({
  sock,
  msg,
  jid,
  userJid,
  type,
  render
}) {
  const playerId =
    resolvePlayerId(
      userJid,
      false
    )

  if (!playerId) {
    return null
  }

  const view =
    render(
      userJid
    )

  const sent =
    await sock.sendMessage(
      jid,
      {
        text:
          view.text
      },
      {
        quoted:
          msg
      }
    )

  if (
    sent?.key?.id
  ) {
    saveSession({
      playerId,
      type,
      jid,
      key:
        sent.key,
      payload:
        view.payload
    })
  }

  return sent
}

async function refreshPanel({
  sock,
  msg,
  jid,
  userJid,
  session,
  status
}) {
  const render =
    session.type ===
      'shop'
      ? renderShop
      : renderInventory

  const view =
    render(
      userJid,
      status
    )

  const key =
    storedKey(
      session
    )

  try {
    await sock.sendMessage(
      jid,
      {
        text:
          view.text,

        edit:
          key
      }
    )

    saveSession({
      playerId:
        session.player_id,

      type:
        session.type,

      jid,

      key,

      payload:
        view.payload
    })

    return
  } catch (err) {
    console.error(
      '🎮 RPG panel edit fallback:',
      err?.message ||
      err
    )
  }

  const sent =
    await sock.sendMessage(
      jid,
      {
        text:
          view.text
      },
      {
        quoted:
          msg
      }
    )

  if (
    sent?.key?.id
  ) {
    saveSession({
      playerId:
        session.player_id,

      type:
        session.type,

      jid,

      key:
        sent.key,

      payload:
        view.payload
    })
  }
}

export function sendRpgShopPanel(
  args
) {
  return sendPanel({
    ...args,
    type:
      'shop',
    render:
      renderShop
  })
}

export function sendRpgInventoryPanel(
  args
) {
  return sendPanel({
    ...args,
    type:
      'inventory',
    render:
      renderInventory
  })
}

// =====================================
// REPLY HANDLER
// =====================================

export async function handleRpgPanelReply({
  sock,
  msg,
  jid,
  text,
  isOwner = false
}) {
  if (
    !msg?.message ||
    msg.key?.fromMe
  ) {
    return false
  }

  const replyId =
    getReplyId(
      msg
    )

  if (!replyId) {
    return false
  }

  const userJid =
    await resolveProfileJid(
      sock,
      msg,
      jid
    )

  if (!userJid) {
    return false
  }

  const playerId =
    resolvePlayerId(
      userJid,
      false
    )

  if (!playerId) {
    return false
  }

  const session =
    getSession(
      playerId
    )

  if (
    !session ||
    session.message_id !==
      replyId ||
    String(
      session.chat_jid
    ) !==
      String(jid)
  ) {
    return false
  }

  if (
    locks.has(
      playerId
    )
  ) {
    return true
  }

  const raw =
    String(text || '')
      .trim()
      .toLowerCase()

  const parts =
    raw.split(/\s+/)

  const action =
    parts[0]

  const payload =
    safeJson(
      session.payload_json,
      {}
    )

  locks.add(
    playerId
  )

  try {
    // ===============================
    // SHOP
    // ===============================

    if (
      session.type ===
      'shop'
    ) {
      if (
        action === 'convert' ||
        action === 'tukar'
      ) {
        const kind =
          parts[1]

        const qty =
          Math.max(
            1,
            Math.trunc(
              Number(
                parts[2] || 1
              ) || 1
            )
          )

        const r =
          exchangeRpgMoney(
            userJid,
            kind,
            qty,
            {
              isOwner
            }
          )

        let status

        if (r.success) {
          status =
            `✅ 💵 -${num(r.cost)} → ` +
            `${r.config.icon} +${num(r.reward)} ` +
            `${r.config.name}. ` +
            `Sisa cap: ${num(r.remaining)}`
        } else if (
          r.reason === 'MONEY_LOW'
        ) {
          status =
            `💸 Money kurang ${num(r.missing)}.`
        } else if (
          r.reason === 'DAILY_CAP'
        ) {
          status =
            `⏳ Cap harian tercapai. ` +
            `Sisa: ${num(r.remaining)}.`
        } else if (
          r.reason === 'UNLIMITED_LIMIT'
        ) {
          status =
            '👑 Limit sudah unlimited. Money tidak dipotong.'
        } else if (
          r.reason === 'INVALID_KIND'
        ) {
          status =
            '❌ Pilih *coin* atau *limit*.'
        } else if (
          r.reason === 'INVALID_QTY'
        ) {
          status =
            '❌ Jumlah convert tidak valid.'
        } else {
          status =
            `❌ Exchange gagal: ${r.reason}`
        }

        await refreshPanel({
          sock,
          msg,
          jid,
          userJid,
          session,
          status
        })

        return true
      }

      if (
        action !== 'buy' &&
        action !== 'beli'
      ) {
        return false
      }

      const index =
        Number(
          parts[1]
        ) - 1

      const itemId =
        payload.entries?.[
          index
        ]

      if (!itemId) {
        await refreshPanel({
          sock,
          msg,
          jid,
          userJid,
          session,
          status:
            '❌ Nomor item tidak valid.'
        })

        return true
      }

      const qty =
        Math.max(
          1,
          Number(
            parts[2] || 1
          ) || 1
        )

      const r =
        buyRpgItem(
          userJid,
          itemId,
          qty
        )

      let status

      if (r.success) {
        status =
          `✅ ${r.item.icon} ` +
          `${r.item.name} ×${r.qty} dibeli. ` +
          `💵 -${num(r.total)}`
      } else if (
        r.reason ===
        'LEVEL_LOW'
      ) {
        status =
          `🔒 Butuh RPG Lv.${r.requiredLevel}.`
      } else if (
        r.reason ===
        'MONEY_LOW'
      ) {
        status =
          `💸 Money kurang ${num(r.missing)}.`
      } else if (
        r.reason ===
        'WRONG_CLASS'
      ) {
        status =
          '🧬 Item bukan untuk Class kamu.'
      } else {
        status =
          `❌ Pembelian gagal: ${r.reason}`
      }

      await refreshPanel({
        sock,
        msg,
        jid,
        userJid,
        session,
        status
      })

      return true
    }

    // ===============================
    // INVENTORY
    // ===============================

    if (
      session.type !==
      'inventory'
    ) {
      return false
    }

    if (
      action ===
      'unequip'
    ) {
      const r =
        unequipRpgGear(
          userJid,
          parts[1]
        )

      const status =
        r.success
          ? `✅ Slot ${r.slot} dilepas.`
          : `❌ Unequip gagal: ${r.reason}`

      await refreshPanel({
        sock,
        msg,
        jid,
        userJid,
        session,
        status
      })

      return true
    }

    if (
      ![
        'equip',
        'enchant',
        'use',
        'pakai',
        'sell',
        'jual'
      ].includes(
        action
      )
    ) {
      return false
    }

    const index =
      Number(
        parts[1]
      ) - 1

    const entry =
      payload.entries?.[
        index
      ]

    if (!entry) {
      await refreshPanel({
        sock,
        msg,
        jid,
        userJid,
        session,
        status:
          '❌ Nomor inventory tidak valid.'
      })

      return true
    }

    let result
    let status

    if (
      action === 'equip'
    ) {
      if (
        entry.kind !==
        'gear'
      ) {
        status =
          '❌ Yang dipilih bukan gear.'
      } else {
        result =
          equipRpgGear(
            userJid,
            entry.code
          )

        status =
          result.success
            ? (
                `✅ ${result.item.icon} ` +
                `${result.item.name} equipped.`
              )
            : (
                `❌ Equip gagal: ${result.reason}`
              )
      }
    }

    if (
      action === 'enchant'
    ) {
      if (
        entry.kind !==
        'gear'
      ) {
        status =
          '❌ Yang dipilih bukan gear.'
      } else {
        result =
          enchantRpgGear(
            userJid,
            entry.code
          )

        status =
          result.success
            ? (
                `✨ ${result.item.name} ` +
                `+${result.oldLevel} → +${result.newLevel}`
              )
            : (
                `❌ Enchant gagal: ${result.reason}`
              )
      }
    }

    if (
      action === 'use' ||
      action === 'pakai'
    ) {
      if (
        entry.kind !==
        'stack'
      ) {
        status =
          '❌ Gear dipakai lewat equip.'
      } else {
        result =
          useRpgItem(
            userJid,
            entry.itemId
          )

        if (
          result.success
        ) {
          status =
            `✅ ${result.item.icon} ${result.item.name} dipakai. ` +
            `❤️ +${result.healed} • ` +
            `🔷 +${result.manaRestored}`
        } else if (
          result.reason ===
          'IN_BATTLE'
        ) {
          status =
            '⚔️ Saat battle gunakan reply potion di Battle Board.'
        } else {
          status =
            `❌ Item gagal dipakai: ${result.reason}`
        }
      }
    }

    if (
      action === 'sell' ||
      action === 'jual'
    ) {
      const qty =
        Math.max(
          1,
          Number(
            parts[2] || 1
          ) || 1
        )

      if (
        entry.kind ===
        'gear'
      ) {
        result =
          sellRpgItem(
            userJid,
            entry.code,
            1
          )
      } else {
        result =
          sellRpgItem(
            userJid,
            entry.itemId,
            qty
          )
      }

      status =
        result.success
          ? (
              `💵 ${result.item.icon} ` +
              `${result.item.name} terjual. ` +
              `+${num(result.gain)} Money`
            )
          : (
              `❌ Jual gagal: ${result.reason}`
            )
    }

    await refreshPanel({
      sock,
      msg,
      jid,
      userJid,
      session,
      status:
        status ||
        '❌ Action tidak valid.'
    })

    return true
  } finally {
    locks.delete(
      playerId
    )
  }
}
