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
  secret = String(secret || '').trim()
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


function chessInitialBoard() {
  return [
    ['bR','bN','bB','bQ','bK','bB','bN','bR'],
    ['bP','bP','bP','bP','bP','bP','bP','bP'],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    ['wP','wP','wP','wP','wP','wP','wP','wP'],
    ['wR','wN','wB','wQ','wK','wB','wN','wR']
  ]
}

function chessEnemy(c) { return c === 'w' ? 'b' : 'w' }
function chessInside(y, x) { return y >= 0 && y < 8 && x >= 0 && x < 8 }
function chessPromo(value) {
  const p = String(value || '').toUpperCase()
  return ['Q', 'R', 'B', 'N'].includes(p) ? p : ''
}

function chessEpCapturePossible(s) {
  if (!s.ep) return false
  const pawnY = s.turn === 'w' ? s.ep.y + 1 : s.ep.y - 1
  if (!chessInside(pawnY, s.ep.x)) return false
  for (const dx of [-1, 1]) {
    const x = s.ep.x + dx
    if (chessInside(pawnY, x) && s.b[pawnY][x] === s.turn + 'P') return true
  }
  return false
}

function chessPositionKey(s) {
  const board = s.b.map(row => row.map(p => p || '--').join('')).join('/')
  const castle =
    (s.castle.K ? 'K' : '') + (s.castle.Q ? 'Q' : '') +
    (s.castle.k ? 'k' : '') + (s.castle.q ? 'q' : '') || '-'
  const ep = s.ep && chessEpCapturePossible(s) ? `${s.ep.y},${s.ep.x}` : '-'
  return `${board}|${s.turn}|${castle}|${ep}`
}

function chessNewState() {
  const s = {
    b: chessInitialBoard(),
    turn: 'w',
    castle: { K: true, Q: true, k: true, q: true },
    ep: null,
    halfmove: 0,
    fullmove: 1,
    history: []
  }
  s.history = [chessPositionKey(s)]
  return s
}

function chessClone(s, copyHistory = true) {
  return {
    b: s.b.map(r => r.slice()),
    turn: s.turn,
    castle: { ...s.castle },
    ep: s.ep ? { ...s.ep } : null,
    halfmove: Number(s.halfmove) || 0,
    fullmove: Number(s.fullmove) || 1,
    history: copyHistory
      ? (Array.isArray(s.history) ? s.history.slice() : [])
      : (Array.isArray(s.history) ? s.history : [])
  }
}

function chessAttacked(s, y, x, by) {
  const b = s.b
  const pawnY = y - (by === 'w' ? -1 : 1)
  for (const dx of [-1, 1]) {
    const xx = x + dx
    if (chessInside(pawnY, xx) && b[pawnY][xx] === by + 'P') return true
  }

  for (const [dy, dx] of [
    [-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]
  ]) {
    const yy = y + dy, xx = x + dx
    if (chessInside(yy, xx) && b[yy][xx] === by + 'N') return true
  }

  for (const [dy, dx] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
    let yy = y + dy, xx = x + dx
    while (chessInside(yy, xx)) {
      const p = b[yy][xx]
      if (p) {
        if (p[0] === by && (p[1] === 'B' || p[1] === 'Q')) return true
        break
      }
      yy += dy; xx += dx
    }
  }

  for (const [dy, dx] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    let yy = y + dy, xx = x + dx
    while (chessInside(yy, xx)) {
      const p = b[yy][xx]
      if (p) {
        if (p[0] === by && (p[1] === 'R' || p[1] === 'Q')) return true
        break
      }
      yy += dy; xx += dx
    }
  }

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dy && !dx) continue
      const yy = y + dy, xx = x + dx
      if (chessInside(yy, xx) && b[yy][xx] === by + 'K') return true
    }
  }
  return false
}

function chessKingPos(s, color) {
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    if (s.b[y][x] === color + 'K') return { y, x }
  }
  return null
}

function chessInCheck(s, color) {
  const k = chessKingPos(s, color)
  if (!k) return true
  return chessAttacked(s, k.y, k.x, chessEnemy(color))
}

