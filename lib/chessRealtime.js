import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { createHash, randomBytes, randomInt } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

import { ensureDatabaseDirectory, runDatabaseMigrations } from './dbMigrations.js'
import { getUser } from './userdb.js'

const DB_FILE = './database/nexa.sqlite'
const BOT_KEY = process.env.NEXA_BOT_ID || 'main'
const IS_CHILD = process.env.NEXA_CHILD_BOT === '1'
const WS_PORT = Math.max(1, Number(process.env.NEXA_CHESS_WS_PORT || 3210) || 3210)
const WS_HOST = String(process.env.NEXA_CHESS_WS_HOST || '0.0.0.0')
const PUBLIC_WS_URL = String(process.env.NEXA_CHESS_WS_URL || '').trim()
const TLS_CERT = String(process.env.NEXA_CHESS_TLS_CERT || '').trim()
const TLS_KEY = String(process.env.NEXA_CHESS_TLS_KEY || '').trim()

const MENU_TTL_MS = 2 * 60 * 60 * 1000
const ROOM_TTL_MS = 10 * 60 * 1000
const MATCH_TTL_MS = 2 * 60 * 60 * 1000
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const ROOM_LENGTH = 8

ensureDatabaseDirectory(DB_FILE)
const db = new DatabaseSync(DB_FILE, { timeout: 10000 })
db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 10000;
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
`)
runDatabaseMigrations(db)

let server = null
const peersByMatch = new Map()
const menuPeersByToken = new Map()

function now() {
  return Date.now()
}

function token(bytes = 24) {
  return randomBytes(bytes).toString('hex')
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

function displayName(jid) {
  const user = getUser(jid)
  return String(user?.name || '').trim() || `@${String(jid || '').split('@')[0]}`
}

function parseJson(value, fallback = []) {
  try {
    return JSON.parse(String(value || ''))
  } catch {
    return fallback
  }
}

function execImmediate(fn) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const out = fn()
    db.exec('COMMIT')
    return out
  } catch (err) {
    try { db.exec('ROLLBACK') } catch {}
    throw err
  }
}

function roomId() {
  let out = ''
  for (let i = 0; i < ROOM_LENGTH; i++) {
    out += ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)]
  }
  return out
}

function normalizeRoomId(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, ROOM_LENGTH)
}

export function getChessPublicWsUrl() {
  return PUBLIC_WS_URL
}

export function chessMultiplayerConfigured() {
  return Boolean(PUBLIC_WS_URL)
}

export function createChessMenuSession({ chatJid, playerJid }) {
  const chat = String(chatJid || '').trim()
  const player = normalizeJid(playerJid)
  if (!chat || !player) throw new Error('INVALID_CHESS_MENU_SESSION')

  const menuToken = token(24)
  const createdAt = now()
  const expiresAt = createdAt + MENU_TTL_MS

  db.prepare(`
    INSERT INTO chess_menu_sessions (
      token, bot_key, chat_jid, player_jid, player_name,
      status, created_at, expires_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'menu', ?, ?, ?)
  `).run(
    menuToken,
    BOT_KEY,
    chat,
    player,
    displayName(player),
    createdAt,
    expiresAt,
    createdAt
  )

  return { token: menuToken, expiresAt, botKey: BOT_KEY }
}

function getMenuSession(menuToken) {
  return db.prepare(`
    SELECT *
    FROM chess_menu_sessions
    WHERE token = ?
  `).get(String(menuToken || '')) || null
}

function menuByToken(authToken) {
  const ts = now()
  return db.prepare(`
    SELECT *
    FROM chess_menu_sessions
    WHERE token = ?
      AND expires_at > ?
    LIMIT 1
  `).get(authToken, ts) || null
}

function waitingRoomForHost(menuToken) {
  const ts = now()
  return db.prepare(`
    SELECT *
    FROM chess_rooms
    WHERE host_menu_token = ?
      AND status = 'waiting'
      AND expires_at > ?
    LIMIT 1
  `).get(String(menuToken || ''), ts) || null
}

function matchedRoomForMenu(menuToken) {
  return db.prepare(`
    SELECT *
    FROM chess_rooms
    WHERE (host_menu_token = ? OR guest_menu_token = ?)
      AND status = 'matched'
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(String(menuToken || ''), String(menuToken || '')) || null
}

