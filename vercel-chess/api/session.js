import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

function send(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

function b64url(input) {
  return Buffer.from(input).toString('base64url')
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''))
  const bb = Buffer.from(String(b || ''))
  if (aa.length !== bb.length) return false
  return timingSafeEqual(aa, bb)
}

function bearer(req) {
  const raw = String(req.headers?.authorization || '')
  const match = raw.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : ''
}

function signJwt(payload, secret) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  const data = `${header}.${body}`
  const sig = createHmac('sha256', secret).update(data).digest('base64url')
  return `${data}.${sig}`
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body) } catch { return {} }
  }

  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > 16_384) throw new Error('BODY_TOO_LARGE')
  }
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { return {} }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST')
    return send(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' })
  }

  const apiSecret = String(process.env.NEXA_CHESS_API_SECRET || '').trim()
  const jwtSecret = String(process.env.SUPABASE_JWT_SECRET || '').trim()
  const supabaseUrl = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '')

  if (!apiSecret || !jwtSecret || !supabaseUrl) {
    return send(res, 503, { ok: false, error: 'SERVER_NOT_CONFIGURED' })
  }

  if (!safeEqual(bearer(req), apiSecret)) {
    return send(res, 401, { ok: false, error: 'UNAUTHORIZED' })
  }

  let body
  try {
    body = await readJson(req)
  } catch {
    return send(res, 400, { ok: false, error: 'BAD_JSON' })
  }

  const pid = String(body?.pid || '').trim()
  const name = String(body?.name || 'NEXA Player').trim().slice(0, 48)
  const bot = String(body?.bot || 'main').trim().slice(0, 48)

  if (!/^[a-f0-9]{64}$/i.test(pid)) {
    return send(res, 400, { ok: false, error: 'INVALID_PLAYER' })
  }

  const now = Math.floor(Date.now() / 1000)
  const exp = now + (2 * 60 * 60)
  const sessionId = randomUUID()

  const accessToken = signJwt({
    iss: `${supabaseUrl}/auth/v1`,
    aud: 'authenticated',
    role: 'authenticated',
    sub: sessionId,
    iat: now,
    exp,
    aal: 'aal1',
    session_id: sessionId,
    email: '',
    phone: '',
    is_anonymous: true,
    nexa_pid: pid,
    nexa_name: name || 'NEXA Player',
    nexa_bot: bot
  }, jwtSecret)

  return send(res, 200, {
    ok: true,
    transport: 'supabase-realtime',
    sessionId,
    accessToken,
    expiresAt: exp * 1000
  })
}
