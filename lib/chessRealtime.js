import { createHash } from 'node:crypto'

import { getUser } from './userdb.js'

const DEFAULT_STUN = [
  'stun:stun.cloudflare.com:3478',
  'stun:stun.l.google.com:19302'
]

function getEnv(name, fallback = '') {
  return String(process.env[name] || fallback || '').trim()
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

function parseUrls(value, fallback = []) {
  const items = String(value || '')
    .split(/[\n,]+/)
    .map(v => v.trim())
    .filter(Boolean)
  return items.length ? items : fallback.slice()
}

function clampTtl(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 7200
  return Math.max(900, Math.min(Math.floor(n), 86400))
}

export function getChessRealtimeConfig() {
  return {
    transport: 'webrtc-p2p-v1',
    stunUrls: parseUrls(getEnv('NEXA_CHESS_STUN_URLS'), DEFAULT_STUN),
    cloudflareTurnKeyId: getEnv('NEXA_CF_TURN_KEY_ID'),
    cloudflareTurnKeyToken: getEnv('NEXA_CF_TURN_KEY_TOKEN'),
    turnTtl: clampTtl(getEnv('NEXA_CHESS_TURN_TTL', '7200'))
  }
}

export function chessMultiplayerConfigured() {
  // STUN-only still works on many networks. TURN is an optional reliability layer.
  return true
}

async function cloudflareTurnIceServers({ keyId, token, ttl, playerId }) {
  if (!keyId || !token) return null

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          ttl,
          customIdentifier: String(playerId || '').slice(0, 64)
        }),
        signal: ctrl.signal
      }
    )

    if (!res.ok) throw new Error(`TURN_HTTP_${res.status}`)
    const data = await res.json()
    const iceServers = Array.isArray(data?.iceServers) ? data.iceServers : []
    if (!iceServers.length) throw new Error('TURN_EMPTY_ICE_SERVERS')

    // Port 53 is intentionally removed: browsers commonly block it and
    // non-trickle gathering would otherwise wait for a timeout.
    return iceServers.map(server => ({
      ...server,
      urls: (Array.isArray(server.urls) ? server.urls : [server.urls])
        .filter(Boolean)
        .filter(url => !/:53(?:\?|$)/.test(String(url)))
    })).filter(server => server.urls.length)
  } finally {
    clearTimeout(timer)
  }
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

  const cfg = getChessRealtimeConfig()
  const pid = playerKey(player)
  const name = String(user?.name || 'NEXA Player').trim().slice(0, 48) || 'NEXA Player'

  let iceServers = [{ urls: cfg.stunUrls }]
  let turnConfigured = false
  let turnIssue = null

  if (cfg.cloudflareTurnKeyId && cfg.cloudflareTurnKeyToken) {
    try {
      const turnIce = await cloudflareTurnIceServers({
        keyId: cfg.cloudflareTurnKeyId,
        token: cfg.cloudflareTurnKeyToken,
        ttl: cfg.turnTtl,
        playerId: pid
      })
      if (turnIce?.length) {
        iceServers = turnIce
        turnConfigured = turnIce.some(server =>
          (Array.isArray(server.urls) ? server.urls : [server.urls])
            .some(url => /^turns?:/i.test(String(url)))
        )
      }
    } catch (err) {
      turnIssue = String(err?.message || err || 'TURN_CREDENTIAL_ERROR')
      console.warn('♟️ NEXA Chess TURN fallback to STUN:', turnIssue)
    }
  }

  return {
    playerId: pid,
    playerName: name,
    iceServers,
    turnConfigured,
    turnIssue,
    transport: cfg.transport
  }
}
