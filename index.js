import { handleHutaonatorReply } from './lib/hutaonator.js'
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  Browsers,
  areJidsSameUser,
  fetchLatestWaWebVersion

} from '@whiskeysockets/baileys'

import { Boom } from '@hapi/boom'
import pino from 'pino'
import { Agent as HttpsAgent } from 'node:https'
import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { pathToFileURL } from 'url'

import config from './config.js'

import {
  isMaintenance,
  getMaintenanceMessage
} from './lib/maintenance.js'

import {
  getGroupInfo
} from './lib/group.js'

import {
  getGroupConfig,
  addWarning,
  resetWarning
} from './lib/groupdb.js'

import {
  getBotDB
} from './lib/botdb.js'

import {
  getUser
} from './lib/userdb.js'

import {
  checkCommandLimit
} from './lib/limitGate.js'

import {
  getProfileJid,
  resolveProfileJid
} from './lib/profile.js'


import { handleRpgBattleReply } from './lib/rpg/battleBoard.js'


import {
  handleRpgPanelReply
} from './lib/rpg/panels.js'


import {
  handleNexaAiReply
} from './lib/ai/nexa.js'
import {
  getAfk,
  removeAfk,
  formatAfkDuration
} from './lib/afk.js'

import {
  hasIntroduced,
  markIntroduced
} from './lib/groupIntro.js'

const logger = pino({
  level: 'silent'
})


const mediaHttpsAgent =
  new HttpsAgent({
    keepAlive:
      true,

    family:
      4,

    maxSockets:
      4,

    maxFreeSockets:
      2,

    timeout:
      30000
  })

// =====================================
// RUNTIME MEMORY
// =====================================

// Anti-spam sengaja disimpan RAM.
// Kalau bot restart, cooldown ikut reset.
const spamMemory = new Map()

// Biar 1 call nggak diproses berkali-kali
const handledCalls = new Set()

// bersihin dedup call tiap 1 jam
setInterval(() => {
  handledCalls.clear()
}, 60 * 60 * 1000)

// =====================================
// UTIL
// =====================================

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

function cleanNumber(value) {
  if (!value) return ''

  return String(value)
    .split('@')[0]
    .replace(/\D/g, '')
}

function normalizeJid(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function sameUser(a, b) {
  if (!a || !b) {
    return false
  }

  try {
    return (
      normalizeJid(a) === normalizeJid(b) ||
      areJidsSameUser(a, b)
    )
  } catch {
    return (
      normalizeJid(a) === normalizeJid(b)
    )
  }
}

function participantMatchesBot(
  participant,
  sock
) {
  const botCandidates = [
    sock?.user?.id,
    sock?.user?.lid
  ].filter(Boolean)

  const participantCandidates =
    typeof participant === 'string'
      ? [participant]
      : [
          participant?.id,
          participant?.phoneNumber,
          participant?.lid,
          participant?.jid,
          participant?.participant,
          participant?.participantAlt
        ].filter(Boolean)

  for (
    const candidate
    of participantCandidates
  ) {
    for (
      const botJid
      of botCandidates
    ) {
      if (
        sameUser(
          candidate,
          botJid
        )
      ) {
        return true
      }
    }
  }

  return false
}

function question(text) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  return new Promise(resolve => {
    rl.question(text, answer => {
      rl.close()
      resolve(answer)
    })
  })
}

// =====================================
// MESSAGE TEXT
// =====================================

function getInteractiveReplyId(
  msg
) {
  const m =
    msg?.message ||
    {}

  const paramsJson =
    m
      .interactiveResponseMessage
      ?.nativeFlowResponseMessage
      ?.paramsJson

  if (paramsJson) {
    try {
      const params =
        JSON.parse(
          paramsJson
        )

      if (
        typeof params?.id ===
          'string' &&
        params.id.trim()
      ) {
        return params.id
      }
    } catch {}
  }

  return (
    m.buttonsResponseMessage
      ?.selectedButtonId ||
    m.templateButtonReplyMessage
      ?.selectedId ||
    m.listResponseMessage
      ?.singleSelectReply
      ?.selectedRowId ||
    ''
  )
}

function isInteractiveAction(
  msg
) {
  const m =
    msg?.message ||
    {}

  return Boolean(
    m.interactiveResponseMessage ||
    m.buttonsResponseMessage ||
    m.templateButtonReplyMessage ||
    m.listResponseMessage
  )
}

function getText(msg) {
  const m = msg.message

  if (!m) return ''

  return (
    getInteractiveReplyId(
      msg
    ) ||
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    ''
  )
}

function getContextInfo(msg) {
  const m = msg?.message || {}

  return (
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo ||
    m.documentMessage?.contextInfo ||
    {}
  )
}

// =====================================
// MESSAGE SENDER
// =====================================

function getSenderCandidates(msg, jid) {
  const candidates = [
    msg?.key?.participant,
    msg?.key?.participantAlt,
    msg?.participant,
    msg?.key?.remoteJid,
    msg?.key?.remoteJidAlt,
    jid
  ]

  return [
    ...new Set(
      candidates.filter(Boolean)
    )
  ]
}

function getPrimarySender(msg, jid) {
  return (
    msg?.key?.participant ||
    msg?.key?.participantAlt ||
    msg?.participant ||
    msg?.key?.remoteJidAlt ||
    jid
  )
}

// =====================================
// OWNER CHECK
// =====================================

function isOwnerJid(jid) {
  if (!jid) return false

  const number =
    cleanNumber(jid)

  const owners =
    Array.isArray(config.owner)
      ? config.owner.map(cleanNumber)
      : []

  if (
    number &&
    owners.includes(number)
  ) {
    return true
  }

  const ownerJids =
    Array.isArray(config.ownerJids)
      ? config.ownerJids
      : []

  return ownerJids.some(ownerJid => {
    try {
      return (
        normalizeJid(ownerJid) ===
          normalizeJid(jid) ||
        areJidsSameUser(
          ownerJid,
          jid
        )
      )
    } catch {
      return (
        normalizeJid(ownerJid) ===
        normalizeJid(jid)
      )
    }
  })
}

function isOwnerMessage(
  msg,
  jid
) {
  // Command yang dikirim dari akun BOT sendiri
  // dianggap owner juga.
  if (msg?.key?.fromMe) {
    return true
  }

  const candidates =
    getSenderCandidates(
      msg,
      jid
    )

  return candidates.some(
    candidate =>
      isOwnerJid(candidate)
  )
}

