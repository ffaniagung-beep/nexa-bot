import express from 'express'
import { createServer } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import { createClient } from '@supabase/supabase-js'

const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server })

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '')
const PUBLISHABLE_KEY = String(process.env.SUPABASE_PUBLISHABLE_KEY || '').trim()
const SECRET_KEY = String(process.env.SUPABASE_SECRET_KEY || '').trim()

function makeClient(key) {
  return createClient(SUPABASE_URL, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  })
}

function send(ws, payload) {
  if (ws.readyState !== WebSocket.OPEN) return false
  try {
    ws.send(JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

function closeWith(ws, code, reason) {
  try { ws.close(code, String(reason || '').slice(0, 120)) } catch {}
}

function validTopic(topic) {
  return /^nexa-chess-[A-Z0-9]{8}$/.test(String(topic || ''))
}

app.use((_req, res) => {
  res.status(426).json({
    ok: false,
    error: 'WEBSOCKET_REQUIRED',
    websocketPath: '/api/ws'
  })
})

wss.on('connection', (ws) => {
  let ready = false
  let roomTopic = ''
  let userId = ''
  let realtimeClient = null
  let channel = null
  let cleaned = false

  const cleanup = async () => {
    if (cleaned) return
    cleaned = true
    const currentClient = realtimeClient
    const currentChannel = channel
    realtimeClient = null
    channel = null
    try {
      if (currentClient && currentChannel) {
        await currentClient.removeChannel(currentChannel)
      }
    } catch {}
  }

  const reject = (error, detail, closeCode = 1008) => {
    send(ws, { type: 'error', error, detail: String(detail || '') })
    closeWith(ws, closeCode, error)
  }

  ws.on('message', async (raw) => {
    let msg
    try { msg = JSON.parse(String(raw)) } catch {
      return reject('BAD_JSON', 'Frame harus JSON.')
    }

    if (!ready) {
      if (msg?.type !== 'auth') {
        return reject('AUTH_REQUIRED', 'Kirim frame auth terlebih dahulu.')
      }

      if (!SUPABASE_URL || !PUBLISHABLE_KEY || !SECRET_KEY) {
        return reject('SERVER_NOT_CONFIGURED', 'Supabase env belum lengkap.', 1011)
      }

      const accessToken = String(msg?.accessToken || '').trim()
      const topic = String(msg?.topic || '').trim().toUpperCase()

      if (!accessToken) return reject('MISSING_TOKEN', 'Access token kosong.')
      if (!validTopic(topic)) return reject('INVALID_TOPIC', 'Room topic tidak valid.')

      try {
        const admin = makeClient(SECRET_KEY)
        const { data, error } = await admin.auth.getUser(accessToken)
        const user = data?.user

        if (error || !user) {
          return reject('INVALID_SESSION', error?.message || 'Session tidak valid.')
        }

        const meta = user.app_metadata || {}
        if (meta.nexa_chess !== true || !meta.nexa_bot) {
          return reject('CHESS_SESSION_REQUIRED', 'JWT bukan session NEXA Chess.')
        }

        userId = String(user.id || '')
        roomTopic = topic

        realtimeClient = makeClient(PUBLISHABLE_KEY)
        await realtimeClient.realtime.setAuth(accessToken)

        channel = realtimeClient.channel(roomTopic, {
          config: {
            private: true,
            broadcast: { ack: true, self: false },
            presence: { enabled: false }
          }
        })

        channel.on('broadcast', { event: 'nexa_chess' }, (packet) => {
          const payload = packet?.payload ?? packet ?? {}
          send(ws, {
            type: 'broadcast',
            event: 'nexa_chess',
            payload
          })
        })

        channel.subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            ready = true
            send(ws, {
              type: 'ready',
              topic: roomTopic,
              sessionId: userId
            })
            return
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || (ready && status === 'CLOSED')) {
            reject(
              'SUPABASE_CHANNEL_ERROR',
              err?.message || status,
              1011
            )
          }
        })
      } catch (err) {
        reject('GATEWAY_AUTH_FAILED', err?.message || err || 'Unknown error', 1011)
      }
      return
    }

    if (msg?.type === 'ping') {
      send(ws, { type: 'pong', t: Date.now() })
      return
    }

    if (msg?.type === 'broadcast') {
      if (!channel) return reject('CHANNEL_NOT_READY', 'Supabase channel belum siap.', 1011)
      if (String(msg?.event || '') !== 'nexa_chess') return

      try {
        const result = await channel.send({
          type: 'broadcast',
          event: 'nexa_chess',
          payload: msg?.payload || {}
        })

        if (result !== 'ok') {
          send(ws, {
            type: 'error',
            error: 'BROADCAST_FAILED',
            detail: String(result || 'unknown')
          })
        }
      } catch (err) {
        send(ws, {
          type: 'error',
          error: 'BROADCAST_FAILED',
          detail: String(err?.message || err || 'Unknown error')
        })
      }
    }
  })

  ws.on('close', cleanup)
  ws.on('error', cleanup)
})

export default server
