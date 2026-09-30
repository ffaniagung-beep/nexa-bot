import { createHash, createHmac, randomBytes } from 'node:crypto'

import { getUser } from './userdb.js'

const MENU_TTL_MS = 2 * 60 * 60 * 1000

function getEnv(name, fallback = '') {
  return String(process.env[name] || fallback || '').trim()
}

function getBotKey() {
  return getEnv('NEXA_BOT_ID', 'main') || 'main'
}

function normalizeJid(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw || raw.endsWith('@g.us')) return null

  const at = raw.lastIndexOf('@')
  if (at < 1) return null

  const domain = raw.slice(at + 1)
  if (domain !== 'lid' && domain !== 's.whatsapp.net') return null

  const local = raw.slice(0, at).split(':')[0]
  if (!local) return null

  return `${local}@${domain}`
}

function playerKey(jid) {
  return createHash('sha256').update(String(jid)).digest('hex')
}

function getSecret() {
  return getEnv('NEXA_CHESS_SECRET')
}

function normalizeWebSocketUrl(value) {
  let raw = String(value || '').trim()
  if (!raw) return ''

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    raw = `https://${raw}`
  }

  try {
    const url = new URL(raw)

    if (url.protocol === 'https:') url.protocol = 'wss:'
    else if (url.protocol === 'http:') url.protocol = 'ws:'

    if (url.protocol !== 'wss:' && url.protocol !== 'ws:') return ''

    url.pathname = '/chess'
    url.search = ''
    url.hash = ''

    return url.toString()
  } catch {
    return ''
  }
}

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function signMenuTicket(payload) {
  const secret = getSecret()
  if (!secret) throw new Error('CHESS_SECRET_NOT_CONFIGURED')

  const body = base64urlJson(payload)
  const sig = createHmac('sha256', secret)
    .update(body)
    .digest('base64url')

  return `${body}.${sig}`
}

export function getChessRealtimeConfig() {
  const wsUrl = normalizeWebSocketUrl(getEnv('NEXA_CHESS_WS_URL'))

  return {
    wsUrl,
    secretConfigured: Boolean(getSecret())
  }
}

export function chessMultiplayerConfigured() {
  const cfg = getChessRealtimeConfig()
  return Boolean(cfg.wsUrl && cfg.secretConfigured)
}

export async function createChessMenuSession({
  chatJid,
  playerJid,
  registrationVerified = false
} = {}) {
  const chat = String(chatJid || '').trim()
  const player = normalizeJid(playerJid)

  if (!chat || !player) throw new Error('INVALID_CHESS_MENU_SESSION')
  if (chat.endsWith('@g.us')) throw new Error('PRIVATE_ONLY')

  const user = getUser(player)
  if (!registrationVerified && !user?.registeredAt) {
    throw new Error('REGISTER_REQUIRED')
  }

  if (!chessMultiplayerConfigured()) {
    throw new Error('CHESS_REALTIME_NOT_CONFIGURED')
  }

  const now = Date.now()
  const bot = getBotKey()
  const pid = playerKey(player)
  const name = String(user?.name || 'NEXA Player').trim().slice(0, 48) || 'NEXA Player'
  const expiresAt = now + MENU_TTL_MS

  const menuToken = signMenuTicket({
    v: 1,
    typ: 'menu',
    bot,
    pid,
    name,
    iat: now,
    exp: expiresAt,
    nonce: randomBytes(12).toString('base64url')
  })

  return {
    menuToken,
    expiresAt,
    playerId: pid,
    playerName: name,
    botKey: bot
  }
}
