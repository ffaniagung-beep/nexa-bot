import { DurableObject } from 'cloudflare:workers'

const ROOM_TTL_MS = 10 * 60 * 1000
const MATCH_TTL_MS = 2 * 60 * 60 * 1000
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const ROOM_LENGTH = 8
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  })
}

function wsSend(ws, data) {
  try {
    if (ws?.readyState === 1) ws.send(JSON.stringify(data))
  } catch {}
}

function base64UrlToBytes(value) {
  let raw = String(value || '').replace(/-/g, '+').replace(/_/g, '/')
  while (raw.length % 4) raw += '='
  const binary = atob(raw)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

function decodeBase64UrlText(value) {
  return textDecoder.decode(base64UrlToBytes(value))
}

async function verifyMenuTicket(token, secret) {
  const parts = String(token || '').split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1] || !secret) return null
  const [body, sig] = parts

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      textEncoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )

    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlToBytes(sig),
      textEncoder.encode(body)
    )
    if (!valid) return null

    const payload = JSON.parse(decodeBase64UrlText(body))
    if (payload?.v !== 1 || payload?.typ !== 'menu') return null
    if (!payload?.pid || !payload?.bot || !payload?.name) return null
    const exp = Number(payload.exp)
    if (!Number.isFinite(exp) || exp <= Date.now()) return null

    return {
      bot: String(payload.bot),
      pid: String(payload.pid),
      name: String(payload.name).slice(0, 48),
      exp
    }
  } catch {
    return null
  }
}

function randomHex(bytes = 24) {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return Array.from(buf, b => b.toString(16).padStart(2, '0')).join('')
}

function randomRoomId() {
  const buf = new Uint8Array(ROOM_LENGTH)
  crypto.getRandomValues(buf)
  let out = ''
  for (const byte of buf) out += ROOM_ALPHABET[byte % ROOM_ALPHABET.length]
  return out
}

function normalizeRoomId(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, ROOM_LENGTH)
}

function menuKey(identity) {
  return `${identity.bot}:${identity.pid}`
}

function roomKey(id) {
  return `room:${id}`
}

function matchKey(id) {
  return `match:${id}`
}

function matchTokenKey(token) {
  return `mtoken:${token}`
}

function hostRoomKey(identity) {
  return `hostroom:${menuKey(identity)}`
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/health') {
      return json({ ok: true, service: 'nexa-chess-cloudflare' })
    }

    if (url.pathname !== '/chess') {
      return new Response('NEXA Chess realtime is online', {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8' }
      })
    }

    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 })
    }

    const stub = env.CHESS_HUB.getByName('global')
    return stub.fetch(request)
  }
}