function expireOldRows() {
  const ts = now()

  db.prepare(`
    UPDATE chess_menu_sessions
    SET status = 'expired', updated_at = ?
    WHERE status IN ('menu','waiting_room')
      AND expires_at <= ?
  `).run(ts, ts)

  db.prepare(`
    UPDATE chess_rooms
    SET status = 'expired', updated_at = ?
    WHERE status = 'waiting'
      AND expires_at <= ?
  `).run(ts, ts)

  db.prepare(`
    UPDATE chess_matches
    SET status = 'expired', updated_at = ?
    WHERE status = 'playing'
      AND expires_at <= ?
  `).run(ts, ts)
}

function validatePrivateMenu(menu) {
  if (!menu) return 'INVALID_TOKEN'
  if (String(menu.chat_jid || '').endsWith('@g.us')) return 'PRIVATE_ONLY'
  const player = getUser(menu.player_jid)
  if (!player?.registeredAt) return 'REGISTER_REQUIRED'
  return null
}

function createPrivateRoom(menuToken) {
  expireOldRows()
  const menu = getMenuSession(menuToken)
  const invalid = validatePrivateMenu(menu)
  if (invalid) throw new Error(invalid)

  const existing = waitingRoomForHost(menuToken)
  if (existing) return existing

  const createdAt = now()
  const expiresAt = createdAt + ROOM_TTL_MS

  for (let attempt = 0; attempt < 20; attempt++) {
    const id = roomId()
    try {
      return execImmediate(() => {
        const fresh = getMenuSession(menuToken)
        if (!fresh || String(fresh.chat_jid || '').endsWith('@g.us')) {
          throw new Error('PRIVATE_ONLY')
        }

        const already = waitingRoomForHost(menuToken)
        if (already) return already

        db.prepare(`
          INSERT INTO chess_rooms (
            room_id, bot_key,
            host_menu_token, host_jid, host_name,
            status, created_at, expires_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'waiting', ?, ?, ?)
        `).run(
          id,
          fresh.bot_key,
          fresh.token,
          fresh.player_jid,
          fresh.player_name,
          createdAt,
          expiresAt,
          createdAt
        )

        db.prepare(`
          UPDATE chess_menu_sessions
          SET status = 'waiting_room', lobby_id = ?, match_id = NULL, updated_at = ?
          WHERE token = ?
        `).run(id, createdAt, fresh.token)

        return db.prepare(`SELECT * FROM chess_rooms WHERE room_id = ?`).get(id)
      })
    } catch (err) {
      if (String(err?.message || '').includes('UNIQUE')) continue
      throw err
    }
  }

  throw new Error('ROOM_ID_GENERATION_FAILED')
}

function cancelPrivateRoom(menuToken) {
  const ts = now()
  return execImmediate(() => {
    db.prepare(`
      UPDATE chess_rooms
      SET status = 'cancelled', updated_at = ?
      WHERE host_menu_token = ?
        AND status = 'waiting'
    `).run(ts, String(menuToken || ''))

    db.prepare(`
      UPDATE chess_menu_sessions
      SET status = 'menu', lobby_id = NULL, updated_at = ?
      WHERE token = ?
    `).run(ts, String(menuToken || ''))
  })
}

