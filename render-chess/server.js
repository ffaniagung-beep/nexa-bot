import http from 'node:http'
import {
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual
} from 'node:crypto'
import { WebSocketServer, WebSocket } from 'ws'

const PORT = Number(process.env.PORT || 10000)
const SECRET = String(process.env.NEXA_CHESS_SECRET || '').trim()

if (!SECRET) {
  console.error('Missing NEXA_CHESS_SECRET')
  process.exit(1)
}

const ROOM_TTL_MS = 10 * 60 * 1000
const MATCH_TTL_MS = 2 * 60 * 60 * 1000
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const ROOM_LENGTH = 8

const rooms = new Map()
const usedRoomIds = new Set()
const matches = new Map()
const matchTokens = new Map()
const peersByMatch = new Map()
const menuPeers = new Map()

function now() {
  return Date.now()
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  if (aa.length !== bb.length) return false
  return timingSafeEqual(aa, bb)
}

function verifyMenuTicket(token) {
  const [body, sig, extra] = String(token || '').split('.')
  if (!body || !sig || extra) return null
  const expected = createHmac('sha256', SECRET).update(body).digest('base64url')
  if (!safeEqual(sig, expected)) return null

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (payload?.v !== 1 || payload?.typ !== 'menu') return null
    if (!payload?.pid || !payload?.bot || !payload?.name) return null
    if (!Number.isFinite(Number(payload.exp)) || Number(payload.exp) <= now()) return null
    return {
      bot: String(payload.bot),
      pid: String(payload.pid),
      name: String(payload.name).slice(0, 48),
      exp: Number(payload.exp)
    }
  } catch {
    return null
  }
}

function token(bytes = 24) {
  return randomBytes(bytes).toString('hex')
}

function roomId() {
  for (let attempt = 0; attempt < 100; attempt++) {
    let id = ''
    for (let i = 0; i < ROOM_LENGTH; i++) {
      id += ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)]
    }
    if (!rooms.has(id) && !usedRoomIds.has(id)) {
      usedRoomIds.add(id)
      return id
    }
  }
  throw new Error('ROOM_ID_GENERATION_FAILED')
}

function normalizeRoomId(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, ROOM_LENGTH)
}

function send(ws, data) {
  if (ws?.readyState !== WebSocket.OPEN) return
  try { ws.send(JSON.stringify(data)) } catch {}
}

function menuKey(identity) {
  return `${identity.bot}:${identity.pid}`
}

function getWaitingRoomByHost(identity) {
  const key = menuKey(identity)
  for (const room of rooms.values()) {
    if (room.status === 'waiting' && room.hostKey === key && room.expiresAt > now()) {
      return room
    }
  }
  return null
}

function cleanup() {
  const ts = now()
  for (const [id, room] of rooms) {
    if (room.expiresAt <= ts || room.status === 'cancelled') rooms.delete(id)
  }
  for (const [id, match] of matches) {
    if (match.expiresAt <= ts) {
      matches.delete(id)
      matchTokens.delete(match.whiteToken)
      matchTokens.delete(match.blackToken)
      peersByMatch.delete(id)
    }
  }
}

const cleanupTimer = setInterval(cleanup, 60_000)
cleanupTimer.unref?.()

function makeMatch(room, guestIdentity) {
  const host = room.host
  const guest = guestIdentity
  const hostIsWhite = randomInt(2) === 0
  const white = hostIsWhite ? host : guest
  const black = hostIsWhite ? guest : host
  const id = `chess_${token(10)}`
  const whiteToken = token(24)
  const blackToken = token(24)
  const ts = now()

  const match = {
    id,
    bot: room.bot,
    white,
    black,
    whiteToken,
    blackToken,
    turn: 'w',
    moves: [],
    status: 'playing',
    result: null,
    createdAt: ts,
    updatedAt: ts,
    expiresAt: ts + MATCH_TTL_MS
  }

  matches.set(id, match)
  matchTokens.set(whiteToken, { matchId: id, color: 'w', pid: white.pid })
  matchTokens.set(blackToken, { matchId: id, color: 'b', pid: black.pid })
  room.status = 'matched'
  room.matchId = id
  room.expiresAt = match.expiresAt
  return match
}

function matchReady(match, identity) {
  const isWhite = identity.pid === match.white.pid
  return {
    type: 'match_ready',
    matchToken: isWhite ? match.whiteToken : match.blackToken,
    playerColor: isWhite ? 'w' : 'b',
    opponentName: isWhite ? match.black.name : match.white.name
  }
}

function broadcast(matchId, data) {
  const peers = peersByMatch.get(matchId)
  if (!peers) return
  for (const peer of peers) send(peer.ws, data)
}

function registerMatchPeer(peer, auth) {
  const match = matches.get(auth.matchId)
  if (!match || match.status === 'expired' || match.expiresAt <= now()) {
    send(peer.ws, { type: 'error', code: 'INVALID_TOKEN' })
    return false
  }

  peer.type = 'match'
  peer.matchId = match.id
  peer.color = auth.color
  if (!peersByMatch.has(match.id)) peersByMatch.set(match.id, new Set())
  peersByMatch.get(match.id).add(peer)

  send(peer.ws, {
    type: 'state',
    color: auth.color,
    turn: match.turn,
    moves: match.moves,
    status: match.status,
    opponentName: auth.color === 'w' ? match.black.name : match.white.name
  })
  return true
}

