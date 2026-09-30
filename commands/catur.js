import fs from 'fs'
import path from 'path'

import { MB } from '@rexxhayanasi/elaina-baileys'

import { getUser } from '../lib/userdb.js'
import { getProfileJid, resolveProfileJid } from '../lib/profile.js'
import {
  createChessMenuSession,
  getChessRealtimeConfig,
  chessMultiplayerConfigured
} from '../lib/chessRealtime.js'

const GAME_FILE = path.resolve('./arcade/chess.html')

async function sendTrustedChessApp(sock, jid, html, { origin, title, height = 610 } = {}) {
  const base = String(origin || '').trim()
  if (!base) throw new Error('CHESS_TRUSTED_ORIGIN_MISSING')

  let parsed
  try {
    parsed = new URL(base)
  } catch {
    throw new Error('CHESS_TRUSTED_ORIGIN_INVALID')
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('CHESS_TRUSTED_ORIGIN_REQUIRES_HTTPS')
  }

  const trustedSources = ['nexa.local', parsed.hostname].filter(Boolean)
  const section = MB.htmlSection(html, { trustedSources, height })
  const primitive = section?.view_model?.primitive

  if (!primitive || typeof primitive !== 'object') {
    throw new Error('CHESS_HTML_PRIMITIVE_NOT_FOUND')
  }

  // Elaina 1.4.2 normally sends HTML mini-apps on an opaque about:blank
  // origin. WhatsApp Android also understands a `url` field on the HTML
  // primitive. Supplying our HTTPS Vercel origin gives the embedded WebView
  // a real base origin while keeping the game inside the WhatsApp bubble.
  primitive.url = `${parsed.origin}/`

  const rich = new MB.AIRich(sock).setTitle(title || '⚡ NEXA ARCADE')
  rich.addSection(section, { id: 'nexa-chess-app' })
  return rich.send(jid)
}

function injectConfig(html, config) {
  return String(html).replace(
    '__NEXA_CHESS_CONFIG__',
    JSON.stringify(config).replace(/</g, '\\u003c')
  )
}

export default {
  name: 'catur',
  aliases: ['chess'],
  category: 'MINI GAME',
  description: 'Main catur vs NEXA AI atau player lain',
  usage: '.catur',

  async run({ sock, msg, jid, isOwner = false }) {
    if (!fs.existsSync(GAME_FILE)) {
      return sock.sendMessage(
        jid,
        { text: '❌ File NEXA Chess tidak ditemukan.' },
        { quoted: msg }
      )
    }

    let playerJid = null
    try {
      playerJid = await resolveProfileJid(sock, msg, jid)
    } catch {}

    playerJid =
      playerJid ||
      getProfileJid(msg, jid) ||
      msg?.key?.participantAlt ||
      msg?.key?.participant ||
      msg?.participant ||
      msg?.key?.remoteJidAlt ||
      jid

    const identityCandidates = [
      playerJid,
      msg?.key?.participantAlt,
      msg?.key?.remoteJidAlt,
      msg?.key?.participant,
      msg?.participant,
      msg?.key?.remoteJid,
      jid
    ].filter(Boolean)

    let user = null
    let registered = Boolean(isOwner)

    for (const candidate of identityCandidates) {
      const candidateUser = getUser(candidate)
      if (!user && candidateUser?.playerId) user = candidateUser
      if (candidateUser?.registeredAt) {
        user = candidateUser
        registered = true
        break
      }
    }

    user = user || getUser(playerJid)

    const isGroup = String(jid).endsWith('@g.us')
    const realtime = getChessRealtimeConfig()
    let multiplayerReady =
      !isGroup && registered && chessMultiplayerConfigured()

    let session = null
    let multiplayerIssue = null

    if (multiplayerReady) {
      try {
        session = await createChessMenuSession({
          chatJid: jid,
          playerJid,
          registrationVerified: registered
        })
      } catch (err) {
        multiplayerReady = false
        multiplayerIssue = String(err?.message || err || 'CHESS_SESSION_ERROR')
        console.error('♟️ NEXA Chess Supabase/Vercel session:', err)
      }
    }

    const html = injectConfig(
      fs.readFileSync(GAME_FILE, 'utf8'),
      {
        transport: 'vercel-ws-supabase-v2',
        gatewayWsUrl: realtime.gatewayWsUrl,
        vercelUrl: realtime.vercelUrl,
        accessToken: session?.accessToken || null,
        sessionId: session?.sessionId || null,
        sessionExpiresAt: session?.expiresAt || null,
        playerId: session?.playerId || null,
        playerName: session?.playerName || String(user?.name || 'NEXA Player').slice(0, 48),
        multiplayerReady,
        isGroup,
        registered,
        multiplayerIssue
      }
    )

    try {
      await sendTrustedChessApp(sock, jid, html, {
        origin: realtime.vercelUrl,
        title: '⚡ NEXA ARCADE',
        height: 610
      })
    } catch (err) {
      console.error('♟️ NEXA Chess:', err)

      await sock.sendMessage(
        jid,
        {
          text:
            `❌ *NEXA CHESS ERROR*\n\n` +
            `${err?.message || err}`
        },
        { quoted: msg }
      )
    }
  }
}