function makeMatchForRoom({ room, guestMenu }) {
  const host = normalizeJid(room.host_jid)
  const guest = normalizeJid(guestMenu.player_jid)
  if (!host || !guest) throw new Error('INVALID_MATCH_PLAYER')
  if (host === guest) throw new Error('CANNOT_JOIN_SELF')

  const hostIsWhite = randomInt(2) === 0
  const whiteJid = hostIsWhite ? host : guest
  const blackJid = hostIsWhite ? guest : host
  const whiteToken = token(24)
  const blackToken = token(24)
  const matchId = `chess_${token(10)}`
  const createdAt = now()
  const expiresAt = createdAt + MATCH_TTL_MS

  db.prepare(`
    INSERT INTO chess_matches (
      id, bot_key, chat_jid,
      white_jid, black_jid,
      white_name, black_name,
      white_token, black_token,
      status, turn, moves_json, ply,
      created_at, updated_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'playing', 'w', '[]', 0, ?, ?, ?)
  `).run(
    matchId,
    room.bot_key,
    room.room_id,
    whiteJid,
    blackJid,
    whiteJid === host ? room.host_name : guestMenu.player_name,
    blackJid === host ? room.host_name : guestMenu.player_name,
    whiteToken,
    blackToken,
    createdAt,
    createdAt,
    expiresAt
  )

  db.prepare(`
    UPDATE chess_rooms
    SET guest_menu_token = ?,
        guest_jid = ?,
        guest_name = ?,
        match_id = ?,
        status = 'matched',
        updated_at = ?
    WHERE room_id = ?
      AND status = 'waiting'
  `).run(
    guestMenu.token,
    guest,
    guestMenu.player_name,
    matchId,
    createdAt,
    room.room_id
  )

  db.prepare(`
    UPDATE chess_menu_sessions
    SET status = 'matched', match_id = ?, updated_at = ?
    WHERE token IN (?, ?)
  `).run(matchId, createdAt, room.host_menu_token, guestMenu.token)

  return db.prepare(`SELECT * FROM chess_matches WHERE id = ?`).get(matchId)
}

function playerTokenFor(match, jid) {
  if (jid === match.white_jid) return match.white_token
  if (jid === match.black_jid) return match.black_token
  return null
}

function colorFor(match, jid) {
  if (jid === match.white_jid) return 'w'
  if (jid === match.black_jid) return 'b'
  return null
}

function opponentNameFor(match, jid) {
  return jid === match.white_jid ? match.black_name : match.white_name
}

function matchReadyForMenu(menu) {
  if (!menu?.match_id) return null
  const match = db.prepare(`SELECT * FROM chess_matches WHERE id = ?`).get(menu.match_id)
  if (!match || !['playing', 'finished'].includes(match.status)) return null
  const player = normalizeJid(menu.player_jid)
  const color = colorFor(match, player)
  const matchToken = playerTokenFor(match, player)
  if (!color || !matchToken) return null
  return {
    type: 'match_ready',
    matchToken,
    playerColor: color,
    opponentName: opponentNameFor(match, player)
  }
}

function joinPrivateRoom(menuToken, rawRoomId) {
  expireOldRows()
  const guestMenu = getMenuSession(menuToken)
  const invalid = validatePrivateMenu(guestMenu)
  if (invalid) throw new Error(invalid)

  if (waitingRoomForHost(menuToken)) throw new Error('ROOM_ALREADY_OPEN')

  const id = normalizeRoomId(rawRoomId)
  if (id.length !== ROOM_LENGTH) throw new Error('ROOM_NOT_FOUND')

  const preview = db.prepare(`
    SELECT * FROM chess_rooms
    WHERE room_id = ?
      AND status = 'waiting'
      AND expires_at > ?
    LIMIT 1
  `).get(id, now())

  if (!preview) throw new Error('ROOM_NOT_FOUND')
  if (preview.bot_key !== guestMenu.bot_key) throw new Error('ROOM_NOT_FOUND')
  if (normalizeJid(preview.host_jid) === normalizeJid(guestMenu.player_jid)) {
    throw new Error('CANNOT_JOIN_SELF')
  }

  const hostPeer = menuPeersByToken.get(preview.host_menu_token)
  if (!hostPeer || hostPeer.socket?.destroyed) throw new Error('HOST_OFFLINE')

  return execImmediate(() => {
    const room = db.prepare(`
      SELECT * FROM chess_rooms
      WHERE room_id = ?
        AND status = 'waiting'
        AND expires_at > ?
      LIMIT 1
    `).get(id, now())

    if (!room || room.bot_key !== guestMenu.bot_key) throw new Error('ROOM_NOT_FOUND')
    if (normalizeJid(room.host_jid) === normalizeJid(guestMenu.player_jid)) {
      throw new Error('CANNOT_JOIN_SELF')
    }

    const liveHostPeer = menuPeersByToken.get(room.host_menu_token)
    if (!liveHostPeer || liveHostPeer.socket?.destroyed) throw new Error('HOST_OFFLINE')

    const match = makeMatchForRoom({ room, guestMenu })
    return { room, match }
  })
}

