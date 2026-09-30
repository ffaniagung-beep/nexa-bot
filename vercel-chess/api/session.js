import { timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

function send(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
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

function makeClient(url, key) {
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  })
}

async function bestEffortDelete(adminClient, userId) {
  if (!adminClient || !userId) return
  try { await adminClient.auth.admin.deleteUser(userId) } catch {}
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST')
    return send(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' })
  }

  const apiSecret = String(process.env.NEXA_CHESS_API_SECRET || '').trim()
  const supabaseUrl = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '')
  const publishableKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || '').trim()
  const secretKey = String(process.env.SUPABASE_SECRET_KEY || '').trim()

  if (!apiSecret || !supabaseUrl || !publishableKey || !secretKey) {
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

  const publicClient = makeClient(supabaseUrl, publishableKey)
  const adminClient = makeClient(supabaseUrl, secretKey)
  let userId = ''

  try {
    // Let Supabase Auth mint a real modern user JWT. No legacy JWT secret needed.
    const { data: anonData, error: anonError } = await publicClient.auth.signInAnonymously()
    if (anonError || !anonData?.user || !anonData?.session?.refresh_token) {
      return send(res, 502, {
        ok: false,
        error: 'SUPABASE_ANON_SIGNIN_FAILED',
        detail: String(anonError?.message || 'No anonymous session')
      })
    }

    userId = String(anonData.user.id || '')
    const refreshToken = String(anonData.session.refresh_token || '')

    // Authorization claims belong in app_metadata because clients cannot edit it.
    const { error: adminError } = await adminClient.auth.admin.updateUserById(userId, {
      app_metadata: {
        nexa_chess: true,
        nexa_bot: bot || 'main',
        nexa_pid: pid,
        nexa_name: name || 'NEXA Player'
      }
    })

    if (adminError) {
      await bestEffortDelete(adminClient, userId)
      return send(res, 502, {
        ok: false,
        error: 'SUPABASE_METADATA_FAILED',
        detail: String(adminError.message || 'Unable to set app metadata')
      })
    }

    // Refresh once so the new app_metadata is actually embedded in the access JWT.
    const { data: refreshed, error: refreshError } = await publicClient.auth.refreshSession({
      refresh_token: refreshToken
    })

    const session = refreshed?.session
    const accessToken = String(session?.access_token || '')
    const expiresAt = Number(session?.expires_at || 0) * 1000

    if (refreshError || !accessToken || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      await bestEffortDelete(adminClient, userId)
      return send(res, 502, {
        ok: false,
        error: 'SUPABASE_REFRESH_FAILED',
        detail: String(refreshError?.message || 'No refreshed session')
      })
    }

    return send(res, 200, {
      ok: true,
      transport: 'supabase-realtime',
      authMode: 'supabase-anonymous-auth',
      sessionId: userId,
      accessToken,
      expiresAt
    })
  } catch (err) {
    await bestEffortDelete(adminClient, userId)
    return send(res, 502, {
      ok: false,
      error: 'SUPABASE_REQUEST_FAILED',
      detail: String(err?.message || err || 'Unknown Supabase error').slice(0, 300)
    })
  }
}
