import { createHmac, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
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

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''))
  const bb = Buffer.from(String(b || ''))
  if (aa.length !== bb.length) return false
  return timingSafeEqual(aa, bb)
}

function verifyTicket(token, secret) {
  const raw = String(token || '').trim()
  const dot = raw.lastIndexOf('.')
  if (dot < 1) return null
  const body = raw.slice(0, dot)
  const sig = raw.slice(dot + 1)
  const expected = createHmac('sha256', secret).update(body).digest('base64url')
  if (!safeEqual(sig, expected)) return null

  let payload
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) } catch { return null }
  if (payload?.v !== 1 || payload?.typ !== 'launch') return null
  if (!/^[a-f0-9]{64}$/i.test(String(payload?.pid || ''))) return null
  const now = Date.now()
  const iat = Number(payload?.iat || 0)
  const exp = Number(payload?.exp || 0)
  if (!Number.isFinite(iat) || !Number.isFinite(exp) || exp <= now || iat > now + 30_000) return null
  if (exp - iat > 5 * 60 * 1000) return null
  return payload
}

async function bestEffortDelete(adminClient, userId) {
  if (!adminClient || !userId) return
  try { await adminClient.auth.admin.deleteUser(userId) } catch {}
}

function fail(res, status, message) {
  res.statusCode = status
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="background:#08111f;color:#eaf2ff;font-family:system-ui;padding:28px"><h2>NEXA Chess</h2><p>${String(message).replace(/[<&]/g, '')}</p><p>Kembali ke WhatsApp lalu kirim <b>.catur</b> lagi.</p></body>`)
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return fail(res, 405, 'Method tidak didukung.')

  const apiSecret = String(process.env.NEXA_CHESS_API_SECRET || '').trim()
  const supabaseUrl = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '')
  const publishableKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || '').trim()
  const secretKey = String(process.env.SUPABASE_SECRET_KEY || '').trim()
  if (!apiSecret || !supabaseUrl || !publishableKey || !secretKey) {
    return fail(res, 503, 'Server multiplayer belum dikonfigurasi.')
  }

  const ticket = verifyTicket(req.query?.ticket, apiSecret)
  if (!ticket) return fail(res, 401, 'Link multiplayer tidak valid atau sudah kedaluwarsa.')

  const publicClient = makeClient(supabaseUrl, publishableKey)
  const adminClient = makeClient(supabaseUrl, secretKey)
  let userId = ''

  try {
    const { data: anonData, error: anonError } = await publicClient.auth.signInAnonymously()
    if (anonError || !anonData?.user || !anonData?.session?.refresh_token) {
      return fail(res, 502, `Supabase Auth gagal: ${anonError?.message || 'No anonymous session'}`)
    }

    userId = String(anonData.user.id || '')
    const refreshToken = String(anonData.session.refresh_token || '')
    const { error: adminError } = await adminClient.auth.admin.updateUserById(userId, {
      app_metadata: {
        nexa_chess: true,
        nexa_bot: String(ticket.bot || 'main').slice(0, 48),
        nexa_pid: String(ticket.pid || ''),
        nexa_name: String(ticket.name || 'NEXA Player').slice(0, 48)
      }
    })
    if (adminError) {
      await bestEffortDelete(adminClient, userId)
      return fail(res, 502, `Supabase metadata gagal: ${adminError.message || 'Unknown error'}`)
    }

    const { data: refreshed, error: refreshError } = await publicClient.auth.refreshSession({ refresh_token: refreshToken })
    const session = refreshed?.session
    const accessToken = String(session?.access_token || '')
    const expiresAt = Number(session?.expires_at || 0) * 1000
    if (refreshError || !accessToken || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      await bestEffortDelete(adminClient, userId)
      return fail(res, 502, `Supabase session gagal: ${refreshError?.message || 'No refreshed session'}`)
    }

    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim()
    const gatewayWsUrl = `wss://${host}/api/ws`
    const config = {
      transport: 'hosted-vercel-ws-supabase-v10',
      hostedMode: true,
      hostedLaunchUrl: '',
      gatewayWsUrl,
      vercelUrl: `https://${host}`,
      accessToken,
      sessionId: userId,
      sessionExpiresAt: expiresAt,
      playerId: String(ticket.pid),
      playerName: String(ticket.name || 'NEXA Player').slice(0, 48),
      multiplayerReady: true,
      isGroup: false,
      registered: true,
      multiplayerIssue: null
    }

    const packed = base64urlJson(config)
    res.statusCode = 302
    res.setHeader('cache-control', 'no-store')
    res.setHeader('location', `/play.html#${packed}`)
    res.end()
  } catch (err) {
    await bestEffortDelete(adminClient, userId)
    return fail(res, 502, `Server multiplayer gagal: ${err?.message || err || 'Unknown error'}`)
  }
}