export class ChessHub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env)
    this.ctx = ctx
    this.env = env
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong')
    )
  }

  async fetch(request) {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return json({ ok: true, hub: 'global' })
    }

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ kind: 'unauth' })

    return new Response(null, { status: 101, webSocket: client })
  }

  getAttachment(ws) {
    try {
      return ws.deserializeAttachment() || { kind: 'unauth' }
    } catch {
      return { kind: 'unauth' }
    }
  }

  setAttachment(ws, value) {
    try { ws.serializeAttachment(value) } catch {}
  }

  allSockets() {
    return this.ctx.getWebSockets()
  }

  findMenuSocket(bot, pid, except = null) {
    for (const ws of this.allSockets()) {
      if (ws === except) continue
      const a = this.getAttachment(ws)
      if (a.kind === 'menu' && a.bot === bot && a.pid === pid) return ws
    }
    return null
  }

  broadcastMatch(matchId, data) {
    for (const ws of this.allSockets()) {
      const a = this.getAttachment(ws)
      if (a.kind === 'match' && a.matchId === matchId) wsSend(ws, data)
    }
  }

  async getWaitingRoom(identity) {
    const key = hostRoomKey(identity)
    const id = await this.ctx.storage.get(key)
    if (!id) return null

    const room = await this.ctx.storage.get(roomKey(id))
    if (!room || room.status !== 'waiting' || Number(room.expiresAt) <= Date.now()) {
      await this.ctx.storage.delete(key)
      if (room && room.status === 'waiting') await this.ctx.storage.delete(roomKey(id))
      return null
    }
    return room
  }

  async generateRoomId() {
    for (let i = 0; i < 100; i++) {
      const id = randomRoomId()
      const used = await this.ctx.storage.get(`used:${id}`)
      if (!used) {
        // Intentionally retained: a Room ID is one-use and is never recycled.
        await this.ctx.storage.put(`used:${id}`, Date.now())
        return id
      }
    }
    throw new Error('ROOM_ID_GENERATION_FAILED')
  }

  async scheduleCleanup(expiresAt) {
    const current = await this.ctx.storage.getAlarm()
    const target = Number(expiresAt)
    if (!Number.isFinite(target)) return
    if (current == null || target < current) await this.ctx.storage.setAlarm(target)
  }

  async authenticate(ws, token) {
    const raw = String(token || '')

    const matchAuth = await this.ctx.storage.get(matchTokenKey(raw))
    if (matchAuth) {
      const match = await this.ctx.storage.get(matchKey(matchAuth.matchId))
      if (!match || Number(match.expiresAt) <= Date.now()) {
        await this.ctx.storage.delete(matchTokenKey(raw))
        wsSend(ws, { type: 'error', code: 'INVALID_TOKEN' })
        return
      }

      for (const other of this.allSockets()) {
        if (other === ws) continue
        const a = this.getAttachment(other)
        if (
          a.kind === 'match' &&
          a.matchId === match.id &&
          a.color === matchAuth.color
        ) {
          try { other.close(4001, 'replaced') } catch {}
        }
      }

      this.setAttachment(ws, {
        kind: 'match',
        matchId: match.id,
        color: matchAuth.color,
        pid: matchAuth.pid
      })
      this.sendMatchState(ws, match, matchAuth.color)
      return
    }

    const identity = await verifyMenuTicket(raw, String(this.env.NEXA_CHESS_SECRET || ''))
    if (!identity) {
      wsSend(ws, { type: 'error', code: 'INVALID_TOKEN' })
      return
    }

    const old = this.findMenuSocket(identity.bot, identity.pid, ws)
    if (old) {
      try { old.close(4001, 'replaced') } catch {}
    }

    this.setAttachment(ws, { kind: 'menu', ...identity })
    const room = await this.getWaitingRoom(identity)
    wsSend(ws, {
      type: 'menu_ready',
      status: room ? 'waiting_room' : 'menu',
      roomId: room?.id || null
    })
  }

  sendMatchState(ws, match, color) {
    wsSend(ws, {
      type: 'state',
      color,
      turn: match.turn,
      moves: Array.isArray(match.moves) ? match.moves : [],
      status: match.status,
      opponentName: color === 'w' ? match.black.name : match.white.name
    })
  }

  async createRoom(ws, identity) {
    let room = await this.getWaitingRoom(identity)
    if (!room) {
      const id = await this.generateRoomId()
      const ts = Date.now()
      room = {
        id,
        bot: identity.bot,
        host: {
          bot: identity.bot,
          pid: identity.pid,
          name: identity.name
        },
        status: 'waiting',
        matchId: null,
        createdAt: ts,
        expiresAt: Math.min(Number(identity.exp), ts + ROOM_TTL_MS)
      }
      await this.ctx.storage.put(roomKey(id), room)
      await this.ctx.storage.put(hostRoomKey(identity), id)
      await this.scheduleCleanup(room.expiresAt)
    }

    wsSend(ws, { type: 'room_created', roomId: room.id, expiresAt: room.expiresAt })
  }

  async cancelRoom(ws, identity) {
    const room = await this.getWaitingRoom(identity)
    if (room) {
      room.status = 'cancelled'
      room.updatedAt = Date.now()
      await this.ctx.storage.put(roomKey(room.id), room)
      await this.ctx.storage.delete(hostRoomKey(identity))
    }
    wsSend(ws, { type: 'room_cancelled' })
  }

  async joinRoom(ws, identity, value) {
    const id = normalizeRoomId(value)
    const room = await this.ctx.storage.get(roomKey(id))

    if (!room || room.status !== 'waiting' || Number(room.expiresAt) <= Date.now()) {
      wsSend(ws, { type: 'error', code: 'ROOM_NOT_FOUND' })
      return
    }
    if (room.bot !== identity.bot) {
      wsSend(ws, { type: 'error', code: 'ROOM_NOT_FOUND' })
      return
    }
    if (room.host.pid === identity.pid) {
      wsSend(ws, { type: 'error', code: 'CANNOT_JOIN_SELF' })
      return
    }

    const hostWs = this.findMenuSocket(room.host.bot, room.host.pid)
    if (!hostWs) {
      wsSend(ws, { type: 'error', code: 'HOST_OFFLINE' })
      return
    }

    const guest = {
      bot: identity.bot,
      pid: identity.pid,
      name: identity.name
    }
    const hostIsWhite = (crypto.getRandomValues(new Uint8Array(1))[0] & 1) === 0
    const white = hostIsWhite ? room.host : guest
    const black = hostIsWhite ? guest : room.host
    const idMatch = `chess_${randomHex(10)}`
    const whiteToken = randomHex(24)
    const blackToken = randomHex(24)
    const ts = Date.now()

    const match = {
      id: idMatch,
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

    room.status = 'matched'
    room.matchId = match.id
    room.guest = guest
    room.updatedAt = ts
    room.expiresAt = match.expiresAt

    await this.ctx.storage.put(matchKey(match.id), match)
    await this.ctx.storage.put(matchTokenKey(whiteToken), {
      matchId: match.id,
      color: 'w',
      pid: white.pid,
      expiresAt: match.expiresAt
    })
    await this.ctx.storage.put(matchTokenKey(blackToken), {
      matchId: match.id,
      color: 'b',
      pid: black.pid,
      expiresAt: match.expiresAt
    })
    await this.ctx.storage.put(roomKey(room.id), room)
    await this.ctx.storage.delete(`hostroom:${room.bot}:${room.host.pid}`)
    await this.scheduleCleanup(match.expiresAt)

    const hostColor = white.pid === room.host.pid ? 'w' : 'b'
    const guestColor = white.pid === guest.pid ? 'w' : 'b'

    wsSend(ws, {
      type: 'match_ready',
      matchToken: guestColor === 'w' ? whiteToken : blackToken,
      playerColor: guestColor,
      opponentName: room.host.name
    })
    wsSend(hostWs, {
      type: 'match_ready',
      matchToken: hostColor === 'w' ? whiteToken : blackToken,
      playerColor: hostColor,
      opponentName: guest.name
    })
  }

  async handleMenu(ws, attachment, data) {
    if (data.type === 'create_room') {
      await this.createRoom(ws, attachment)
      return
    }
    if (data.type === 'cancel_room') {
      await this.cancelRoom(ws, attachment)
      return
    }
    if (data.type === 'join_room') {
      await this.joinRoom(ws, attachment, data.roomId)
    }
  }

  async handleMatch(ws, attachment, data) {
    const match = await this.ctx.storage.get(matchKey(attachment.matchId))
    if (!match || Number(match.expiresAt) <= Date.now()) {
      wsSend(ws, { type: 'error', code: 'MATCH_NOT_ACTIVE' })
      return
    }

    // The current mini-app uses auth again as a lightweight resync request.
    if (data.type === 'auth') {
      this.sendMatchState(ws, match, attachment.color)
      return
    }

    if (match.status !== 'playing') {
      if (match.status === 'finished') wsSend(ws, { type: 'result', result: match.result })
      else wsSend(ws, { type: 'error', code: 'MATCH_NOT_ACTIVE' })
      return
    }

    if (data.type === 'move') {
      if (attachment.color !== match.turn) {
        wsSend(ws, { type: 'error', code: 'NOT_YOUR_TURN' })
        return
      }

      const m = data.move || {}
      const nums = [m.fy, m.fx, m.ty, m.tx].map(Number)
      if (nums.some(v => !Number.isInteger(v) || v < 0 || v > 7)) {
        wsSend(ws, { type: 'error', code: 'INVALID_MOVE_SHAPE' })
        return
      }

      const expectedSeq = Array.isArray(match.moves) ? match.moves.length : 0
      if (Number(data.seq) !== expectedSeq) {
        wsSend(ws, { type: 'resync', moves: match.moves || [], turn: match.turn })
        return
      }

      if (expectedSeq >= 300) {
        wsSend(ws, { type: 'error', code: 'MOVE_LIMIT' })
        return
      }

      const entry = { fy: nums[0], fx: nums[1], ty: nums[2], tx: nums[3] }
      match.moves = [...(match.moves || []), entry]
      const by = match.turn
      match.turn = by === 'w' ? 'b' : 'w'
      match.updatedAt = Date.now()
      await this.ctx.storage.put(matchKey(match.id), match)

      this.broadcastMatch(match.id, {
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
      match.updatedAt = Date.now()
      await this.ctx.storage.put(matchKey(match.id), match)
      this.broadcastMatch(match.id, { type: 'result', result })
    }
  }

  async webSocketMessage(ws, message) {
    let data
    try {
      const raw = typeof message === 'string' ? message : textDecoder.decode(message)
      data = JSON.parse(raw)
    } catch {
      return
    }

    const attachment = this.getAttachment(ws)
    if (!attachment || attachment.kind === 'unauth') {
      if (data.type !== 'auth' || !data.token) {
        wsSend(ws, { type: 'error', code: 'AUTH_REQUIRED' })
        return
      }
      await this.authenticate(ws, data.token)
      return
    }

    if (attachment.kind === 'menu') await this.handleMenu(ws, attachment, data)
    else if (attachment.kind === 'match') await this.handleMatch(ws, attachment, data)
  }

  async webSocketClose() {
    // Hibernation API keeps connection state in serialized attachments.
    // Waiting rooms intentionally remain for their TTL; join will reject if host is offline.
  }

  async webSocketError() {}

  async cleanupExpired() {
    const ts = Date.now()
    let next = null

    const rooms = await this.ctx.storage.list({ prefix: 'room:' })
    for (const [key, room] of rooms) {
      const exp = Number(room?.expiresAt)
      if (!Number.isFinite(exp) || exp <= ts) {
        if (room?.status === 'waiting' && room?.host) {
          await this.ctx.storage.delete(`hostroom:${room.bot}:${room.host.pid}`)
        }
        await this.ctx.storage.delete(key)
      } else if (next == null || exp < next) {
        next = exp
      }
    }

    const matches = await this.ctx.storage.list({ prefix: 'match:' })
    for (const [key, match] of matches) {
      const exp = Number(match?.expiresAt)
      if (!Number.isFinite(exp) || exp <= ts) {
        if (match?.whiteToken) await this.ctx.storage.delete(matchTokenKey(match.whiteToken))
        if (match?.blackToken) await this.ctx.storage.delete(matchTokenKey(match.blackToken))
        await this.ctx.storage.delete(key)
      } else if (next == null || exp < next) {
        next = exp
      }
    }

    if (next != null) await this.ctx.storage.setAlarm(Math.max(ts + 1000, next))
    else await this.ctx.storage.deleteAlarm()
  }

  async alarm() {
    await this.cleanupExpired()
  }
}
