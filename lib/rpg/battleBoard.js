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
  RPG_CLASSES,
  getRpgRequiredExp
} from './core.js'

import {
  getBattle,
  attackBattle,
  skillBattle,
  usePotion,
  runFromBattle
} from './combat.js'

const db =
  new DatabaseSync(
    './database/nexa.sqlite',
    {
      timeout: 5000
    }
  )

// =====================================
// BOARD COLUMNS
// =====================================

function ensureColumn(
  name,
  type
) {
  const columns =
    db.prepare(`
      PRAGMA table_info(rpg_battles)
    `).all()

  if (
    columns.some(
      row =>
        row.name === name
    )
  ) {
    return
  }

  db.exec(
    `ALTER TABLE rpg_battles ` +
    `ADD COLUMN ${name} ${type}`
  )
}

ensureColumn(
  'battle_message_id',
  'TEXT'
)

ensureColumn(
  'battle_chat_jid',
  'TEXT'
)

ensureColumn(
  'battle_message_key',
  'TEXT'
)

// =====================================
// HELPERS
// =====================================

const battleLocks =
  new Set()

function number(
  value
) {
  return Number(
    value || 0
  ).toLocaleString(
    'id-ID'
  )
}

function getText(
  msg
) {
  const m =
    msg?.message || {}

  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    ''
  )
}

function getReplyId(
  msg
) {
  const m =
    msg?.message || {}

  const context =
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo ||
    m.documentMessage?.contextInfo ||
    null

  return (
    context?.stanzaId ||
    null
  )
}

function normalizeAction(
  value
) {
  const raw =
    String(value || '')
      .trim()
      .toLowerCase()

  const aliases = {
    attack:
      'attack',

    atk:
      'attack',

    skill:
      'skill',

    potion:
      'potion',

    heal:
      'potion',

    run:
      'run',

    flee:
      'run',

    kabur:
      'run'
  }

  return (
    aliases[raw] ||
    null
  )
}

function getStoredKey(
  battle,
  jid
) {
  try {
    const parsed =
      JSON.parse(
        battle
          ?.battle_message_key ||
        ''
      )

    if (parsed?.id) {
      return parsed
    }
  } catch {}

  if (
    battle
      ?.battle_message_id
  ) {
    return {
      remoteJid:
        battle.battle_chat_jid ||
        jid,

      fromMe:
        true,

      id:
        battle.battle_message_id
    }
  }

  return null
}

function saveBoardKey(
  userJid,
  jid,
  key
) {
  const playerId =
    resolvePlayerId(
      userJid,
      false
    )

  if (
    !playerId ||
    !key?.id
  ) {
    return false
  }

  const safeKey = {
    remoteJid:
      key.remoteJid ||
      jid,

    fromMe:
      true,

    id:
      key.id
  }

  if (key.participant) {
    safeKey.participant =
      key.participant
  }

  const result =
    db.prepare(`
      UPDATE rpg_battles
      SET
        battle_message_id = ?,
        battle_chat_jid = ?,
        battle_message_key = ?,
        updated_at = ?

      WHERE player_id = ?
    `).run(
      key.id,
      jid,
      JSON.stringify(
        safeKey
      ),
      Date.now(),
      playerId
    )

  return (
    Number(
      result.changes
    ) > 0
  )
}

// =====================================
// UI
// =====================================

function bar(
  current,
  max,
  size = 10
) {
  const safeMax =
    Math.max(
      1,
      Number(max) || 1
    )

  const ratio =
    Math.max(
      0,
      Math.min(
        1,
        (Number(current) || 0) /
        safeMax
      )
    )

  const filled =
    Math.round(
      ratio *
      size
    )

  return (
    '█'.repeat(filled) +
    '░'.repeat(
      size - filled
    )
  )
}

function hpState(
  current,
  max
) {
  const ratio =
    (
      Number(current) || 0
    ) /
    Math.max(
      1,
      Number(max) || 1
    )

  if (ratio <= 0.25) {
    return '🔴'
  }

  if (ratio <= 0.55) {
    return '🟡'
  }

  return '🟢'
}

function playerName(
  playerId
) {
  if (!playerId) {
    return 'Player'
  }

  const row =
    db.prepare(`
      SELECT name
      FROM players
      WHERE id = ?
    `).get(
      playerId
    )

  return (
    row?.name ||
    'Player'
  )
}

function skillName(
  classId
) {
  const names = {
    warrior:
      'Power Slash',

    ranger:
      'Piercing Shot',

    mage:
      'Arcane Burst'
  }

  return (
    names[classId] ||
    'Skill'
  )
}