// =====================================
// BAN CHECK
// =====================================

function isBannedMessage(
  msg,
  jid
) {
  const candidates =
    getSenderCandidates(
      msg,
      jid
    )

  for (const candidate of candidates) {
    try {
      if (
        getUser(candidate)
          ?.banned
      ) {
        return true
      }
    } catch {}
  }

  return false
}

// =====================================
// COMMAND LOADER
// =====================================

async function loadCommands() {
  const commands = new Map()

  const folder =
    path.resolve('./commands')

  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, {
      recursive: true
    })
  }

  const files =
    fs
      .readdirSync(folder)
      .filter(file =>
        file.endsWith('.js')
      )

  for (const file of files) {
    try {
      const filePath =
        path.join(
          folder,
          file
        )

      const module =
        await import(
          `${pathToFileURL(filePath).href}?v=${Date.now()}`
        )

      const command =
        module.default

      if (
        !command?.name ||
        typeof command.run !==
          'function'
      ) {
        console.log(
          `⚠️ Skip: ${file}`
        )

        continue
      }

      commands.set(
        command.name.toLowerCase(),
        command
      )

      if (
        Array.isArray(
          command.aliases
        )
      ) {
        for (
          const alias
          of command.aliases
        ) {
          commands.set(
            alias.toLowerCase(),
            command
          )
        }
      }

      console.log(
        `📦 Loaded: ${command.name}`
      )
    } catch (err) {
      console.log(
        `❌ Gagal load ${file}`
      )

      console.log(err)
    }
  }

  
    // =====================================
    // MODERN MENU PIN
    //
    // Pastikan .menu/.help/.commands SELALU
    // menunjuk ke commands/menu.js terbaru.
    // Alias/collision command lain tidak boleh
    // mengganti menu canonical.
    // =====================================

    try {
      const menuPath =
        path.join(
          folder,
          'menu.js'
        )

      const menuModule =
        await import(
          `${pathToFileURL(menuPath).href}?menuPin=${Date.now()}-${Math.random()}`
        )

      const menuCommand =
        menuModule.default

      if (
        menuCommand?.name ===
          'menu' &&
        typeof menuCommand.run ===
          'function'
      ) {
        commands.set(
          'menu',
          menuCommand
        )

        commands.set(
          'help',
          menuCommand
        )

        commands.set(
          'commands',
          menuCommand
        )

        console.log(
          '📌 Modern menu pinned'
        )
      } else {
        console.log(
          '⚠️ commands/menu.js tidak valid'
        )
      }
    } catch (
      err
    ) {
      console.error(
        '❌ Gagal pin modern menu:',
        err?.message ||
        err
      )
    }

return commands
}

// =====================================
// GLOBAL PERMISSION
// =====================================

async function checkPermission({
  sock,
  msg,
  jid,
  command,
  isOwner
}) {
  // ================================
  // OWNER ONLY
  // ================================

  if (
    command.ownerOnly &&
    !isOwner
  ) {
    await sock.sendMessage(
      jid,
      {
        text:
          '⛔ Command ini khusus Owner NEXA-BOT.'
      },
      {
        quoted: msg
      }
    )

    return {
      allowed: false
    }
  }

  const needsGroup =
    command.groupOnly ||
    command.adminOnly ||
    command.botAdmin

  // ================================
  // GROUP ONLY
  // ================================

  if (
    needsGroup &&
    !jid.endsWith('@g.us')
  ) {
    await sock.sendMessage(
      jid,
      {
        text:
          '❌ Command ini cuma bisa digunakan di grup.'
      },
      {
        quoted: msg
      }
    )

    return {
      allowed: false
    }
  }

  if (!needsGroup) {
    return {
      allowed: true,
      groupInfo: null
    }
  }

  let groupInfo

  try {
    groupInfo =
      await getGroupInfo(
        sock,
        jid,
        msg
      )
  } catch (err) {
    console.error(
      '💥 Group info:',
      err
    )

    await sock.sendMessage(
      jid,
      {
        text:
          '⚠️ Gagal membaca informasi grup.'
      },
      {
        quoted: msg
      }
    )

    return {
      allowed: false
    }
  }

  // ================================
  // ADMIN ONLY
  //
  // OWNER bebas dari adminOnly.
  // Tapi botAdmin TIDAK bisa dibypass,
  // karena WhatsApp sendiri butuh akun
  // bot jadi admin.
  // ================================

  if (
    command.adminOnly &&
    !groupInfo.isAdmin &&
    !isOwner
  ) {
    await sock.sendMessage(
      jid,
      {
        text:
          '⛔ Command ini khusus admin grup.'
      },
      {
        quoted: msg
      }
    )

    return {
      allowed: false,
      groupInfo
    }
  }

  if (
    command.botAdmin &&
    !groupInfo.isBotAdmin
  ) {
    await sock.sendMessage(
      jid,
      {
        text:
          '⚠️ NEXA-BOT harus menjadi admin grup terlebih dahulu.'
      },
      {
        quoted: msg
      }
    )

    return {
      allowed: false,
      groupInfo
    }
  }

  return {
    allowed: true,
    groupInfo
  }
}

// =====================================
// ANTI-SPAM
// =====================================

// ANTI-SPAM V2 CANONICAL
// =====================================
//
// Global = fitur berlaku di seluruh NEXA.
// State tetap PER USER, bukan satu timer bersama.
//
// Rule:
// - command pertama: lolos
// - command kedua <8 detik: block
// - cooldown: 15 detik
// - owner: immune
// - PN/LID: disatukan sebisa mungkin
// =====================================