function matchByToken(authToken) {
  const ts = now()
  return db.prepare(`
    SELECT *
    FROM chess_matches
    WHERE (white_token = ? OR black_token = ?)
      AND status IN ('playing','finished')
      AND expires_at > ?
    LIMIT 1
  `).get(authToken, authToken, ts) || null
}

function sendFrame(socket, payload, opcode = 0x1) {
  if (!socket || socket.destroyed) return
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload))
  let header
  if (body.length < 126) {
    header = Buffer.alloc(2)
    header[0] = 0x80 | opcode
    header[1] = body.length
  } else if (body.length <= 0xffff) {
    header = Buffer.alloc(4)
    header[0] = 0x80 | opcode
    header[1] = 126
    header.writeUInt16BE(body.length, 2)
  } else {
    header = Buffer.alloc(10)
    header[0] = 0x80 | opcode
    header[1] = 127
    header.writeBigUInt64BE(BigInt(body.length), 2)
  }
  socket.write(Buffer.concat([header, body]))
}

function sendJson(peer, data) {
  try { sendFrame(peer.socket, JSON.stringify(data)) } catch {}
}

function parseFrames(peer, chunk, onText) {
  peer.buffer = Buffer.concat([peer.buffer, chunk])
  while (peer.buffer.length >= 2) {
    const b0 = peer.buffer[0]
    const b1 = peer.buffer[1]
    const opcode = b0 & 0x0f
    const masked = Boolean(b1 & 0x80)
    let length = b1 & 0x7f
    let offset = 2

    if (length === 126) {
      if (peer.buffer.length < 4) return
      length = peer.buffer.readUInt16BE(2)
      offset = 4
    } else if (length === 127) {
      if (peer.buffer.length < 10) return
      const n = peer.buffer.readBigUInt64BE(2)
      if (n > BigInt(Number.MAX_SAFE_INTEGER)) {
        peer.socket.destroy()
        return
      }
      length = Number(n)
      offset = 10
    }

    const maskLength = masked ? 4 : 0
    const total = offset + maskLength + length
    if (peer.buffer.length < total) return

    let payload
    if (masked) {
      const mask = peer.buffer.subarray(offset, offset + 4)
      const source = peer.buffer.subarray(offset + 4, total)
      payload = Buffer.alloc(source.length)
      for (let i = 0; i < source.length; i++) payload[i] = source[i] ^ mask[i % 4]
    } else {
      payload = peer.buffer.subarray(offset, total)
    }

    peer.buffer = peer.buffer.subarray(total)

    if (opcode === 0x8) {
      try { sendFrame(peer.socket, Buffer.alloc(0), 0x8) } catch {}
      peer.socket.end()
      return
    }
    if (opcode === 0x9) {
      sendFrame(peer.socket, payload, 0xA)
      continue
    }
    if (opcode !== 0x1) continue

    onText(payload.toString('utf8'))
  }
}

function registerPeerForMatch(peer, match, authToken) {
  const color = authToken === match.white_token ? 'w' : 'b'
  peer.authType = 'match'
  peer.matchId = match.id
  peer.color = color

  if (!peersByMatch.has(match.id)) peersByMatch.set(match.id, new Set())
  peersByMatch.get(match.id).add(peer)

  sendJson(peer, {
    type: 'state',
    color,
    turn: match.turn,
    moves: parseJson(match.moves_json, []),
    status: match.status,
    opponentName: color === 'w' ? match.black_name : match.white_name
  })
}