function renderBattle(
  data,
  status
) {
  const p =
    data.profile

  const b =
    data.battle

  const classInfo =
    RPG_CLASSES[
      p.class
    ]

  const name =
    playerName(
      p.player_id
    )

  const last =
    String(
      status ||
      '🌲 Encounter dimulai.'
    )
      .split('\n')
      .slice(
        0,
        3
      )
      .map(
        line =>
          `│ ${line}`
      )
      .join('\n')

  return (
    `╭━━━━〔 ⚔️ *NEXA BATTLE* 〕━━━━╮\n` +
    `│\n` +
    `│ 👤 *${name}*\n` +
    `│ ${classInfo?.icon || '⚔️'} ` +
    `*${classInfo?.name || p.class || 'No Class'}* ` +
    `• Lv.${p.level}\n` +
    `│\n` +
    `│ ❤️ HP   ${hpState(p.hp, p.max_hp)} ` +
    `${bar(p.hp, p.max_hp)}  ` +
    `${p.hp}/${p.max_hp}\n` +
    `│ 🔷 Mana    ${bar(p.mana, p.max_mana)}  ` +
    `${p.mana}/${p.max_mana}\n` +
    `│\n` +
    `│              *VS*\n` +
    `│\n` +
    `│ ${b.monster_icon} ` +
    `*${String(b.monster_name).toUpperCase()}* ` +
    `• Lv.${b.monster_level}\n` +
    `│ ❤️ HP   ${hpState(
      b.monster_hp,
      b.monster_max_hp
    )} ${bar(
      b.monster_hp,
      b.monster_max_hp
    )}  ${b.monster_hp}/${b.monster_max_hp}\n` +
    `│\n` +
    `├──────〔 📜 *LAST TURN* 〕──────\n` +
    `${last}\n` +
    `│\n` +
    `├───────〔 🎮 *ACTION* 〕────────\n` +
    `│ Reply pesan ini:\n` +
    `│\n` +
    `│ ⚔️ attack\n` +
    `│ ✨ skill — ${skillName(p.class)}\n` +
    `│ 🧪 potion\n` +
    `│ 🏃 run\n` +
    `│\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
  )
}

function monsterTurnText(
  result
) {
  const action =
    result?.monsterAction
      ? `${result.monsterAction}\n`
      : ''

  const dmg =
    Number(
      result?.monsterDamage
    ) || 0

  return (
    action +
    `💥 Balasan: ${dmg} DMG`
  )
}

function statusFor(
  action,
  result
) {
  if (!result?.success) {
    if (
      result?.reason ===
      'NO_MANA'
    ) {
      return (
        `🔷 Mana kurang. ` +
        `${result.current}/${result.needed}`
      )
    }

    if (
      result?.reason ===
      'FULL_HP'
    ) {
      return '❤️ HP masih penuh.'
    }

    if (
      result?.reason ===
      'NO_POTION'
    ) {
      return '🧪 Small Potion habis.'
    }

    return '⚠️ Aksi gagal.'
  }

  if (action === 'attack') {
    return (
      `${result.crit ? '🔥 CRITICAL!\n' : ''}` +
      `⚔️ Kamu memberi ${result.dealt} DMG\n` +
      monsterTurnText(result)
    )
  }

  if (action === 'skill') {
    return (
      `✨ ${result.skill?.name || 'Skill'}: ` +
      `${result.dealt} DMG\n` +
      monsterTurnText(result)
    )
  }

  if (action === 'potion') {
    return (
      `🧪 Pulih ${result.healed} HP\n` +
      monsterTurnText(result)
    )
  }

  if (action === 'run') {
    return (
      `🏃 Gagal kabur 😭\n` +
      monsterTurnText(result)
    )
  }

  return '⚔️ Battle berlanjut.'
}

function renderFinal(
  action,
  result
) {
  const b =
    result?.battle || {}

  if (result?.won) {
    const required =
      getRpgRequiredExp(
        result.level
      )

    return (
      `╭━━━━〔 🏆 *VICTORY* 〕━━━━╮\n` +
      `│\n` +
      `│ ${b.monster_icon || '👾'} ` +
      `*${b.monster_name || 'Monster'}* dikalahkan!\n` +
      `│\n` +
      `│ 💥 Final Hit : *${result.dealt || 0} DMG*\n` +
      `│ ❤️ HP        : *${result.hp}/${result.maxHp}*\n` +
      `│ 🔷 Mana      : *${result.mana}/${result.maxMana}*\n` +
      `│\n` +
      `├──────〔 🎁 *REWARD* 〕──────\n` +
      `│ 💵 +${number(result.rewardMoney)} Money\n` +
      `│ ✨ +${number(result.rewardExp)} RPG EXP\n` +
      (
        result.loot
          ? (
              `│ ${result.loot.icon} ` +
              `${result.loot.name} ×1\n`
            )
          : `│ 📦 Tidak ada loot.\n`
      ) +
      `│\n` +
      `│ ⭐ Lv.${result.level} • ` +
      `${number(result.exp)}/${number(required)} EXP\n` +
      (
        result.levelsGained > 0
          ? (
              `│\n` +
              `├──────〔 🎉 *LEVEL UP!* 〕─────\n` +
              `│ Lv.${result.oldLevel} → *Lv.${result.level}*\n`
            )
          : ''
      ) +
      `│\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━━━╯`
    )
  }

  if (result?.defeated) {
    return (
      `╭━━━━〔 💀 *DEFEAT* 〕━━━━╮\n` +
      `│\n` +
      `│ ${b.monster_icon || '👾'} ` +
      `*${b.monster_name || 'Monster'}* menang.\n` +
      `│\n` +
      `│ ❤️ HP         : *0*\n` +
      `│ 💵 Kehilangan : *${number(result.penalty)} Money*\n` +
      `│ 🏦 Bank       : *AMAN* 🔐\n` +
      `│ 🎒 Inventory  : *AMAN*\n` +
      `│ ⚔️ Equipment  : *AMAN*\n` +
      `│\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━━━╯`
    )
  }

  if (
    action === 'run' &&
    result?.escaped
  ) {
    return (
      `╭━━━━〔 🏃 *ESCAPED* 〕━━━━╮\n` +
      `│\n` +
      `│ Berhasil kabur dari\n` +
      `│ ${b.monster_icon || '👾'} ` +
      `*${b.monster_name || 'Monster'}* 😭\n` +
      `│\n` +
      `│ Tidak ada reward.\n` +
      `│ Tidak ada penalty.\n` +
      `│\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━━━╯`
    )
  }

  return (
    `⚔️ *Battle selesai.*`
  )
}

// =====================================
// SEND / EDIT
// =====================================

async function editOrReplace({
  sock,
  msg,
  jid,
  userJid,
  key,
  text,
  active
}) {
  if (key?.id) {
    try {
      await sock.sendMessage(
        jid,
        {
          text,
          edit:
            key
        }
      )

      return {
        edited: true
      }
    } catch (
      err
    ) {
      console.error(
        '⚔️ Battle edit fallback:',
        err?.message ||
        err
      )
    }
  }

  const sent =
    await sock.sendMessage(
      jid,
      {
        text
      },
      {
        quoted:
          msg
      }
    )

  if (
    active &&
    sent?.key?.id
  ) {
    saveBoardKey(
      userJid,
      jid,
      sent.key
    )
  }

  return {
    edited: false,
    sent
  }
}

export async function sendBattleBoard({
  sock,
  msg,
  jid,
  userJid,
  status =
    '🌲 Encounter dimulai.'
}) {
  const data =
    getBattle(
      userJid
    )

  if (!data?.battle) {
    return null
  }

  const sent =
    await sock.sendMessage(
      jid,
      {
        text:
          renderBattle(
            data,
            status
          )
      },
      {
        quoted:
          msg
      }
    )

  if (
    sent?.key?.id
  ) {
    saveBoardKey(
      userJid,
      jid,
      sent.key
    )
  }

  return sent
}

// =====================================
// ACTION
// =====================================

export async function runBattleAction({
  sock,
  msg,
  jid,
  userJid,
  action,
  isOwner = false
}) {
  const before =
    getBattle(
      userJid
    )

  if (!before?.battle) {
    return {
      handled: false
    }
  }

  const key =
    getStoredKey(
      before.battle,
      jid
    )

  let result

  if (action === 'attack') {
    result =
      attackBattle(
        userJid,
        {
          isOwner
        }
      )
  } else if (
    action === 'skill'
  ) {
    result =
      skillBattle(
        userJid,
        {
          isOwner
        }
      )
  } else if (
    action === 'potion'
  ) {
    result =
      usePotion(
        userJid,
        {
          isOwner
        }
      )
  } else if (
    action === 'run'
  ) {
    result =
      runFromBattle(
        userJid,
        {
          isOwner
        }
      )
  } else {
    return {
      handled: false
    }
  }

  if (
    result?.reason ===
    'NO_BATTLE'
  ) {
    return {
      handled: false
    }
  }

  const after =
    getBattle(
      userJid
    )

  const active =
    Boolean(
      after?.battle
    )

  const text =
    active
      ? renderBattle(
          after,
          statusFor(
            action,
            result
          )
        )
      : renderFinal(
          action,
          result
        )

  await editOrReplace({
    sock,
    msg,
    jid,
    userJid,
    key,
    text,
    active
  })

  return {
    handled: true,
    result
  }
}

// =====================================
// REPLY HANDLER
// =====================================

export async function handleRpgBattleReply({
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

  const action =
    normalizeAction(
      text ||
      getText(msg)
    )

  if (!action) {
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

  const data =
    getBattle(
      userJid
    )

  if (!data?.battle) {
    return false
  }

  const boardId =
    data.battle
      .battle_message_id

  const boardChat =
    data.battle
      .battle_chat_jid

  if (
    !boardId ||
    replyId !== boardId
  ) {
    return false
  }

  if (
    boardChat &&
    String(boardChat) !==
      String(jid)
  ) {
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

  if (
    battleLocks.has(
      playerId
    )
  ) {
    return true
  }

  battleLocks.add(
    playerId
  )

  try {
    const result =
      await runBattleAction({
        sock,
        msg,
        jid,
        userJid,
        action,
        isOwner
      })

    return Boolean(
      result.handled
    )
  } finally {
    battleLocks.delete(
      playerId
    )
  }
}