async function checkAntiSpam({
  sock,
  msg,
  jid,
  isOwner
}) {
  if (isOwner) {
    return {
      blocked: false
    }
  }

  const db =
    getBotDB()

  if (!db.antiSpam) {
    return {
      blocked: false
    }
  }

  let sender = null

  // Gunakan resolver profile yang sama
  // dengan sistem player PN/LID.
  try {
    sender =
      await resolveProfileJid(
        sock,
        msg,
        jid
      )
  } catch {}

  sender =
    sender ||
    getProfileJid(
      msg,
      getPrimarySender(
        msg,
        jid
      )
    ) ||
    getPrimarySender(
      msg,
      jid
    )

  if (!sender) {
    return {
      blocked: false
    }
  }

  const key =
    normalizeJid(
      sender
    )

  if (!key) {
    return {
      blocked: false
    }
  }

  const now =
    Date.now()

  const windowMs =
    Number(
      db.spam?.windowMs
    ) || 8000

  const cooldownMs =
    Number(
      db.spam?.cooldownMs
    ) || 15000

  let state =
    spamMemory.get(key)

  if (!state) {
    state = {
      lastCommandAt: 0,
      cooldownUntil: 0,
      lastNotice: 0
    }
  }

  // =================================
  // MASIH COOLDOWN
  // =================================

  if (
    state.cooldownUntil >
    now
  ) {
    const shouldNotify =
      now -
        state.lastNotice >=
      5000

    if (shouldNotify) {
      state.lastNotice =
        now
    }

    spamMemory.set(
      key,
      state
    )

    return {
      blocked: true,

      cooldown:
        state.cooldownUntil -
        now,

      notify:
        shouldNotify
    }
  }

  // Cooldown lama sudah selesai.
  if (
    state.cooldownUntil > 0
  ) {
    state.cooldownUntil = 0
    state.lastNotice = 0
    state.lastCommandAt = 0
  }

  // =================================
  // COMMAND PERTAMA / SUDAH >8 DETIK
  // =================================

  if (
    !state.lastCommandAt ||
    now -
      state.lastCommandAt >=
      windowMs
  ) {
    state.lastCommandAt =
      now

    spamMemory.set(
      key,
      state
    )

    return {
      blocked: false
    }
  }

  // =================================
  // COMMAND KEDUA <8 DETIK
  // =================================

  state.cooldownUntil =
    now +
    cooldownMs

  state.lastCommandAt = 0
  state.lastNotice = now

  spamMemory.set(
    key,
    state
  )

  return {
    blocked: true,

    cooldown:
      cooldownMs,

    notify: true
  }
}

// =====================================
// ANTI LINK
// =====================================

function containsGroupLink(
  text
) {
  return /(?:https?:\/\/)?chat\.whatsapp\.com\/[A-Za-z0-9_-]+/i
    .test(text)
}

async function handleAntiLink({
  sock,
  msg,
  jid,
  text,
  isOwner
}) {
  if (
    !jid.endsWith('@g.us')
  ) {
    return false
  }

  if (msg.key.fromMe) {
    return false
  }

  // OWNER kebal anti-link juga
  if (isOwner) {
    return false
  }

  const data =
    getGroupConfig(jid)

  if (!data.antiLink) {
    return false
  }

  if (
    !containsGroupLink(text)
  ) {
    return false
  }

  let groupInfo

  try {
    groupInfo =
      await getGroupInfo(
        sock,
        jid,
        msg
      )
  } catch (err) {
    console.error(
      '💥 AntiLink info:',
      err
    )

    return false
  }

  // Admin grup kebal anti-link
  if (groupInfo.isAdmin) {
    return false
  }

  const target =
    groupInfo.sender

  if (!target) {
    return false
  }

  const mention =
    `@${String(target)
      .split('@')[0]}`

  // ================================
  // BOT BELUM ADMIN
  // ================================

  if (!groupInfo.isBotAdmin) {
    const count =
      addWarning(
        jid,
        target
      )

    await sock.sendMessage(
      jid,
      {
        text:
          `⚠️ *Anti-Link*\n\n` +
          `${mention} mengirim link grup.\n` +
          `Warn: *${count}/3*\n\n` +
          `NEXA-BOT belum menjadi admin sehingga pesan belum bisa dihapus.`,
        mentions: [target]
      },
      {
        quoted: msg
      }
    )

    return true
  }

  // ================================
  // DELETE LINK
  // ================================

  try {
    await sock.sendMessage(
      jid,
      {
        delete: msg.key
      }
    )
  } catch (err) {
    console.error(
      '💥 AntiLink delete:',
      err
    )
  }

  const count =
    addWarning(
      jid,
      target
    )

  // ================================
  // 3/3 AUTO REMOVE
  // ================================

  if (count >= 3) {
    try {
      await sock
        .groupParticipantsUpdate(
          jid,
          [target],
          'remove'
        )

      resetWarning(
        jid,
        target
      )

      await sock.sendMessage(
        jid,
        {
          text:
            `⛔ *Anti-Link*\n\n` +
            `${mention} mencapai *3/3 warning* dan dikeluarkan dari grup.`,
          mentions: [target]
        }
      )

      return true
    } catch (err) {
      console.error(
        '💥 AntiLink remove:',
        err
      )

      await sock.sendMessage(
        jid,
        {
          text:
            `⚠️ ${mention} mencapai *3/3 warning*, tapi gagal dikeluarkan.`,
          mentions: [target]
        }
      )

      return true
    }
  }

  await sock.sendMessage(
    jid,
    {
      text:
        `🛡️ *Anti-Link*\n\n` +
        `${mention}, link grup tidak diperbolehkan.\n` +
        `⚠️ Warn: *${count}/3*`,
      mentions: [target]
    }
  )

  return true
}

// =====================================
// AFK SYSTEM
// =====================================

function isAfkCommand(text) {
  const body =
    String(text || '')
      .trim()

  if (
    !body.startsWith(
      config.prefix
    )
  ) {
    return false
  }

  const commandName =
    body
      .slice(
        config.prefix.length
      )
      .trim()
      .split(/\s+/)[0]
      ?.toLowerCase()

  return commandName === 'afk'
}

function pushUniqueUser(
  list,
  jid
) {
  if (!jid) {
    return
  }

  const exists =
    list.some(
      current =>
        sameUser(
          current,
          jid
        )
    )

  if (!exists) {
    list.push(jid)
  }
}