function registerPeerForMenu(peer, menu) {
  let current = menu
  if (current?.match_id) {
    const match = db.prepare(`SELECT status FROM chess_matches WHERE id = ?`).get(current.match_id)
    if (!match || match.status !== 'playing') {
      db.prepare(`
        UPDATE chess_menu_sessions
        SET status = 'menu', match_id = NULL, lobby_id = NULL, updated_at = ?
        WHERE token = ?
      `).run(now(), current.token)
      current = getMenuSession(current.token)
    }
  }

  peer.authType = 'menu'
  peer.menuToken = current.token
  menuPeersByToken.set(current.token, peer)

  const room = waitingRoomForHost(current.token)
  sendJson(peer, {
    type: 'menu_ready',
    status: current.status,
    roomId: room?.room_id || null
  })

  const ready = matchReadyForMenu(current)
  if (ready) sendJson(peer, ready)
}

function broadcastMatch(matchId, data) {
  const peers = peersByMatch.get(matchId)
  if (!peers) return
  for (const peer of peers) sendJson(peer, data)
}

function handleMatchMessage(peer, data) {
  const match = db.prepare(`SELECT * FROM chess_matches WHERE id = ?`).get(peer.matchId)
  if (!match || match.status !== 'playing') {
    sendJson(peer, { type: 'error', code: 'MATCH_NOT_ACTIVE' })
    return
  }

  if (data.type === 'move') {
    if (peer.color !== match.turn) {
      sendJson(peer, { type: 'error', code: 'NOT_YOUR_TURN' })
      return
    }

    const m = data.move || {}
    const nums = [m.fy, m.fx, m.ty, m.tx].map(Number)
    if (nums.some(v => !Number.isInteger(v) || v < 0 || v > 7)) {
      sendJson(peer, { type: 'error', code: 'INVALID_MOVE_SHAPE' })
      return
    }

    const moves = parseJson(match.moves_json, [])
    const expectedSeq = moves.length
    if (Number(data.seq) !== expectedSeq) {
      sendJson(peer, { type: 'resync', moves, turn: match.turn })
      return
    }

    const entry = { fy: nums[0], fx: nums[1], ty: nums[2], tx: nums[3] }
    moves.push(entry)
    const nextTurn = match.turn === 'w' ? 'b' : 'w'

    const changed = db.prepare(`
      UPDATE chess_matches
      SET moves_json = ?, ply = ?, turn = ?, updated_at = ?
      WHERE id = ? AND status = 'playing' AND ply = ? AND turn = ?
    `).run(JSON.stringify(moves), moves.length, nextTurn, now(), match.id, expectedSeq, match.turn)

    if (!Number(changed.changes || 0)) {
      const fresh = db.prepare(`SELECT * FROM chess_matches WHERE id = ?`).get(match.id)
      sendJson(peer, {
        type: 'resync',
        moves: parseJson(fresh?.moves_json, []),
        turn: fresh?.turn || 'w'
      })
      return
    }

    broadcastMatch(match.id, {
      type: 'move',
      move: entry,
      by: match.turn,
      seq: expectedSeq,
      turn: nextTurn
    })
    return
  }

  if (data.type === 'result') {
    const result = String(data.result || '')
    if (!['white', 'black', 'draw'].includes(result)) return
    db.prepare(`
      UPDATE chess_matches
      SET status = 'finished', result = ?, updated_at = ?
      WHERE id = ? AND status = 'playing'
    `).run(result, now(), match.id)
    broadcastMatch(match.id, { type: 'result', result })
  }
}

function menuError(peer, err) {
  sendJson(peer, { type: 'error', code: String(err?.message || err || 'UNKNOWN_ERROR') })
}

