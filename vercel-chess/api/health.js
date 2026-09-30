export default function handler(_req, res) {
  const values = {
    apiSecretConfigured: Boolean(String(process.env.NEXA_CHESS_API_SECRET || '').trim()),
    supabaseUrlConfigured: Boolean(String(process.env.SUPABASE_URL || '').trim()),
    publishableKeyConfigured: Boolean(String(process.env.SUPABASE_PUBLISHABLE_KEY || '').trim()),
    secretKeyConfigured: Boolean(String(process.env.SUPABASE_SECRET_KEY || '').trim())
  }

  res.statusCode = 200
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify({
    ok: true,
    service: 'nexa-chess-vercel',
    transport: 'vercel-websocket-gateway+supabase-realtime',
    websocketPath: '/api/ws',
    authMode: 'supabase-anonymous-auth',
    ...values
  }))
}