async function handleAfkSystem({
  sock,
  msg,
  jid,
  text
}) {
  // Jangan proses pesan BOT sendiri.
  if (
    msg?.key?.fromMe
  ) {
    return
  }

  const senderJid =
    getProfileJid(
      msg,
      jid
    )

  // =================================
  // USER BALIK DARI AFK
  // =================================

  if (
    senderJid &&
    !isAfkCommand(text)
  ) {
    const oldAfk =
      removeAfk(
        senderJid
      )

    if (oldAfk) {
      const mention =
        `@${String(senderJid)
          .split('@')[0]}`

      await sock.sendMessage(
        jid,
        {
          text:
            `👋 *AFK SELESAI*\n\n` +
            `Selamat datang kembali ${mention}.\n` +
            `Kamu AFK selama *${formatAfkDuration(oldAfk.since)}*.`,
          mentions: [
            senderJid
          ]
        },
        {
          quoted: msg
        }
      )
    }
  }

  // =================================
  // DETEKSI MENTION / REPLY
  // =================================

  const contextInfo =
    getContextInfo(msg)

  const targets = []

  const mentioned =
    Array.isArray(
      contextInfo.mentionedJid
    )
      ? contextInfo.mentionedJid
      : []

  for (
    const target
    of mentioned
  ) {
    pushUniqueUser(
      targets,
      target
    )
  }

  // Kalau user reply pesan seseorang,
  // cek apakah pengirim pesan yang direply AFK.
  pushUniqueUser(
    targets,
    contextInfo.participantAlt
  )

  pushUniqueUser(
    targets,
    contextInfo.participant
  )

  for (
    const target
    of targets
  ) {
    if (
      senderJid &&
      sameUser(
        senderJid,
        target
      )
    ) {
      continue
    }

    const afk =
      getAfk(target)

    if (!afk) {
      continue
    }

    const mention =
      `@${String(target)
        .split('@')[0]}`

    await sock.sendMessage(
      jid,
      {
        text:
          `🌙 ${mention} sedang *AFK*.\n\n` +
          `Alasan: *${afk.reason}*\n` +
          `Sejak: *${formatAfkDuration(afk.since)} lalu*`,
        mentions: [
          target
        ]
      },
      {
        quoted: msg
      }
    )
  }
}

// =====================================
// CALL OWNER CHECK
// =====================================

function isOwnerCaller(
  caller
) {
  return isOwnerJid(
    caller
  )
}

// =====================================
// RECONNECT MANAGER
// =====================================

// SAFE SOCKET LIFECYCLE V3

let reconnectTimer = null
let reconnectStableTimer = null
let reconnectAttempts = 0

// SAFE RECONNECT STABILITY V3.1

const MAX_RECONNECT_ATTEMPTS = 3

// NO AUTO RECONNECT DIAGNOSTIC MODE
//
// Aktifkan dengan:
// NEXA_NO_RECONNECT=1 node index.js
//
// Berguna untuk tes satu koneksi tanpa loop.
const NO_AUTO_RECONNECT =
  process.env.NEXA_NO_RECONNECT === '1'



function scheduleReconnect(
  delay,
  generation
) {
  if (NO_AUTO_RECONNECT) {
    console.log(
      '🛡️ Auto reconnect OFF (diagnostic mode).'
    )

    return
  }
  // Timer socket lama tidak boleh
  // membuat socket baru.
  if (
    generation !==
    socketGeneration
  ) {
    console.log(
      '♻️ Reconnect stale generation diabaikan.'
    )

    return
  }

  if (reconnectTimer) {
    console.log(
      '⏳ Reconnect sudah terjadwal, skip timer duplikat.'
    )

    return
  }

  if (
    reconnectAttempts >=
    MAX_RECONNECT_ATTEMPTS
  ) {
    console.log(
      `🛑 Reconnect dihentikan setelah ${MAX_RECONNECT_ATTEMPTS} percobaan.`
    )

    console.log(
      '⚠️ Jalankan ulang bot secara manual setelah penyebab dicek.'
    )

    return
  }

  reconnectAttempts++

  const attempt =
    reconnectAttempts

  reconnectTimer =
    setTimeout(
      () => {
        reconnectTimer = null

        // Socket/generation sudah berubah?
        // Timer ini tidak berlaku lagi.
        if (
          generation !==
          socketGeneration
        ) {
          console.log(
            '♻️ Timer reconnect lama dibatalkan.'
          )

          return
        }

        console.log(
          `🔄 Reconnect ${attempt}/${MAX_RECONNECT_ATTEMPTS}...`
        )

        startBot()
          .catch(
            err => {
              console.error(
                '💥 Reconnect gagal:',
                err
              )
            }
          )
      },
      delay
    )
}

function cancelReconnect() {
  if (!reconnectTimer) {
    return
  }

  clearTimeout(
    reconnectTimer
  )

  reconnectTimer = null
}

function cancelReconnectStableTimer() {
  if (!reconnectStableTimer) {
    return
  }

  clearTimeout(
    reconnectStableTimer
  )

  reconnectStableTimer = null
}

function markConnectionStable(
  generation,
  delay = 60000
) {
  cancelReconnectStableTimer()

  reconnectStableTimer =
    setTimeout(
      () => {
        reconnectStableTimer = null

        if (
          generation !==
          socketGeneration
        ) {
          return
        }

        reconnectAttempts = 0

        console.log(
          '🟢 Koneksi stabil. Counter reconnect di-reset.'
        )
      },
      delay
    )
}

function resetReconnectState() {
  cancelReconnect()
  cancelReconnectStableTimer()

  reconnectAttempts = 0
}

// =====================================
// START BOT
// =====================================


// =====================================
// RECONNECT STATE REPAIR
// =====================================

let socketGeneration = 0

let startPromise = null

async function startBot() {
  if (startPromise) {
    console.log(
      '⏳ startBot masih berjalan, skip start duplikat.'
    )

    return startPromise
  }

  startPromise =
    startBotInner()

  try {
    return await startPromise
  } finally {
    startPromise = null
  }
}