function handleMenuMessage(peer, data) {
  if (data.type === 'create_room') {
    try {
      const room = createPrivateRoom(peer.menuToken)
      sendJson(peer, {
        type: 'room_created',
        roomId: room.room_id,
        expiresAt: room.expires_at
      })
    } catch (err) {
      menuError(peer, err)
    }
    return
  }

  if (data.type === 'cancel_room') {
    try {
      cancelPrivateRoom(peer.menuToken)
      sendJson(peer, { type: 'room_cancelled' })
    } catch (err) {
      menuError(peer, err)
    }
    return
  }

  if (data.type === 'join_room') {
    try {
      const { room, match } = joinPrivateRoom(peer.menuToken, data.roomId)
      const guestMenu = getMenuSession(peer.menuToken)
      const hostMenu = getMenuSession(room.host_menu_token)
      const guestReady = matchReadyForMenu(guestMenu)
      const hostReady = matchReadyForMenu(hostMenu)

      if (guestReady) sendJson(peer, guestReady)
      const hostPeer = menuPeersByToken.get(room.host_menu_token)
      if (hostReady && hostPeer) sendJson(hostPeer, hostReady)
    } catch (err) {
      menuError(peer, err)
    }
  }
}

function handlePeerText(peer, text) {
  let data
  try { data = JSON.parse(text) } catch { return }

  if (!peer.authType) {
    if (data.type !== 'auth' || !data.token) {
      sendJson(peer, { type: 'error', code: 'AUTH_REQUIRED' })
      return
    }

    const authToken = String(data.token)
    const match = matchByToken(authToken)
    if (match) {
      registerPeerForMatch(peer, match, authToken)
      return
    }

    const menu = menuByToken(authToken)
    if (menu) {
      registerPeerForMenu(peer, menu)
      return
    }

    sendJson(peer, { type: 'error', code: 'INVALID_TOKEN' })
    return
  }

  if (peer.authType === 'menu') {
    handleMenuMessage(peer, data)
    return
  }

  if (peer.authType === 'match') handleMatchMessage(peer, data)
}

function onUpgrade(req, socket) {
  try {
    const url = new URL(req.url || '/', 'http://nexa.local')
    if (url.pathname !== '/chess') {
      socket.destroy()
      return
    }

    const key = req.headers['sec-websocket-key']
    if (!key) {
      socket.destroy()
      return
    }

    const accept = createHash('sha1')
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64')

    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n` +
      '\r\n'
    )

    const peer = {
      socket,
      buffer: Buffer.alloc(0),
      authType: null,
      matchId: null,
      color: null,
      menuToken: null
    }

    socket.on('data', chunk => parseFrames(peer, chunk, text => handlePeerText(peer, text)))
    socket.on('error', () => {})
    socket.on('close', () => {
      if (peer.matchId && peersByMatch.has(peer.matchId)) {
        const set = peersByMatch.get(peer.matchId)
        set.delete(peer)
        if (!set.size) peersByMatch.delete(peer.matchId)
      }
      if (peer.menuToken && menuPeersByToken.get(peer.menuToken) === peer) {
        menuPeersByToken.delete(peer.menuToken)
      }
    })
  } catch {
    socket.destroy()
  }
}

export function startChessRealtimeServer() {
  if (IS_CHILD) return null
  if (server) return server

  const requestHandler = (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('NEXA Chess realtime server')
  }

  if (TLS_CERT && TLS_KEY && fs.existsSync(TLS_CERT) && fs.existsSync(TLS_KEY)) {
    server = https.createServer(
      { cert: fs.readFileSync(TLS_CERT), key: fs.readFileSync(TLS_KEY) },
      requestHandler
    )
  } else {
    server = http.createServer(requestHandler)
  }

  server.on('upgrade', onUpgrade)
  server.on('error', err => console.error('♟️ Chess realtime server:', err?.message || err))
  server.listen(WS_PORT, WS_HOST, () => {
    console.log(`♟️ Chess realtime listening on ${WS_HOST}:${WS_PORT}`)
    if (!PUBLIC_WS_URL) {
      console.log('♟️ Chess multiplayer belum aktif: set NEXA_CHESS_WS_URL ke ws:// atau wss:// publik /chess')
    }
  })
  server.unref?.()
  return server
}