function chessPseudoMoves(s) {
  const out = []
  const b = s.b
  const side = s.turn

  function add(fy, fx, ty, tx, extra = {}) {
    if (!chessInside(ty, tx)) return
    const target = b[ty][tx]
    if (target && target[0] === side) return
    if (target && target[1] === 'K') return
    out.push({ fy, fx, ty, tx, ...extra })
  }

  function addPawn(fy, fx, ty, tx, extra = {}) {
    const promoRank = side === 'w' ? 0 : 7
    if (ty === promoRank) {
      for (const promo of ['Q', 'R', 'B', 'N']) add(fy, fx, ty, tx, { ...extra, promo })
    } else add(fy, fx, ty, tx, extra)
  }

  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const p = b[y][x]
    if (!p || p[0] !== side) continue
    const type = p[1]

    if (type === 'P') {
      const d = side === 'w' ? -1 : 1
      const start = side === 'w' ? 6 : 1
      const y1 = y + d
      if (chessInside(y1, x) && !b[y1][x]) {
        addPawn(y, x, y1, x)
        const y2 = y + d * 2
        if (y === start && chessInside(y2, x) && !b[y2][x]) add(y, x, y2, x, { double: true })
      }
      for (const dx of [-1, 1]) {
        const yy = y + d, xx = x + dx
        if (!chessInside(yy, xx)) continue
        const t = b[yy][xx]
        if (t && t[0] !== side && t[1] !== 'K') addPawn(y, x, yy, xx)
        if (s.ep && s.ep.y === yy && s.ep.x === xx) {
          const capY = side === 'w' ? yy + 1 : yy - 1
          if (chessInside(capY, xx) && b[capY][xx] === chessEnemy(side) + 'P') {
            add(y, x, yy, xx, { ep: true })
          }
        }
      }
    }

    if (type === 'N') {
      for (const [dy, dx] of [
        [-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]
      ]) add(y, x, y + dy, x + dx)
    }

    if (type === 'B' || type === 'R' || type === 'Q') {
      const dirs = []
      if (type === 'B' || type === 'Q') dirs.push([-1,-1],[-1,1],[1,-1],[1,1])
      if (type === 'R' || type === 'Q') dirs.push([-1,0],[1,0],[0,-1],[0,1])
      for (const [dy, dx] of dirs) {
        let yy = y + dy, xx = x + dx
        while (chessInside(yy, xx)) {
          if (!b[yy][xx]) add(y, x, yy, xx)
          else { add(y, x, yy, xx); break }
          yy += dy; xx += dx
        }
      }
    }

    if (type === 'K') {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (dy || dx) add(y, x, y + dy, x + dx)
      }
      if (side === 'w' && y === 7 && x === 4) {
        if (s.castle.K && b[7][5] === null && b[7][6] === null && b[7][7] === 'wR' &&
            !chessInCheck(s, 'w') && !chessAttacked(s, 7, 5, 'b') && !chessAttacked(s, 7, 6, 'b')) {
          add(7, 4, 7, 6, { castle: 'K' })
        }
        if (s.castle.Q && b[7][1] === null && b[7][2] === null && b[7][3] === null && b[7][0] === 'wR' &&
            !chessInCheck(s, 'w') && !chessAttacked(s, 7, 3, 'b') && !chessAttacked(s, 7, 2, 'b')) {
          add(7, 4, 7, 2, { castle: 'Q' })
        }
      }
      if (side === 'b' && y === 0 && x === 4) {
        if (s.castle.k && b[0][5] === null && b[0][6] === null && b[0][7] === 'bR' &&
            !chessInCheck(s, 'b') && !chessAttacked(s, 0, 5, 'w') && !chessAttacked(s, 0, 6, 'w')) {
          add(0, 4, 0, 6, { castle: 'k' })
        }
        if (s.castle.q && b[0][1] === null && b[0][2] === null && b[0][3] === null && b[0][0] === 'bR' &&
            !chessInCheck(s, 'b') && !chessAttacked(s, 0, 3, 'w') && !chessAttacked(s, 0, 2, 'w')) {
          add(0, 4, 0, 2, { castle: 'q' })
        }
      }
    }
  }
  return out
}