async function startBotInner() {
  const myGeneration =
    ++socketGeneration

  // SOCKET DIAGNOSTICS V1
  console.log(
    `🧩 Socket start | PID=${process.pid} | generation=${myGeneration}`
  )
  console.log('')
  console.log(
    '╔════════════════════════════╗'
  )
  console.log(
    '║        ⚡ NEXA-BOT        ║'
  )
  console.log(
    '╚════════════════════════════╝'
  )
  console.log('')

  const commands =
    await loadCommands()

  const unique =
    new Set()

  for (
    const command
    of commands.values()
  ) {
    unique.add(
      command.name
    )
  }

  console.log('')
  console.log(
    `📦 Total commands: ${unique.size}`
  )
  console.log(
    '📂 Loading session...'
  )

  const {
    state,
    saveCreds
  } =
    await useMultiFileAuthState(
      config.sessionFolder
    )

  // PAIRING MODE SELECTOR V2
  let pairingMode = null

  if (
    !state.creds.registered
  ) {
    console.log('')
    console.log(
      '╭──「 NEXA PAIRING 」──╮'
    )
    console.log(
      '│ [1] Pairing Code'
    )
    console.log(
      '│ [2] QR Code'
    )
    console.log(
      '╰─────────────────────╯'
    )
    console.log('')

    let choice = ''

    while (
      choice !== '1' &&
      choice !== '2'
    ) {
      choice =
        String(
          await question(
            'Pilih metode [1/2]: '
          )
        ).trim()

      if (
        choice !== '1' &&
        choice !== '2'
      ) {
        console.log(
          '❌ Pilih 1 atau 2.'
        )
      }
    }

    pairingMode =
      choice === '2'
        ? 'qr'
        : 'code'

    console.log('')

    console.log(
      pairingMode === 'qr'
        ? '📷 Mode QR dipilih.'
        : '🔢 Mode Pairing Code dipilih.'
    )
  }

  // LIVE WA WEB VERSION V1
  let waWebVersion = null

  try {
    const latest =
      await fetchLatestWaWebVersion()

    waWebVersion =
      latest.version

    console.log(
      `🌐 WA Web version: ${waWebVersion.join('.')}`
    )
  } catch (err) {
    console.log(
      '⚠️ Gagal mengambil live WA Web version, pakai bundled fallback.'
    )
  }

  const sock =
    makeWASocket({
      ...(
        waWebVersion
          ? {
              version:
                waWebVersion
            }
          : {}
      ),
      auth: {
        creds:
          state.creds,

        keys:
          makeCacheableSignalKeyStore(
            state.keys,
            logger
          )
      },

      logger,

      // Media CDN WhatsApp:
      // paksa IPv4 + persistent HTTPS.
      fetchAgent:
        mediaHttpsAgent,

      browser:
        Browsers.ubuntu(
          'Chrome'
        ),

      markOnlineOnConnect:
        false
    })

  // =====================================
  // SAVE AUTH
  // =====================================

  sock.ev.on(
    'creds.update',
    saveCreds
  )

  // =====================================
  // QR IMAGE PAIRING V2
  // =====================================

  if (
    pairingMode === 'qr'
  ) {
    const qrFile =
      `${process.cwd()}/pairing-qr.png`

    let lastQr = null
    let qrCount = 0

    sock.ev.on(
      'connection.update',
      async update => {
        const connection =
          update?.connection

        const qr =
          update?.qr

        if (
          !qr ||
          qr === lastQr
        ) {
          return
        }

        lastQr = qr
        qrCount++

        try {
          const mod =
            await import(
              'qrcode'
            )

          const QRCode =
            mod.default ||
            mod

          await QRCode.toFile(
            qrFile,
            qr,
            {
              width: 900,
              margin: 4,
              errorCorrectionLevel: 'M',
              color: {
                dark: '#000000',
                light: '#ffffff'
              }
            }
          )

          console.log('')
          console.log(
            `📷 QR Pairing #${qrCount} siap.`
          )
          console.log(
            '🔒 QR disimpan lokal: pairing-qr.png'
          )
          console.log(
            '📱 Membuka QR...'
          )
          console.log('')

          try {
            const {
              spawn
            } =
              await import(
                'node:child_process'
              )

            const child =
              spawn(
                'termux-open',
                [
                  '--content-type',
                  'image/png',
                  qrFile
                ],
                {
                  detached: true,
                  stdio: 'ignore'
                }
              )

            child.unref()
          } catch {
            console.log(
              '⚠️ Buka manual: termux-open pairing-qr.png'
            )
          }
        } catch (err) {
          console.error(
            '❌ Gagal membuat QR:',
            err?.message ||
            err
          )
        }
      }
    )
  }

  // =====================================
  // CALL PROTECTION
  // =====================================

  sock.ev.on(
    'call',
    async calls => {
      for (const call of calls) {
        try {
          // Hanya proses incoming offer
          if (
            call.status !==
            'offer'
          ) {
            continue
          }

          const caller =
            call.from

          const callId =
            call.id

          if (
            !caller ||
            !callId
          ) {
            continue
          }

          const dedupKey =
            `${caller}:${callId}`

          if (
            handledCalls.has(
              dedupKey
            )
          ) {
            continue
          }

          handledCalls.add(
            dedupKey
          )

          // Owner bebas telepon 🗿
          if (
            isOwnerCaller(
              caller
            )
          ) {
            console.log(
              '👑 Owner call allowed.'
            )

            continue
          }

          const db =
            getBotDB()

          if (!db.rejectCall) {
            continue
          }

          console.log(
            `📞 Incoming call: ${caller}`
          )

          // Tolak panggilan
          try {
            await sock.rejectCall(
              callId,
              caller
            )
          } catch (err) {
            console.error(
              '📞 Reject call error:',
              err
            )
          }

          const ownerNumber =
            Array.isArray(
              config.owner
            )
              ? cleanNumber(
                  config.owner[0]
                )
              : ''

          const ownerText =
            ownerNumber
              ? `\n\nJika ada keperluan, hubungi Owner:\nhttps://wa.me/${ownerNumber}`
              : ''

          // ===============================
          // WARN MODE
          // ===============================

          if (
            db.callMode ===
            'warn'
          ) {
            try {
              await sock.sendMessage(
                caller,
                {
                  text:
                    `📵 *NEXA Call Protection*\n\n` +
                    `Akun bot ini tidak menerima panggilan suara maupun video.\n` +
                    `Mohon gunakan chat jika ada keperluan.` +
                    ownerText
                }
              )
            } catch (err) {
              console.error(
                'Call warning error:',
                err
              )
            }

            continue
          }

          // ===============================
          // BLOCK MODE
          // ===============================

          try {
            await sock.sendMessage(
              caller,
              {
                text:
                  `📵 *NEXA Call Protection*\n\n` +
                  `Panggilan ke akun bot tidak diperbolehkan.\n` +
                  `Akun ini akan diblokir otomatis dalam beberapa detik.` +
                  ownerText
              }
            )
          } catch (err) {
            console.error(
              'Pre-block message error:',
              err
            )
          }

          // kasih waktu warning terkirim
          await sleep(5000)

          try {
            await sock.updateBlockStatus(
              caller,
              'block'
            )

            console.log(
              `🚫 Caller blocked: ${caller}`
            )
          } catch (err) {
            // Di Baileys v7, block bisa gagal
            // bila mapping LID ↔ PN belum tersedia.
            console.error(
              '🚫 Auto-block gagal:',
              err?.message || err
            )
          }
        } catch (err) {
          console.error(
            '💥 Call handler:',
            err
          )
        }
      }
    }
  )

  // =====================================
  // WELCOME / GOODBYE
  // =====================================

  sock.ev.on(
    'group-participants.update',
    async update => {
      try {
        console.log(
          '👥 GROUP EVENT:',
          JSON.stringify(
            update,
            null,
            2
          )
        )
        const jid =
          update.id

        const action =
          update.action

        // =================================
        // NEXA INTRO - SEKALI PER GRUP
        // =================================

        if (
          action === 'add'
        ) {
          const botJid =
            sock.user?.id

          const botAdded =
            Array.isArray(
              update.participants
            ) &&
            update.participants.some(
              participant =>
                participantMatchesBot(
                  participant,
                  sock
                )
            )

          if (
            botAdded &&
            !hasIntroduced(
              jid
            )
          ) {
            const introText =
              `👋 *HALO SEMUANYA!*\n\n` +
              `Aku adalah *NEXA-BOT* ⚡\n\n` +
              `Bot ini masih dalam tahap pengembangan. ` +
              `Mohon dimaklumi jika masih ada fitur yang error ` +
              `atau belum berjalan sempurna 😭\n\n` +
              `Mau request fitur atau menemukan bug?\n` +
              `Silakan hubungi Owner dengan:\n` +
              `*${config.prefix}owner*\n\n` +
              `Ketik *${config.prefix}menu* untuk melihat fitur yang tersedia.\n\n` +
              `Terima kasih sudah menggunakan NEXA-BOT! 🤖✨`

            await sock.sendMessage(
              jid,
              {
                text:
                  introText
              }
            )

            markIntroduced(
              jid
            )

            console.log(
              `👋 Intro dikirim: ${jid}`
            )
          }
        }

        if (
          action !== 'add' &&
          action !== 'remove'
        ) {
          return
        }

        // =================================
        // JANGAN PROSES WELCOME / GOODBYE
        // UNTUK EVENT BOT SENDIRI
        // =================================

        const botJid =
          sock.user?.id

        const botInEvent =
          Array.isArray(
            update.participants
          ) &&
          update.participants.some(
            participant =>
              participantMatchesBot(
                participant,
                sock
              )
          )

        if (botInEvent) {
          return
        }

        const data =
          getGroupConfig(jid)

        if (!data.welcome) {
          return
        }

        let metadata

        try {
          metadata =
            await sock.groupMetadata(
              jid
            )
        } catch (err) {
          console.error(
            `⚠️ Gagal baca metadata grup ${jid}:`,
            err?.data ||
            err?.message ||
            err
          )

          return
        }

        for (
          const participant
          of update.participants
        ) {
          const user =
            participant?.id ||
            participant?.phoneNumber ||
            participant?.lid ||
            participant

          if (!user) {
            continue
          }

          if (
            sock.user?.id &&
            sameUser(
              user,
              sock.user.id
            )
          ) {
            continue
          }

          const mention =
            `@${String(user)
              .split('@')[0]}`

          let text

          if (
            action === 'add'
          ) {
            text =
              data.welcomeText ||
              `╭━━〔 🤖 *NEXA WELCOME* 〕━━╮\n` +
              `│\n` +
              `│ wihh... member baru lagi? 😒\n` +
              `│ 👤 @user\n` +
              `│ 👥 @group\n` +
              `│\n` +
              `│ yaudah betah² aja dah di sini.\n` +
              `│ kalau mau req fitur ke Owner,\n` +
              `│ req yang ngotak 😤\n` +
              `│\n` +
              `│ jangan bikin Owner kesayangan\n` +
              `│ NEXA pusing gara² request lu 🙄\n` +
              `│\n` +
              `│ 📦 Member ke-@count\n` +
              `│\n` +
              `╰━━━━━━━━━━━━━━━━━━━━╯`
          } else {
            text =
              data.goodbyeText ||
              `╭─ *Goodbye*\n` +
              `│ 👤 @user\n` +
              `│ 👥 @group\n` +
              `╰────────────`
          }

          text =
            text
              .replaceAll(
                '@user',
                mention
              )
              .replaceAll(
                '@group',
                metadata.subject
              )
              .replaceAll(
                '@count',
                String(
                  metadata
                    .participants
                    .length
                )
              )

          await sock.sendMessage(
            jid,
            {
              text,
              mentions: [user]
            }
          )
        }
      } catch (err) {
        console.error(
          '💥 Welcome event:',
          err
        )
      }
    }
  )

  // =====================================
  // PAIRING
  // =====================================

  if (
    !state.creds.registered &&
    pairingMode === 'code'
  ) {
    console.log('')
    console.log(
      '🔐 Belum ada session.'
    )
    console.log(
      '📱 Pairing WhatsApp diperlukan.'
    )
    console.log('')

    let number =
      await question(
        'Nomor WA (contoh 628123456789): '
      )

    number =
      number.replace(
        /\D/g,
        ''
      )

    if (!number) {
      console.log(
        '❌ Nomor tidak valid.'
      )

      process.exit(1)
    }

    try {
      console.log('')
      console.log(
        '⏳ Meminta pairing code...'
      )

      const code =
        await sock
          .requestPairingCode(
            number
          )

      console.log('')
      console.log(
        '════════════════════════════'
      )
      console.log(
        `🔑 PAIRING CODE: ${code}`
      )
      console.log(
        '════════════════════════════'
      )
      console.log('')
    } catch (err) {
      console.log(
        '❌ Pairing gagal:'
      )

      console.log(
        err?.message || err
      )
    }
  }

  // =====================================
  // CONNECTION
  // =====================================

  sock.ev.on(
    'connection.update',
    ({
      connection,
      lastDisconnect
    }) => {
      if (
        myGeneration !==
        socketGeneration
      ) {
        return
      }

      if (
        connection ===
        'connecting'
      ) {
        console.log(
          '🟡 Connecting...'
        )
      }

      if (
        connection ===
        'open'
      ) {
        cancelReconnect()

        markConnectionStable(
          myGeneration
        )
        sock.sendPresenceUpdate(
          'available'
        ).catch(() => {})
        console.log('')
        console.log(
          '✅ NEXA-BOT ONLINE!'
        )

        console.log(
          `🧩 Socket open | PID=${process.pid} | generation=${myGeneration}`
        )
        console.log(
          `👤 ${
            sock.user?.id ||
            'unknown'
          }`
        )
        console.log(
          `⚡ Prefix: ${config.prefix}`
        )
        console.log('')
      }

      if (
        connection !==
        'close'
      ) {
        return
      }

      cancelReconnectStableTimer()

      // DISCONNECT DETAIL V1
      const error =
        lastDisconnect?.error

      const code =
        error instanceof Boom
          ? error.output
              ?.statusCode
          : error?.output
              ?.statusCode

      console.log('')
      console.log(
        `🔴 Disconnected: ${
          code ?? 'unknown'
        }`
      )

      console.log(
        `🧩 Socket close | PID=${process.pid} | generation=${myGeneration} | current=${socketGeneration}`
      )

      try {
        const streamData =
          error?.data

        const content =
          Array.isArray(
            streamData?.content
          )
            ? streamData.content
            : []

        const conflict =
          content.find(
            item =>
              item?.tag ===
              'conflict'
          )

        const conflictType =
          conflict?.attrs?.type ||
          streamData?.attrs?.type ||
          null

        if (conflictType) {
          console.log(
            `🧩 Conflict type: ${conflictType}`
          )
        }
      } catch {}

      if (
        code ===
          DisconnectReason
            .loggedOut ||
        code === 401
      ) {
        console.log(
          '🚪 Session logout / tidak valid.'
        )

        cancelReconnect()

        return
      }

      // =====================================
      // CONNECTION REPLACED
      //
      // Socket lama sudah digantikan socket lain.
      // JANGAN reconnect dari handler socket lama,
      // karena bisa bikin loop 440 terus-menerus.
      // =====================================

      if (
        code ===
          DisconnectReason
            .connectionReplaced ||
        code === 440
      ) {
        console.log(
          '♻️ Socket lama digantikan. Tidak reconnect dari socket ini.'
        )

        cancelReconnect()

        return
      }

      if (code === 515) {
        console.log(
          '🔄 Restart socket...'
        )

        scheduleReconnect(
          3000,
          myGeneration
        )

        return
      }

      if (code === 408) {
        console.log(
          '⏳ Connection timeout.'
        )
      }

      console.log(
        '🔄 Reconnecting dalam 10 detik...'
      )

      scheduleReconnect(
        10000,
        myGeneration
      )
    }
  )

  // =====================================
  // MESSAGE HANDLER
  // =====================================

  sock.ev.on(
    'messages.upsert',
    async ({
      messages,
      type
    }) => {
      // =================================
      // SOCKET GENERATION LOCK
      //
      // Socket lama tidak boleh lagi
      // memproses command/message.
      // =================================

      if (
        myGeneration !==
        socketGeneration
      ) {
        return
      }

      if (
        type !== 'notify'
      ) {
        return
      }

      for (
        const msg
        of messages
      ) {
        try {
          if (
            !msg?.message
          ) {
            continue
          }

          const jid =
            msg.key.remoteJid

          if (!jid) {
            continue
          }

          // =================================
          // GLOBAL PROFILE RESOLVE
          // Belajar LID -> PN sebelum command.
          // =================================

          try {
            await resolveProfileJid(
              sock,
              msg,
              jid
            )
          } catch (
            err
          ) {
            console.error(
              'Profile resolve:',
              err?.message ||
              err
            )
          }


          if (
            jid ===
            'status@broadcast'
          ) {
            continue
          }

          const text =
            getText(msg)
              .trim()

          if (!text) {
            continue
          }

          const isOwner =
            isOwnerMessage(
              msg,
              jid
            )

          // =================================
          // ANTI LINK
          //
          // Harus sebelum prefix check
          // karena link bukan command.
          // =================================

          const moderated =
            await handleAntiLink({
              sock,
              msg,
              jid,
              text,
              isOwner
            })

          if (moderated) {
            continue
          }

          // =================================
          // AFK
          //
          // Jalan sebelum prefix check supaya:
          // - mention biasa terdeteksi
          // - reply user AFK terdeteksi
          // - user AFK otomatis balik saat chat
          // =================================

          try {
            await handleAfkSystem({
              sock,
              msg,
              jid,
              text
            })
          } catch (err) {
            console.error(
              '🌙 AFK:',
              err
            )
          }

          // HUTAONATOR REPLY: scoped to player/chat and latest prompt.
          // Before self-message filtering so the owner can play from the bot account.
          if (
            !text.startsWith(config.prefix) &&
            (isOwner || (!isMaintenance() && !isBannedMessage(msg, jid)))
          ) {
            const hutaoHandled = await handleHutaonatorReply({
              sock, msg, jid, text, isOwner, config
            })
            if (hutaoHandled) continue
          }

          // =================================
          // SELF NORMAL MESSAGE
          // =================================

          if (
            msg.key.fromMe &&
            !text.startsWith(
              config.prefix
            )
          ) {
            continue
          }

          // =================================
          // RPG BATTLE REPLY V3
          //
          // Reply:
          // attack / skill / potion / run
          //
          // Diproses sebelum prefix sehingga
          // tidak masuk anti-spam command.
          // =================================

          if (
            !text.startsWith(
              config.prefix
            )
          ) {
            const battleAllowed =
              isOwner ||
              (
                !isMaintenance() &&
                !isBannedMessage(
                  msg,
                  jid
                )
              )

            if (battleAllowed) {
              try {
                const battleHandled =
                  await handleRpgBattleReply({
                    sock,
                    msg,
                    jid,
                    text,
                    isOwner
                  })

                if (battleHandled) {
                  continue
                }

      const panelHandled =
        await handleRpgPanelReply({
          sock,
          msg,
          jid,
          text,
          isOwner
        })

      if (panelHandled) {
        continue
      }

      const aiReplyHandled =
        await handleNexaAiReply({
          sock,
          msg,
          jid,
          text,
          isOwner,
          userJid:
            await resolveProfileJid(
              sock,
              msg,
              jid
            )
        })

      if (aiReplyHandled) {
        continue
      }


              } catch (err) {
                console.error(
                  '⚔️ RPG battle reply:',
                  err?.message ||
                  err
                )
              }
            }
          }


          // =================================
          // PREFIX
          // =================================

          if (
            !text.startsWith(
              config.prefix
            )
          ) {
            continue
          }

	  // =================================
          // GLOBAL MAINTENANCE
          // OWNER IMMUNE
          // =================================

          if (
            !isOwner &&
            isMaintenance()
          ) {
            await sock.sendMessage(
              jid,
              {
                text:
                  getMaintenanceMessage()
              },
              {
                quoted: msg
              }
            )

            continue
          }
          // =================================
          // GLOBAL BAN
          // OWNER IMMUNE
          // =================================

          if (
            !isOwner &&
            isBannedMessage(
              msg,
              jid
            )
          ) {
            console.log(
              '🚫 Banned user command ignored.'
            )

            continue
          }

          // =================================
          // GLOBAL ANTI-SPAM
          // OWNER IMMUNE
          // =================================

          const uiAction =
            isInteractiveAction(
              msg
            ) &&
            text
              .toLowerCase()
              .startsWith(
                `${config.prefix}apkmody __`
              )

          const spam =
            uiAction
              ? {
                  blocked: false
                }
              : await checkAntiSpam({
                  sock,
                  msg,
                  jid,
                  isOwner
                })

          if (spam.blocked) {
            if (spam.notify) {
              const seconds =
                Math.max(
                  1,
                  Math.ceil(
                    spam.cooldown /
                    1000
                  )
                )

              await sock.sendMessage(
                jid,
                {
                  text:
                    `⏳ *NEXA Anti-Spam*\n\n` +
                    `Terlalu banyak command.\n` +
                    `Cooldown: *${seconds} detik*.`
                },
                {
                  quoted: msg
                }
              )
            }

            continue
          }

          const body =
            text
              .slice(
                config.prefix.length
              )
              .trim()

          if (!body) {
            continue
          }

          const parts =
            body.split(/\s+/)

          const commandName =
            parts
              .shift()
              ?.toLowerCase()

          const args =
            parts

          const command =
            commands.get(
              commandName
            )

          console.log(
            `📩 ${
              isOwner
                ? '[OWNER]'
                : '[USER]'
            } ${jid} → ${config.prefix}${commandName}`
          )

          // =================================
          // COMMAND NOT FOUND
          // =================================

          if (!command) {
            await sock.sendMessage(
              jid,
              {
                text:
                  `❓ Command *${config.prefix}${commandName}* belum ada.\n\n` +
                  `Ketik *${config.prefix}menu*.`
              },
              {
                quoted: msg
              }
            )

            continue
          }

          // =================================
          // PERMISSION
          // =================================

          const permission =
            await checkPermission({
              sock,
              msg,
              jid,
              command,
              isOwner
            })

          if (
            !permission.allowed
          ) {
            continue
          }

          // =================================
          // LIMIT GATE
          // =================================

          const limitCheck =
            await checkCommandLimit({
              sock,
              msg,
              jid,
              commandName:
                command.name
            })

          if (
            !limitCheck.allowed
          ) {
            // Jangan "return" di sini.
            // Kalau satu batch berisi beberapa pesan,
            // pesan lain tetap harus diproses.
            continue
          }

          // =================================
          // RUN COMMAND
          // =================================

          try {
            await sock.sendPresenceUpdate(
              'composing',
              jid
            )
          } catch {}

          try {
            // =====================================
            // CENTRAL REGISTER GATE V2
            //
            // Semua user wajib register.
            // Owner bypass.
            // .register selalu boleh dipakai.
            // =====================================
            
            if (
              !isOwner &&
              String(
                command?.name ||
                ''
              ).toLowerCase() !==
                'register'
            ) {
              let gateJid = null
            
              try {
                gateJid =
                  await resolveProfileJid(
                    sock,
                    msg,
                    jid
                  )
              } catch (
                err
              ) {
                console.error(
                  'Register identity resolve:',
                  err?.message ||
                  err
                )
              }
            
              gateJid =
                gateJid ||
                getProfileJid(
                  msg,
                  jid
                ) ||
                msg?.key?.participantAlt ||
                msg?.key?.participant ||
                msg?.participant ||
                msg?.key?.remoteJidAlt ||
                jid
            
              const gateUser =
                getUser(
                  gateJid
                )
            
              if (
                !gateUser
                  ?.registeredAt
              ) {
                await sock.sendMessage(
                  jid,
                  {
                    text:
                      `⚠️ *BELUM TERDAFTAR*\n\n` +
                      `Daftar dulu untuk menggunakan NEXA-BOT.\n\n` +
                      `Gunakan:\n` +
                      `*${config.prefix}register nama.umur*`
                  },
                  {
                    quoted:
                      msg
                  }
                )
            
                continue
              }
            }
            
            await command.run({
              sock,
              msg,
              jid,
              args,
              text,
              config,
              commands,

              isOwner,

              groupInfo:
                permission.groupInfo
            })
          } finally {
            try {
              await sock.sendPresenceUpdate(
                'paused',
                jid
              )
            } catch {}
          }
        } catch (err) {
          console.error(
            '💥 Message error:',
            err
          )

          try {
            const jid =
              msg.key.remoteJid

            if (jid) {
              await sock.sendMessage(
                jid,
                {
                  text:
                    '⚠️ Terjadi error saat menjalankan command.'
                },
                {
                  quoted: msg
                }
              )
            }
          } catch {}
        }
      }
    }
  )
}

// =====================================
// GLOBAL ERRORS
// =====================================

process.on(
  'uncaughtException',
  err => {
    console.error(
      '💥 Uncaught Exception:'
    )

    console.error(err)
  }
)

process.on(
  'unhandledRejection',
  err => {
    console.error(
      '💥 Unhandled Rejection:'
    )

    console.error(err)
  }
)

// =====================================
// RUN
// =====================================

startBot()
  .catch(err => {
    console.error(
      '💥 Gagal start NEXA-BOT:'
    )

    console.error(err)
  })