function registerMenuPeer(peer, identity) {
  peer.type = 'menu'
  peer.identity = identity
  const key = menuKey(identity)

  const old = menuPeers.get(key)
  if (old && old !== peer && old.ws?.readyState === WebSocket.OPEN) {
    try { old.ws.close(4001, 'replaced') } catch {}
  }
  menuPeers.set(key, peer)

  const room = getWaitingRoomByHost(identity)
  send(peer.ws, {
    type: 'menu_ready',
    status: room ? 'waiting_room' : 'menu',
    roomId: room?.id || null
  })
}

function handleMenu(peer, data) {
  const identity = peer.identity
  const key = menuKey(identity)

  if (data.type === 'create_room') {
    let room = getWaitingRoomByHost(identity)
    if (!room) {
      const id = roomId()
      const ts = now()
      room = {
        id,
        bot: identity.bot,
        host: identity,
        hostKey: key,
        hostPeer: peer,
        guest: null,
        status: 'waiting',
        matchId: null,
        createdAt: ts,
        expiresAt: Math.min(identity.exp, ts + ROOM_TTL_MS)
      }
      rooms.set(id, room)
    } else {
      room.hostPeer = peer
    }
    send(peer.ws, { type: 'room_created', roomId: room.id, expiresAt: room.expiresAt })
    return
  }

  if (data.type === 'cancel_room') {
    const room = getWaitingRoomByHost(identity)
    if (room) {
      room.status = 'cancelled'
      rooms.delete(room.id)
    }
    send(peer.ws, { type: 'room_cancelled' })
    return
  }

  if (data.type === 'join_room') {
    const id = normalizeRoomId(data.roomId)
    const room = rooms.get(id)
    if (!room || room.status !== 'waiting' || room.expiresAt <= now()) {
      send(peer.ws, { type: 'error', code: 'ROOM_NOT_FOUND' })
      return
    }
    if (room.bot !== identity.bot) {
      send(peer.ws, { type: 'error', code: 'ROOM_NOT_FOUND' })
      return
    }
    if (room.host.pid === identity.pid) {
      send(peer.ws, { type: 'error', code: 'CANNOT_JOIN_SELF' })
      return
    }
    if (!room.hostPeer || room.hostPeer.ws?.readyState !== WebSocket.OPEN) {
      send(peer.ws, { type: 'error', code: 'HOST_OFFLINE' })
      return
    }

    room.guest = identity
    const match = makeMatch(room, identity)
    send(peer.ws, matchReady(match, identity))
    send(room.hostPeer.ws, matchReady(match, room.host))
    return
  }
}

function handleMatch(peer, data) {
  const match = matches.get(peer.matchId)
  if (!match || match.status !== 'playing') {
    send(peer.ws, { type: 'error', code: 'MATCH_NOT_ACTIVE' })
    return
  }

  if (data.type === 'move') {
    if (peer.color !== match.turn) {
      send(peer.ws, { type: 'error', code: 'NOT_YOUR_TURN' })
      return
    }

    const m = data.move || {}
    const nums = [m.fy, m.fx, m.ty, m.tx].map(Number)
    if (nums.some(v => !Number.isInteger(v) || v < 0 || v > 7)) {
      send(peer.ws, { type: 'error', code: 'INVALID_MOVE_SHAPE' })
      return
    }

    const expectedSeq = match.moves.length
    if (Number(data.seq) !== expectedSeq) {
      send(peer.ws, { type: 'resync', moves: match.moves, turn: match.turn })
      return
    }

    const entry = { fy: nums[0], fx: nums[1], ty: nums[2], tx: nums[3] }
    match.moves.push(entry)
    const by = match.turn
    match.turn = by === 'w' ? 'b' : 'w'
    match.updatedAt = now()

    broadcast(match.id, {
      type: 'move',
      move: entry,
      by,
      seq: expectedSeq,
      turn: match.turn
    })
    return
  }

  if (data.type === 'result') {
    const result = String(data.result || '')
    if (!['white', 'black', 'draw'].includes(result)) return
    match.status = 'finished'
    match.result = result
    match.updatedAt = now()
    broadcast(match.id, { type: 'result', result })
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, matches: matches.size }))
    return
  }

  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('NEXA Chess realtime is online')
})

const wss = new WebSocketServer({ server, path: '/chess' })

wss.on('connection', ws => {
  const peer = {
    ws,
    type: null,
    identity: null,
    matchId: null,
    color: null
  }

  ws.on('message', raw => {
    let data
    try { data = JSON.parse(raw.toString()) } catch { return }

    if (!peer.type) {
      if (data.type !== 'auth' || !data.token) {
        send(ws, { type: 'error', code: 'AUTH_REQUIRED' })
        return
      }

      const matchAuth = matchTokens.get(String(data.token))
      if (matchAuth) {
        registerMatchPeer(peer, matchAuth)
        return
      }

      const identity = verifyMenuTicket(data.token)
      if (identity) {
        registerMenuPeer(peer, identity)
        return
      }

      send(ws, { type: 'error', code: 'INVALID_TOKEN' })
      return
    }

    if (peer.type === 'menu') handleMenu(peer, data)
    else if (peer.type === 'match') handleMatch(peer, data)
  })

  ws.on('close', () => {
    if (peer.type === 'menu' && peer.identity) {
      const key = menuKey(peer.identity)
      if (menuPeers.get(key) === peer) menuPeers.delete(key)

      const room = getWaitingRoomByHost(peer.identity)
      if (room && room.hostPeer === peer) {
        room.hostPeer = null
      }
    }

    if (peer.type === 'match' && peer.matchId) {
      const set = peersByMatch.get(peer.matchId)
      if (set) {
        set.delete(peer)
        if (!set.size) peersByMatch.delete(peer.matchId)
      }
    }
  })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`NEXA Chess realtime listening on 0.0.0.0:${PORT}`)
})