function chessApplyMove(s, m, trackHistory = true) {
  const n = chessClone(s, trackHistory)
  const piece = n.b[m.fy]?.[m.fx]
  if (!piece) return n
  let captured = n.b[m.ty][m.tx]
  n.b[m.fy][m.fx] = null

  if (m.ep) {
    const capY = piece[0] === 'w' ? m.ty + 1 : m.ty - 1
    captured = n.b[capY]?.[m.tx] || captured
    if (chessInside(capY, m.tx)) n.b[capY][m.tx] = null
  }

  const promo = chessPromo(m.promo)
  n.b[m.ty][m.tx] = promo ? piece[0] + promo : piece

  if (m.castle === 'K') { n.b[7][5] = n.b[7][7]; n.b[7][7] = null }
  if (m.castle === 'Q') { n.b[7][3] = n.b[7][0]; n.b[7][0] = null }
  if (m.castle === 'k') { n.b[0][5] = n.b[0][7]; n.b[0][7] = null }
  if (m.castle === 'q') { n.b[0][3] = n.b[0][0]; n.b[0][0] = null }

  if (piece === 'wK') { n.castle.K = false; n.castle.Q = false }
  if (piece === 'bK') { n.castle.k = false; n.castle.q = false }
  if (piece === 'wR') {
    if (m.fy === 7 && m.fx === 0) n.castle.Q = false
    if (m.fy === 7 && m.fx === 7) n.castle.K = false
  }
  if (piece === 'bR') {
    if (m.fy === 0 && m.fx === 0) n.castle.q = false
    if (m.fy === 0 && m.fx === 7) n.castle.k = false
  }
  if (captured === 'wR') {
    if (m.ty === 7 && m.tx === 0) n.castle.Q = false
    if (m.ty === 7 && m.tx === 7) n.castle.K = false
  }
  if (captured === 'bR') {
    if (m.ty === 0 && m.tx === 0) n.castle.q = false
    if (m.ty === 0 && m.tx === 7) n.castle.k = false
  }

  n.ep = null
  if (piece[1] === 'P' && Math.abs(m.ty - m.fy) === 2) {
    n.ep = { y: (m.ty + m.fy) / 2, x: m.fx }
  }

  n.halfmove = (piece[1] === 'P' || captured) ? 0 : (Number(s.halfmove) || 0) + 1
  n.fullmove = (Number(s.fullmove) || 1) + (s.turn === 'b' ? 1 : 0)
  n.turn = chessEnemy(s.turn)
  if (trackHistory) {
    n.history = Array.isArray(n.history) ? n.history.slice() : []
    n.history.push(chessPositionKey(n))
  }
  return n
}

function chessLegalMoves(s) {
  const side = s.turn
  return chessPseudoMoves(s).filter(m => !chessInCheck(chessApplyMove(s, m, false), side))
}

function chessResolveMove(s, raw) {
  const fy = Number(raw?.fy), fx = Number(raw?.fx), ty = Number(raw?.ty), tx = Number(raw?.tx)
  if (![fy, fx, ty, tx].every(v => Number.isInteger(v) && v >= 0 && v <= 7)) return null
  const candidates = chessLegalMoves(s).filter(m => m.fy === fy && m.fx === fx && m.ty === ty && m.tx === tx)
  const promo = chessPromo(raw?.promo)
  if (promo) return candidates.find(m => chessPromo(m.promo) === promo) || null
  return candidates.find(m => !m.promo) || candidates.find(m => m.promo === 'Q') || candidates[0] || null
}

function chessInsufficientMaterial(s) {
  const pieces = []
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const p = s.b[y][x]
    if (!p || p[1] === 'K') continue
    if (['P', 'R', 'Q'].includes(p[1])) return false
    pieces.push({ p, y, x })
  }
  if (pieces.length === 0) return true
  if (pieces.length === 1) return ['B', 'N'].includes(pieces[0].p[1])
  if (pieces.every(v => v.p[1] === 'B')) {
    const colors = new Set(pieces.map(v => (v.y + v.x) & 1))
    if (colors.size === 1) return true
  }
  return false
}

function chessRepetitionCount(s) {
  const key = chessPositionKey(s)
  let count = 0
  for (const item of Array.isArray(s.history) ? s.history : []) if (item === key) count++
  return count
}

function chessTerminal(s) {
  const moves = chessLegalMoves(s)
  if (!moves.length) {
    if (chessInCheck(s, s.turn)) {
      return { type: 'mate', winner: chessEnemy(s.turn), reason: 'checkmate' }
    }
    return { type: 'draw', winner: null, reason: 'stalemate' }
  }
  if (chessInsufficientMaterial(s)) return { type: 'draw', winner: null, reason: 'material' }
  if ((Number(s.halfmove) || 0) >= 100) return { type: 'draw', winner: null, reason: '50move' }
  if (chessRepetitionCount(s) >= 3) return { type: 'draw', winner: null, reason: 'threefold' }
  return null
}

