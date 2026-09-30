export default function handler(_req, res) {
  const apiSecretConfigured = Boolean(String(process.env.NEXA_CHESS_API_SECRET || '').trim())
  const jwtSecretConfigured = Boolean(String(process.env.SUPABASE_JWT_SECRET || '').trim())
  const supabaseUrlConfigured = Boolean(String(process.env.SUPABASE_URL || '').trim())

  res.statusCode = 200
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify({
    ok: true,
    service: 'nexa-chess-vercel',
    transport: 'supabase-realtime',
    apiSecretConfigured,
    jwtSecretConfigured,
    supabaseUrlConfigured
  }))
}
