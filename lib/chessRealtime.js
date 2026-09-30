import { createHash, createHmac } from 'node:crypto'

import { getUser } from './userdb.js'

const BOT_KEY = String(process.env.NEXA_BOT_ID || 'main')
const MENU_TTL_MS = 2 * 60 * 60 * 1000

function getSecret() {
  return String(process.env.NEXA_CHESS_SECRET || '').trim()
}

function getRawWsUrl() {
  return String(process.env.NEXA_CHESS_WS_URL || '').trim()
}

function base64url(input) {
  return Buffer.from(input).toString('base64url')
}

function normalizeWsUrl(value) {
  let raw = String(value || '').trim()
  if (!raw) return ''

  if (raw.startsWith('https://')) raw = `wss://${raw.slice(8)}`
  else if (raw.startsWith('http://')) raw = `ws://${raw.slice(7)}`

  try {
    const url = new URL(raw)
    if (!['ws:', 'wss:'].includes(url.protocol)) return ''

    // Backend NEXA Chess hanya menerima WebSocket di /chess.
    // Paksa path ini supaya typo seperti /health atau trailing slash
    // tidak membuat mini-app mencoba endpoint yang salah.
    url.pathname = '/chess'
    url.search = ''
    url.hash = ''

    return url.toString().replace(/\/$/, '')
  } catch {
    return ''
  }
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

function signTicket(payload) {
  const secret = getSecret()
  if (!secret) throw new Error('CHESS_SECRET_NOT_CONFIGURED')
  const body = base64url(JSON.stringify(payload))
  const sig = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function getChessPublicWsUrl() {
  return normalizeWsUrl(getRawWsUrl())
}

export function chessMultiplayerConfigured() {
  return Boolean(getChessPublicWsUrl() && getSecret())
}

export function createChessMenuSession({ chatJid, playerJid, registrationVerified = false }) {
  const chat = String(chatJid || '').trim()
  const player = normalizeJid(playerJid)
  if (!chat || !player) throw new Error('INVALID_CHESS_MENU_SESSION')
  if (chat.endsWith('@g.us')) throw new Error('PRIVATE_ONLY')

  const user = getUser(player)
  if (!registrationVerified && !user?.registeredAt) {
    throw new Error('REGISTER_REQUIRED')
  }

  const now = Date.now()
  const expiresAt = now + MENU_TTL_MS
  const name = String(user?.name || '').trim() || 'NEXA Player'

  const token = signTicket({
    v: 1,
    typ: 'menu',
    bot: BOT_KEY,
    pid: playerKey(player),
    name: name.slice(0, 48),
    iat: now,
    exp: expiresAt
  })

  return { token, expiresAt, botKey: BOT_KEY }
}