function chessReplay(moves) {
  let s = chessNewState()
  for (const raw of Array.isArray(moves) ? moves : []) {
    const m = chessResolveMove(s, raw)
    if (!m) return null
    s = chessApplyMove(s, m, true)
  }
  return s
}

function chessResultValue(terminal) {
  if (!terminal) return null
  if (terminal.type === 'draw') return 'draw'
  return terminal.winner === 'w' ? 'white' : 'black'
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
      return json({
        ok: true,
        service: 'nexa-chess-cloudflare',
        websocketPath: '/chess',
        secretConfigured: Boolean(String(env.NEXA_CHESS_SECRET || '').trim()),
        durableObjectConfigured: Boolean(env.CHESS_HUB)
      })
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

    console.info(JSON.stringify({ event: 'chess_ws_upgrade', path: url.pathname }))
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

    const identity = await verifyMenuTicket(
      raw,
      String(this.env.NEXA_CHESS_SECRET || '').trim()
    )
    if (!identity) {
      console.warn(JSON.stringify({ event: 'chess_auth_failed', kind: 'menu' }))
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
      result: match.result || null,
      terminalReason: match.terminalReason || null,
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

    // Auth ulang dipakai client sebagai resync ringan.
    if (data.type === 'auth') {
      this.sendMatchState(ws, match, attachment.color)
      return
    }

    if (match.status !== 'playing') {
      if (match.status === 'finished') {
        wsSend(ws, {
          type: 'result',
          result: match.result,
          reason: match.terminalReason || null
        })
      } else {
        wsSend(ws, { type: 'error', code: 'MATCH_NOT_ACTIVE' })
      }
      return
    }

    if (data.type === 'move') {
      const expectedSeq = Array.isArray(match.moves) ? match.moves.length : 0
      if (Number(data.seq) !== expectedSeq) {
        wsSend(ws, { type: 'resync', moves: match.moves || [], turn: match.turn })
        return
      }

      if (expectedSeq >= 600) {
        wsSend(ws, { type: 'error', code: 'MOVE_LIMIT' })
        return
      }

      const state = chessReplay(match.moves || [])
      if (!state) {
        console.error(JSON.stringify({ event: 'chess_state_corrupt', matchId: match.id }))
        wsSend(ws, { type: 'error', code: 'MATCH_STATE_CORRUPT' })
        return
      }

      if (attachment.color !== state.turn) {
        wsSend(ws, { type: 'error', code: 'NOT_YOUR_TURN' })
        return
      }

      const legal = chessResolveMove(state, data.move || {})
      if (!legal) {
        wsSend(ws, { type: 'error', code: 'ILLEGAL_MOVE' })
        return
      }

      const entry = {
        fy: legal.fy,
        fx: legal.fx,
        ty: legal.ty,
        tx: legal.tx
      }
      if (legal.promo) entry.promo = legal.promo

      const nextState = chessApplyMove(state, legal, true)
      const terminal = chessTerminal(nextState)
      const by = state.turn

      match.moves = [...(match.moves || []), entry]
      match.turn = nextState.turn
      match.updatedAt = Date.now()

      if (terminal) {
        match.status = 'finished'
        match.result = chessResultValue(terminal)
        match.terminalReason = terminal.reason || null
      }

      await this.ctx.storage.put(matchKey(match.id), match)

      this.broadcastMatch(match.id, {
        type: 'move',
        move: entry,
        by,
        seq: expectedSeq,
        turn: match.turn
      })

      if (terminal) {
        this.broadcastMatch(match.id, {
          type: 'result',
          result: match.result,
          reason: match.terminalReason
        })
      }
      return
    }

    if (data.type === 'resign') {
      const winner = attachment.color === 'w' ? 'black' : 'white'
      match.status = 'finished'
      match.result = winner
      match.terminalReason = 'resign'
      match.updatedAt = Date.now()
      await this.ctx.storage.put(matchKey(match.id), match)
      this.broadcastMatch(match.id, { type: 'result', result: winner, reason: 'resign' })
      return
    }

    // Legacy client boleh mengirim "result", tetapi server tidak mempercayainya.
    if (data.type === 'result') {
      wsSend(ws, { type: 'error', code: 'SERVER_AUTHORITATIVE' })
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
