import { createHash } from 'node:crypto'

import { getUser } from './userdb.js'

const BOT_KEY = String(process.env.NEXA_BOT_ID || 'main')
const SESSION_CACHE = new Map()
const SESSION_REFRESH_MARGIN_MS = 5 * 60 * 1000

function getEnv(name, fallback = '') {
  return String(process.env[name] || fallback || '').trim()
}

function normalizeHttpUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const url = new URL(raw)
    if (!['https:', 'http:'].includes(url.protocol)) return ''
    url.pathname = url.pathname.replace(/\/+$/, '') || '/'
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

function getVercelUrl() {
  return normalizeHttpUrl(getEnv('NEXA_CHESS_VERCEL_URL'))
}

function getApiSecret() {
  return getEnv('NEXA_CHESS_API_SECRET')
}

function getVercelWsUrl() {
  const httpUrl = getVercelUrl()
  if (!httpUrl) return ''
  try {
    const url = new URL(httpUrl)
    url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:'
    url.pathname = '/api/ws'
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return ''
  }
}

export function getChessRealtimeConfig() {
  return {
    vercelUrl: getVercelUrl(),
    gatewayWsUrl: getVercelWsUrl(),
    apiSecretConfigured: Boolean(getApiSecret())
  }
}

export function chessMultiplayerConfigured() {
  const cfg = getChessRealtimeConfig()
  return Boolean(
    cfg.vercelUrl &&
    cfg.gatewayWsUrl &&
    cfg.apiSecretConfigured
  )
}

async function requestVercelSession({ playerId, name }) {
  const vercelUrl = getVercelUrl()
  const apiSecret = getApiSecret()
  if (!vercelUrl) throw new Error('CHESS_VERCEL_URL_NOT_CONFIGURED')
  if (!apiSecret) throw new Error('CHESS_API_SECRET_NOT_CONFIGURED')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)

  try {
    const res = await fetch(`${vercelUrl}/api/session`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${apiSecret}`,
        'user-agent': 'NEXA-Chess/9'
      },
      body: JSON.stringify({
        pid: playerId,
        name: String(name || 'NEXA Player').slice(0, 48),
        bot: BOT_KEY
      }),
      signal: controller.signal
    })

    let data = null
    try { data = await res.json() } catch {}

    if (!res.ok) {
      const code = String(data?.error || data?.code || `HTTP_${res.status}`)
      throw new Error(`CHESS_SESSION_${code}`)
    }

    const accessToken = String(data?.accessToken || '').trim()
    const sessionId = String(data?.sessionId || '').trim()
    const expiresAt = Number(data?.expiresAt || 0)

    if (!accessToken || !sessionId || !Number.isFinite(expiresAt)) {
      throw new Error('CHESS_SESSION_INVALID_RESPONSE')
    }

    return { accessToken, sessionId, expiresAt }
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('CHESS_SESSION_TIMEOUT')
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export async function createChessMenuSession({
  chatJid,
  playerJid,
  registrationVerified = false
}) {
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

  const pid = playerKey(player)
  const name = String(user?.name || '').trim() || 'NEXA Player'
  const cacheKey = `${BOT_KEY}:${pid}`
  const cached = SESSION_CACHE.get(cacheKey)

  if (cached && cached.expiresAt > Date.now() + SESSION_REFRESH_MARGIN_MS) {
    return {
      ...cached,
      playerId: pid,
      playerName: name.slice(0, 48),
      botKey: BOT_KEY
    }
  }

  const issued = await requestVercelSession({ playerId: pid, name })
  const session = {
    ...issued,
    playerId: pid,
    playerName: name.slice(0, 48),
    botKey: BOT_KEY
  }

  SESSION_CACHE.set(cacheKey, session)
  return session
}
